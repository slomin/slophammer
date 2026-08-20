import { PreTrainedTokenizer } from '@huggingface/transformers'
import * as ort from 'onnxruntime-web/webgpu'
import type { ClassifierRepository } from './classifier-repository'
import { validateSupportedContract, type SlopHammerContract } from './contract'
import {
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
  const wasmThreads = chooseWasmThreadCount({
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

  const prepared = loadAllModelFiles(onProgress).then((files): PreparedModel => {
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

  const createRepository = async (
    provider: RuntimeExecutionProvider,
    fallbackReason?: string,
  ): Promise<ClassifierRepository> => {
    const model = await prepared
    const session = await ort.InferenceSession.create(
      model.model,
      provider === 'webgpu'
        ? webGpuSessionOptions(model.externalData)
        : wasmSessionOptions(model.externalData),
    )

    try {
      const runtime = resolveRuntimeContract({
        contract: model.contract,
        tokenizerPadId:
          (model.tokenizer as unknown as { pad_token_id?: number }).pad_token_id ?? null,
        tokenizerPadding: model.tokenizerPadding,
        sessionOutputNames: session.outputNames,
      })
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
      await session.release()
      throw error
    }
  }

  const selected = await selectExecutionProvider({
    probeWebGpu,
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
