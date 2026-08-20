import { PreTrainedTokenizer } from '@huggingface/transformers'
import * as ort from 'onnxruntime-web/webgpu'
import type { ClassifierRepository } from './classifier-repository'
import { validateSupportedContract, type SlopHammerContract } from './contract'
import {
  ModelIntegrityError,
  selectExecutionProvider,
  type ProviderAttempt,
  type RuntimeDiagnostics,
  type RuntimeExecutionProvider,
  type WebGpuProbe,
} from './execution-provider'
import { OnnxClassifierRepository } from './onnx-classifier-repository'
import type { InferenceSessionLike, TokenizerLike } from './onnx-deps'
import { wasmSessionOptions, webGpuSessionOptions } from './onnx-session-options'
import { loadAllModelFiles, type ReadProgress } from './opfs-model-reader'
import { resolveRuntimeContract } from './runtime-contract'
import { chooseWasmThreadCount } from './wasm-runtime'

interface PreparedModel {
  contract: SlopHammerContract
  tokenizer: TokenizerLike
  tokenizerPadding?: { direction?: unknown; pad_id?: unknown }
  model: Uint8Array
  externalData: Array<{ data: Uint8Array; path: string }>
}

export interface SetupOnnxClassifierOptions {
  runtimeBaseUrl: string
  onProgress?: (progress: ReadProgress) => void
  onAttempt?: (attempt: ProviderAttempt) => void
}

async function probeWebGpu(): Promise<WebGpuProbe<GPUAdapter>> {
  const nav = navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<GPUAdapter | null> }
  }
  if (!nav.gpu) {
    return { available: false, reason: 'WebGPU is not exposed by this Chrome build.' }
  }
  const adapter = await nav.gpu.requestAdapter()
  if (!adapter) {
    return { available: false, reason: 'No compatible WebGPU adapter was found.' }
  }
  return { available: true, adapter }
}

/**
 * Load and validate the pinned model once, prefer WebGPU, then retry session
 * construction with the local CPU/WASM provider. Both attempts reuse the same
 * tokenizer and model buffers; no network request or second OPFS read occurs.
 */
export async function setupOnnxClassifier(
  options: SetupOnnxClassifierOptions,
): Promise<ClassifierRepository> {
  const { runtimeBaseUrl, onProgress, onAttempt } = options
  const isolated = globalThis.crossOriginIsolated === true

  // Start reading the model now. It is independent of the WebGPU probe, and
  // awaiting the probe first added adapter-creation latency (which can be
  // seconds on a cold GPU stack) to every cold start.
  const preparing = loadAllModelFiles(onProgress).then((files): PreparedModel => {
    const contract: unknown = JSON.parse(files.contractJson)
    validateSupportedContract(contract)

    const tokenizerConfig = JSON.parse(files.tokenizerConfigJson)
    const tokenizerData = JSON.parse(files.tokenizerJson)
    const tokenizer = new PreTrainedTokenizer(tokenizerData, tokenizerConfig)

    return {
      contract,
      tokenizer: tokenizer as unknown as TokenizerLike,
      tokenizerPadding: (tokenizerData as {
        padding?: { direction?: unknown; pad_id?: unknown }
      }).padding,
      model: new Uint8Array(files.modelOnnx),
      externalData: files.modelDataShards.map((shard) => ({
        data: new Uint8Array(shard.data),
        path: shard.path,
      })),
    }
  })
  // Attach a handler immediately: if this rejects while the probe is still
  // pending, an unattached rejection surfaces as an unhandled error in the
  // worker and trips the QA suite's console check.
  preparing.catch(() => {})

  // Probe before touching the ORT environment: its flags are global and are
  // read when the first session is created, so the thread count has to be
  // decided up front.
  let probe: WebGpuProbe<GPUAdapter>
  try {
    probe = await probeWebGpu()
  } catch (error) {
    probe = {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  // The WebGPU path never runs an operator on the WASM backend, so asking for a
  // thread pool there only spawns pthreads that park in `Atomics.wait` for the
  // lifetime of the session. Reserve the pool for the path that uses it.
  //
  // The cost is that a WebGPU *session* failure falls back single-threaded,
  // because the WASM module is already initialised by then. That is the rare
  // path; the common ones — WebGPU works, or no adapter at all — both get the
  // right pool.
  const wasmThreads = probe.available
    ? 1
    : chooseWasmThreadCount({
        crossOriginIsolated: isolated,
        hardwareConcurrency: navigator.hardwareConcurrency,
      })

  // ORT environment flags are global and must be set before its first session.
  // Our dedicated classifier worker provides responsiveness and serialization,
  // so ORT's additional proxy worker is deliberately disabled.
  ort.env.wasm.wasmPaths = runtimeBaseUrl
  ort.env.wasm.numThreads = wasmThreads
  ort.env.wasm.proxy = false
  ort.env.logLevel = 'error'

  // Resolve the model before provider selection, and label its failures as what
  // they are. Raising them inside a provider attempt made a corrupt or retired
  // install look like a dual-provider failure — the user was told to restart
  // Chrome instead of to reinstall the model, and the second attempt wasted a
  // full session build on a failure that has nothing to do with the provider.
  let model: PreparedModel
  try {
    model = await preparing
  } catch (error) {
    throw new ModelIntegrityError(error instanceof Error ? error.message : String(error))
  }

  const createRepository = async (
    provider: RuntimeExecutionProvider,
    fallbackReason?: string,
  ): Promise<ClassifierRepository> => {
    const session = await ort.InferenceSession.create(
      model.model,
      provider === 'webgpu'
        ? webGpuSessionOptions(model.externalData)
        : wasmSessionOptions(model.externalData),
    )

    let runtime
    try {
      runtime = resolveRuntimeContract({
        contract: model.contract,
        tokenizerPadId:
          (model.tokenizer as unknown as { pad_token_id?: number }).pad_token_id ?? null,
        tokenizerPadding: model.tokenizerPadding,
        sessionOutputNames: session.outputNames,
      })
    } catch (error) {
      // Swallow a failing release: letting it propagate would replace the
      // ModelIntegrityError with the release error, and the fallback guard that
      // keys off the type would miss — burning a second full session build to
      // fail identically.
      await session.release().catch(() => {})
      // Reconciling the contract with the session's outputs is about the model,
      // not the provider: retrying on the fallback rebuilds a full session only
      // to fail identically.
      throw new ModelIntegrityError(error instanceof Error ? error.message : String(error))
    }

    try {
      const runtimeDiagnostics: RuntimeDiagnostics = {
        executionProvider: provider,
        wasmThreads,
        crossOriginIsolated: isolated,
        ...(fallbackReason ? { fallbackReason } : {}),
      }

      return new OnnxClassifierRepository({
        tokenizer: model.tokenizer,
        session: session as unknown as InferenceSessionLike,
        contract: model.contract,
        createTensor: (kind, data, dims) => new ort.Tensor(kind, data, dims),
        runtime,
        runtimeDiagnostics,
      })
    } catch (error) {
      await session.release().catch(() => {})
      throw error
    }
  }

  const selected = await selectExecutionProvider({
    probeWebGpu: async () => probe,
    createWebGpu: async (adapter) => {
      // Reuse the adapter that proved WebGPU availability instead of probing a
      // second time inside ORT, which can race a device/driver state change.
      ort.env.webgpu.adapter = adapter
      return createRepository('webgpu')
    },
    createWasm: (fallbackReason) => createRepository('wasm', fallbackReason),
    onAttempt,
  })

  return selected.value
}
