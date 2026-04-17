import { FakeLlmRepository } from './fake-llm-repository'
import type { LlmRepository } from './llm-repository'

export type { LlmRepository } from './llm-repository'

export function createLlmRepository(): LlmRepository {
  return new FakeLlmRepository()
}
