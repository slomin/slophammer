import { describe, expect, it } from 'vitest'
import { FakeClassifierRepository } from '@/llm/fake-classifier-repository'
import { RAW_CLASS_LABEL } from '@/llm/classify-result'

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

    it('returns the calibrated score, threshold and contract labels', async () => {
      const r = await repo.classify('any text at all')
      expect(Number.isFinite(r.extLlr)).toBe(true)
      expect(r.threshold).toBe(3.8088)
      expect(r.bucketLabels).toEqual(RAW_CLASS_LABEL)
    })

    it('verdict is one of the calibrated classes', async () => {
      const r = await repo.classify('longer sample text for classifier fake')
      expect(['flagged', 'near-threshold', 'not-flagged']).toContain(r.verdict)
      expect(RAW_CLASS_LABEL.length).toBe(4)
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
