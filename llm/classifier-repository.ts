import type { ClassifyResult } from './classify-result'

export interface ClassifierRepository {
  classify(text: string): Promise<ClassifyResult>
}
