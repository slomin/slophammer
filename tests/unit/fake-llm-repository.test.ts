import { describe, expect, it } from 'vitest'
import { FakeLlmRepository } from '@/llm/fake-llm-repository'

describe('FakeLlmRepository', () => {
  const repo = new FakeLlmRepository()

  it('returns a number in [0, 1]', async () => {
    const score = await repo.scoreSlop('hello world')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('is deterministic for the same input', async () => {
    const a = await repo.scoreSlop('the quick brown fox')
    const b = await repo.scoreSlop('the quick brown fox')
    expect(a).toBe(b)
  })

  it('produces different scores for different inputs', async () => {
    const a = await repo.scoreSlop('one')
    const b = await repo.scoreSlop('two')
    const c = await repo.scoreSlop('three')
    expect(new Set([a, b, c]).size).toBe(3)
  })

  it('handles empty input', async () => {
    const score = await repo.scoreSlop('')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})
