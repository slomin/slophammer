import { describe, expect, it } from 'vitest'
import { initialCardState, reduceCardState } from '@/content/state'
import type { ClassifyResult } from '@/llm/classify-result'

const result: ClassifyResult = {
  probs: [0.1, 0.2, 0.3, 0.4],
  rawPct: [10, 20, 30, 40],
  bucketLabels: ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'],
  extLlr: 1.95,
  threshold: 3.8088,
  verdict: 'near-threshold',
  tokenCount: 10,
  analysedTokens: 10,
  truncated: false,
}

const started = (requestId: string, startedAtMs: number) => ({
  type: 'classify:started' as const,
  requestId,
  preview: 'preview',
  wordCount: 40,
  charCount: 300,
  startedAtMs,
})

const finished = (requestId: string, finishedAtMs: number) => ({
  type: 'classify:result' as const,
  requestId,
  tabId: 1,
  result,
  finishedAtMs,
})

describe('reduceCardState timing', () => {
  it('stores start only while loading and duration only when the matching result is accepted', () => {
    const loading = reduceCardState(initialCardState, started('r1', 100))
    expect(loading).toMatchObject({ kind: 'loading', startedAtMs: 100 })
    const ready = reduceCardState(loading, finished('r1', 440))
    expect(ready).toMatchObject({ kind: 'ready', durationMs: 340 })
    expect(ready).not.toHaveProperty('startedAtMs')
  })

  it('ignores stale results and replaces the timer on a new request', () => {
    const first = reduceCardState(initialCardState, started('r1', 100))
    const second = reduceCardState(first, started('r2', 500))
    expect(reduceCardState(second, finished('r1', 900))).toBe(second)
    expect(reduceCardState(second, finished('r2', 1_000))).toMatchObject({ durationMs: 500 })
  })

  it.each([
    { type: 'dismiss' as const },
    { type: 'classify:timeout' as const, requestId: 'r1' },
    { type: 'classify:error' as const, requestId: 'r1', tabId: 1, error: 'failed' },
  ])('does not leak timing through $type', (action) => {
    const loading = reduceCardState(initialCardState, started('r1', 100))
    const next = reduceCardState(loading, action)
    expect(next).not.toHaveProperty('startedAtMs')
    expect(next).not.toHaveProperty('durationMs')
  })

  it('renders short selections as a dedicated error and clears an old duration', () => {
    const ready = reduceCardState(
      reduceCardState(initialCardState, started('r1', 0)),
      finished('r1', 100),
    )
    const short = reduceCardState(ready, {
      type: 'selection:too-short',
      wordCount: 39,
      minWords: 40,
    })
    expect(short).toEqual({
      kind: 'error',
      requestId: null,
      preview: '',
      wordCount: 39,
      error: 'Too short to judge — select at least 40 words (39 selected)',
    })
  })
})
