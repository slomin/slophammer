import type { ClassifyResult } from './classify-result'
import type { RuntimeDiagnostics } from './execution-provider'

export interface ClassifierRepository {
  /** Quiet support/QA metadata. Never shown on the normal result card. */
  readonly runtimeDiagnostics?: RuntimeDiagnostics
  classify(text: string): Promise<ClassifyResult>
  /**
   * Release the underlying session. The ONNX session holds the full model
   * weights in wasm memory plus GPU buffers, so replacing a repository without
   * this leaks a model-sized allocation per model install.
   */
  dispose?(): Promise<void>
}
