import type { ClassifyResult } from './classify-result'
import type { RuntimeDiagnostics } from './execution-provider'

export type ClassifierWorkerRequest =
  | { type: 'init'; runtimeBaseUrl: string }
  | { type: 'classify'; requestId: string; text: string }
  | { type: 'dispose'; requestId: string }

export type ClassifierWorkerResponse =
  | { type: 'init:progress'; bytesRead: number; totalBytes: number }
  | { type: 'init:attempt'; provider: 'webgpu' | 'wasm'; fallbackReason?: string }
  | { type: 'init:ready'; diagnostics: RuntimeDiagnostics }
  | { type: 'init:error'; error: string; diagnostic?: string }
  | { type: 'classify:result'; requestId: string; result: ClassifyResult }
  | { type: 'classify:error'; requestId: string; error: string }
  | { type: 'dispose:done'; requestId: string }
