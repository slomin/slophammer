import { describe, expect, it } from 'vitest'
import { formatAnalysisTime } from '@/content/timing'

describe('formatAnalysisTime', () => {
  it.each([
    [0, 'sub 0.1s'],
    [99, 'sub 0.1s'],
    [100, '0.1s'],
    [104, '0.1s'],
    [105, '0.1s'],
    [340, '0.34s'],
    [1_700, '1.7s'],
    [2_725, '2.73s'],
    [2_735, '2.73s'],
  ])('formats %d ms as %s', (ms, expected) => {
    expect(formatAnalysisTime(ms)).toBe(expected)
  })
})
