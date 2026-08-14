import { describe, expect, it } from 'vitest'
import {
  CLASSIFY_TIMEOUT_MESSAGE,
  initialCardState,
  reduceCardState,
  type CardState,
} from '@/content/state'
import type { ClassifyResult } from '@/llm/classify-result'

const loading = (requestId: string): CardState => ({
  kind: 'loading',
  requestId,
  preview: 'a preview of the selected text',
  wordCount: 6,
})

const result: ClassifyResult = {
  probs: [0.05, 0.1, 0.2, 0.65],
  rawPct: [5, 10, 20, 65],
  aiScore: 0.95,
  verdict: 'ai',
  tokenCount: 12,
  analysedTokens: 12,
  truncated: false,
}

describe('reduceCardState — classify:timeout', () => {
  it('loading → error when the request id matches', () => {
    const next = reduceCardState(loading('r1'), { type: 'classify:timeout', requestId: 'r1' })
    expect(next.kind).toBe('error')
    if (next.kind !== 'error') throw new Error('expected error state')
    expect(next.error).toBe(CLASSIFY_TIMEOUT_MESSAGE)
    expect(next.requestId).toBe('r1')
    // The preview and word count carry over so the card keeps its context.
    expect(next.preview).toBe('a preview of the selected text')
    expect(next.wordCount).toBe(6)
  })

  it('ignores a timeout for a stale request id', () => {
    const state = loading('r2')
    expect(reduceCardState(state, { type: 'classify:timeout', requestId: 'r1' })).toBe(state)
  })

  it('ignores a timeout once the result has arrived', () => {
    const ready = reduceCardState(loading('r1'), {
      type: 'classify:result',
      requestId: 'r1',
      tabId: 1,
      result,
    })
    expect(ready.kind).toBe('ready')
    expect(reduceCardState(ready, { type: 'classify:timeout', requestId: 'r1' })).toBe(ready)
  })

  it('ignores a timeout when idle', () => {
    expect(reduceCardState(initialCardState, { type: 'classify:timeout', requestId: 'r1' })).toBe(
      initialCardState,
    )
  })

  it('ignores a timeout when already in error', () => {
    const errored = reduceCardState(loading('r1'), {
      type: 'classify:error',
      requestId: 'r1',
      tabId: 1,
      error: 'boom',
    })
    expect(reduceCardState(errored, { type: 'classify:timeout', requestId: 'r1' })).toBe(errored)
  })

  it('a result arriving after a timeout does not revive the card', () => {
    const timedOut = reduceCardState(loading('r1'), { type: 'classify:timeout', requestId: 'r1' })
    const late = reduceCardState(timedOut, {
      type: 'classify:result',
      requestId: 'r1',
      tabId: 1,
      result,
    })
    expect(late).toBe(timedOut)
  })
})
