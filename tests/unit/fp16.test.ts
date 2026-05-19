import { describe, expect, it } from 'vitest'
import { fp16ToFp32 } from '@/llm/fp16'

describe('fp16ToFp32', () => {
  it('0x0000 → +0', () => {
    expect(fp16ToFp32(0x0000)).toBe(0)
  })

  it('0x8000 → -0', () => {
    expect(Object.is(fp16ToFp32(0x8000), -0)).toBe(true)
  })

  it('0x3c00 → 1.0', () => {
    expect(fp16ToFp32(0x3c00)).toBeCloseTo(1.0, 6)
  })

  it('0xbc00 → -1.0', () => {
    expect(fp16ToFp32(0xbc00)).toBeCloseTo(-1.0, 6)
  })

  it('0x4000 → 2.0', () => {
    expect(fp16ToFp32(0x4000)).toBeCloseTo(2.0, 6)
  })

  it('0x4200 → 3.0', () => {
    expect(fp16ToFp32(0x4200)).toBeCloseTo(3.0, 6)
  })

  it('0x7c00 → +Infinity', () => {
    expect(fp16ToFp32(0x7c00)).toBe(Infinity)
  })

  it('0xfc00 → -Infinity', () => {
    expect(fp16ToFp32(0xfc00)).toBe(-Infinity)
  })

  it('0x7c01 → NaN (non-zero mantissa with all-ones exponent)', () => {
    expect(Number.isNaN(fp16ToFp32(0x7c01))).toBe(true)
  })

  it('denormals: 0x0001 → 2^-24 ≈ 5.96e-8', () => {
    expect(fp16ToFp32(0x0001)).toBeCloseTo(Math.pow(2, -24), 10)
  })
})
