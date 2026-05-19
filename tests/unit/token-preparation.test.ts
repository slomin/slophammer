import { describe, expect, it } from 'vitest'
import { padInputIds } from '@/llm/token-preparation'

const tokens = (xs: number[]) => BigInt64Array.from(xs.map(BigInt))
const arr = (a: BigInt64Array) => Array.from(a, (x) => Number(x))

describe('padInputIds — no truncation', () => {
  it('right-pads short input with padId and zeros attention on pad positions', () => {
    const out = padInputIds({
      tokens: tokens([11, 12, 13]),
      maxSeq: 5,
      padId: 0n,
      padSide: 'right',
    })
    expect(arr(out.inputIds)).toEqual([11, 12, 13, 0, 0])
    expect(arr(out.attnMask)).toEqual([1, 1, 1, 0, 0])
    expect(out.origLen).toBe(3)
    expect(out.seqLen).toBe(3)
    expect(out.truncated).toBe(false)
  })

  it('left-pads short input with padId and zeros attention on pad positions', () => {
    const out = padInputIds({
      tokens: tokens([11, 12, 13]),
      maxSeq: 5,
      padId: 0n,
      padSide: 'left',
    })
    expect(arr(out.inputIds)).toEqual([0, 0, 11, 12, 13])
    expect(arr(out.attnMask)).toEqual([0, 0, 1, 1, 1])
    expect(out.origLen).toBe(3)
    expect(out.seqLen).toBe(3)
    expect(out.truncated).toBe(false)
  })

  it('uses the given padId (not always 0)', () => {
    const out = padInputIds({
      tokens: tokens([1]),
      maxSeq: 3,
      padId: 7n,
      padSide: 'right',
    })
    expect(arr(out.inputIds)).toEqual([1, 7, 7])
  })
})

describe('padInputIds — exact fit', () => {
  it('no padding when tokens fill maxSeq', () => {
    const out = padInputIds({
      tokens: tokens([1, 2, 3]),
      maxSeq: 3,
      padId: 0n,
      padSide: 'right',
    })
    expect(arr(out.inputIds)).toEqual([1, 2, 3])
    expect(arr(out.attnMask)).toEqual([1, 1, 1])
    expect(out.truncated).toBe(false)
  })
})

describe('padInputIds — truncation', () => {
  it('keeps the last maxSeq tokens (left-pad variant)', () => {
    const out = padInputIds({
      tokens: tokens([1, 2, 3, 4, 5, 6]),
      maxSeq: 4,
      padId: 0n,
      padSide: 'left',
    })
    expect(arr(out.inputIds)).toEqual([3, 4, 5, 6])
    expect(arr(out.attnMask)).toEqual([1, 1, 1, 1])
    expect(out.origLen).toBe(6)
    expect(out.seqLen).toBe(4)
    expect(out.truncated).toBe(true)
  })

  it('keeps the last maxSeq tokens (right-pad variant)', () => {
    const out = padInputIds({
      tokens: tokens([1, 2, 3, 4, 5, 6]),
      maxSeq: 4,
      padId: 0n,
      padSide: 'right',
    })
    expect(arr(out.inputIds)).toEqual([3, 4, 5, 6])
    expect(arr(out.attnMask)).toEqual([1, 1, 1, 1])
    expect(out.truncated).toBe(true)
  })
})

describe('padInputIds — typed outputs', () => {
  it('returns BigInt64Array instances', () => {
    const out = padInputIds({
      tokens: tokens([1]),
      maxSeq: 2,
      padId: 0n,
      padSide: 'right',
    })
    expect(out.inputIds).toBeInstanceOf(BigInt64Array)
    expect(out.attnMask).toBeInstanceOf(BigInt64Array)
  })

  it('attention mask is 1-byte semantics as bigint', () => {
    const out = padInputIds({
      tokens: tokens([1]),
      maxSeq: 2,
      padId: 0n,
      padSide: 'right',
    })
    expect(out.attnMask[0]).toBe(1n)
    expect(out.attnMask[1]).toBe(0n)
  })
})
