import { describe, expect, it } from 'vitest'
import { FakeClassifierRepository } from '@/llm/fake-classifier-repository'
import { RAW_CLASS_LABEL, VERDICT_HEADLINE, VERDICT_PRIMARY_LABEL } from '@/llm/classify-result'

describe('FakeClassifierRepository', () => {
  const repo = new FakeClassifierRepository()

  describe('shape', () => {
    it('returns probs as a 4-tuple summing to ~1', async () => {
      const r = await repo.classify('the quick brown fox')
      expect(r.probs).toHaveLength(4)
      const sum = r.probs.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 10)
      for (const p of r.probs) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1)
      }
    })

    it('rawPct mirrors probs scaled to 0..100', async () => {
      const r = await repo.classify('sample text')
      for (let i = 0; i < 4; i++) {
        expect(r.rawPct[i]).toBeCloseTo(r.probs[i]! * 100, 5)
      }
    })

    it('aiScore equals 1 - probs[0]', async () => {
      const r = await repo.classify('any text at all')
      expect(r.aiScore).toBeCloseTo(1 - r.probs[0]!, 10)
    })

    it('verdict, primaryLabel, and headline agree', async () => {
      const r = await repo.classify('longer sample text for classifier fake')
      expect(r.primaryLabel).toBe(VERDICT_PRIMARY_LABEL[r.verdict])
      expect(r.headline).toBe(VERDICT_HEADLINE[r.verdict])
      expect(RAW_CLASS_LABEL.length).toBe(4)
    })

    it('single-segment mode: exactly one of aiPct/mixedPct/humanPct is 100, others 0', async () => {
      const r = await repo.classify('hello world')
      const buckets = [r.humanPct, r.mixedPct, r.aiPct]
      expect(buckets.filter((v) => v === 100)).toHaveLength(1)
      expect(buckets.filter((v) => v === 0)).toHaveLength(2)
      expect(r.primaryPct).toBe(100)
    })

    it('tokenCount is positive and truncated is boolean', async () => {
      const r = await repo.classify('word one word two word three')
      expect(r.tokenCount).toBeGreaterThan(0)
      expect(typeof r.truncated).toBe('boolean')
    })
  })

  describe('determinism', () => {
    it('returns identical results for identical input', async () => {
      const a = await repo.classify('repeat me repeat me repeat me')
      const b = await repo.classify('repeat me repeat me repeat me')
      expect(a).toEqual(b)
    })

    it('returns different probs for different inputs (statistically)', async () => {
      const inputs = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']
      const probsSeen = new Set<string>()
      for (const txt of inputs) {
        const r = await repo.classify(txt)
        probsSeen.add(r.probs.join(','))
      }
      expect(probsSeen.size).toBeGreaterThan(1)
    })
  })

  describe('edge cases', () => {
    it('handles empty string without throwing', async () => {
      const r = await repo.classify('')
      expect(r.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    })
  })
})
