import type { ClassifierRepository } from './classifier-repository'
import { FakeClassifierRepository } from './fake-classifier-repository'

export type { ClassifierRepository } from './classifier-repository'
export type { ClassifyResult, RawProbs, Verdict, PrimaryLabel } from './classify-result'

export function createClassifierRepository(): ClassifierRepository {
  return new FakeClassifierRepository()
}
