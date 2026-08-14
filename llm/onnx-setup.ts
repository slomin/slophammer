import * as ort from 'onnxruntime-web/webgpu'
import { PreTrainedTokenizer } from '@huggingface/transformers'
import type { ClassifierRepository } from './classifier-repository'
import { validateContract } from './contract'
import { OnnxClassifierRepository } from './onnx-classifier-repository'
import { resolveRuntimeContract } from './runtime-contract'
import type { InferenceSessionLike, TokenizerLike } from './onnx-deps'
import { loadAllModelFiles, type ReadProgress } from './opfs-model-reader'

ort.env.wasm.wasmPaths = chrome.runtime.getURL('ort/')
ort.env.wasm.numThreads = 1

interface GpuAdapterLite {
  features: ReadonlySet<string>
  info?: { vendor?: string; architecture?: string }
}

async function assertWebGPU(): Promise<void> {
  const nav = navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<GpuAdapterLite | null> }
  }
  if (!nav.gpu) throw new Error('WebGPU is not available in this browser.')
  const adapter = await nav.gpu.requestAdapter()
  if (!adapter) throw new Error('No WebGPU adapter found. Your GPU may not support WebGPU.')
}

export async function setupOnnxClassifier(
  onProgress?: (p: ReadProgress) => void,
): Promise<ClassifierRepository> {
  await assertWebGPU()

  const files = await loadAllModelFiles(onProgress)

  const contract: unknown = JSON.parse(files.contractJson)
  validateContract(contract)

  const tokenizerCfg = JSON.parse(files.tokenizerConfigJson)
  const tokenizerData = JSON.parse(files.tokenizerJson)
  const tokenizer = new PreTrainedTokenizer(tokenizerData, tokenizerCfg)

  const externalData = files.modelDataShards.map((s) => ({
    data: new Uint8Array(s.data),
    path: s.path,
  }))
  const session = await ort.InferenceSession.create(new Uint8Array(files.modelOnnx), {
    executionProviders: ['webgpu'],
    externalData,
  })

  // tokenizer.json carries the tokenizer's own padding declaration
  // ({direction, pad_id}); the session declares its output names. Both are
  // authoritative, so nothing has to be guessed.
  const runtime = resolveRuntimeContract({
    contract,
    tokenizerPadId: (tokenizer as unknown as { pad_token_id?: number }).pad_token_id ?? null,
    tokenizerPadding: (tokenizerData as { padding?: { direction?: unknown; pad_id?: unknown } }).padding,
    sessionOutputNames: session.outputNames,
  })

  return new OnnxClassifierRepository({
    tokenizer: tokenizer as unknown as TokenizerLike,
    session: session as unknown as InferenceSessionLike,
    contract,
    createTensor: (kind, data, dims) => new ort.Tensor(kind, data, dims),
    runtime,
  })
}
