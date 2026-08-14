import type { ClassifyResult } from './classify-result'

export interface ClassifierRepository {
  classify(text: string): Promise<ClassifyResult>
  /**
   * Release the underlying session. The ONNX session holds the full model
   * weights in wasm memory plus GPU buffers, so replacing a repository without
   * this leaks a model-sized allocation per model install.
   */
  dispose?(): Promise<void>
}
