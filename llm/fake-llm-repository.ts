import type { LlmRepository } from './llm-repository'

export class FakeLlmRepository implements LlmRepository {
  async scoreSlop(text: string): Promise<number> {
    let h = 2166136261 >>> 0
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    return (h % 1000) / 1000
  }
}
