import { describe, expect, it } from 'vitest'
import { computeExtLlr, decideVerdict, formatPct, softmax } from '@/llm/classify-result'

describe('softmax', () => {
  it('is stable and sums to one for large logits', () => {
    const out = softmax([1000, 1000.1, 1000.2, 1000.3])
    expect(out.every(Number.isFinite)).toBe(true)
    expect(out.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10)
  })
})
describe('calibrated decision', () => {
  it('computes ln(p2+p3)-ln(p0) without infinities at zero', () => {
    expect(computeExtLlr([0.5, 0.1, 0.2, 0.2])).toBeCloseTo(Math.log(0.4) - Math.log(0.5))
    expect(Number.isFinite(computeExtLlr([0, 1, 0, 0]))).toBe(true)
  })

  it('uses strict boundaries at tau and tau-abstainBand', () => {
    const tau = 3.8088
    const lower = tau - 1.5
    expect(decideVerdict(tau + Number.EPSILON * 32, tau, 1.5)).toBe('flagged')
    expect(decideVerdict(tau, tau, 1.5)).toBe('near-threshold')
    expect(decideVerdict(lower + Number.EPSILON * 32, tau, 1.5)).toBe('near-threshold')
    expect(decideVerdict(lower, tau, 1.5)).toBe('not-flagged')
    expect(decideVerdict(lower - 0.001, tau, 1.5)).toBe('not-flagged')
  })
})

describe('formatPct', () => {
  it('keeps truthful raw bucket precision', () => {
    expect(formatPct(42)).toBe('42')
    expect(formatPct(42.5)).toBe('42.5')
    expect(formatPct(0.001)).toBe('0.1')
    expect(formatPct(99.95)).toBe('100')
  })
})
