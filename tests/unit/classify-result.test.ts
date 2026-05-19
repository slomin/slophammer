import { describe, expect, it } from 'vitest'
import {
  argmax4,
  bucketFromArgmax,
  formatPct,
  softmax,
  type RawProbs,
} from '@/llm/classify-result'

describe('softmax', () => {
  it('returns values that sum to 1', () => {
    const out = softmax([1, 2, 3, 4])
    const sum = out.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it('all outputs are in (0, 1)', () => {
    for (const v of softmax([-5, 0, 5, 10])) {
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is numerically stable for large inputs', () => {
    const out = softmax([1000, 1000.1, 1000.2, 1000.3])
    expect(out.every(Number.isFinite)).toBe(true)
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('places the highest mass on the largest logit', () => {
    const out = softmax([0, 1, 5, 2])
    const maxIdx = out.indexOf(Math.max(...out))
    expect(maxIdx).toBe(2)
  })
})

describe('argmax4', () => {
  it('returns 0 when first is largest', () => {
    expect(argmax4([0.7, 0.1, 0.1, 0.1])).toBe(0)
  })

  it('returns 3 when last is largest', () => {
    expect(argmax4([0.1, 0.1, 0.1, 0.7])).toBe(3)
  })

  it('returns the first max index on ties', () => {
    expect(argmax4([0.25, 0.25, 0.25, 0.25])).toBe(0)
  })

  it('handles middle indices', () => {
    expect(argmax4([0.1, 0.6, 0.2, 0.1])).toBe(1)
    expect(argmax4([0.1, 0.1, 0.6, 0.2])).toBe(2)
  })
})

describe('bucketFromArgmax', () => {
  it('class 0 → human', () => {
    expect(bucketFromArgmax(0)).toBe('human')
  })

  it('class 3 → ai', () => {
    expect(bucketFromArgmax(3)).toBe('ai')
  })

  it('classes 1 and 2 → mixed', () => {
    expect(bucketFromArgmax(1)).toBe('mixed')
    expect(bucketFromArgmax(2)).toBe('mixed')
  })
})

describe('formatPct', () => {
  it('formats whole numbers without decimals', () => {
    expect(formatPct(42)).toBe('42')
    expect(formatPct(99)).toBe('99')
  })

  it('keeps a single decimal for non-integers', () => {
    expect(formatPct(42.5)).toBe('42.5')
    expect(formatPct(3.1)).toBe('3.1')
  })

  it('clamps 99.95 and above to "100"', () => {
    expect(formatPct(99.95)).toBe('100')
    expect(formatPct(99.99)).toBe('100')
    expect(formatPct(100)).toBe('100')
  })

  it('shows "0.1" for tiny positive values', () => {
    expect(formatPct(0.05)).toBe('0.1')
    expect(formatPct(0.001)).toBe('0.1')
  })

  it('formats zero as "0"', () => {
    expect(formatPct(0)).toBe('0')
  })
})

describe('type: RawProbs', () => {
  it('compiles as a 4-tuple of numbers', () => {
    const probs: RawProbs = [0.1, 0.2, 0.3, 0.4]
    expect(probs.length).toBe(4)
  })
})
