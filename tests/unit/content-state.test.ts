import { describe, expect, it } from 'vitest'
import {
  initialCardState,
  reduceCardState,
  type CardState,
} from '@/content/state'
import type { ClassifyResult } from '@/llm/classify-result'

const result: ClassifyResult = {
  probs: [0.05, 0.1, 0.2, 0.65],
  rawPct: [5, 10, 20, 65],
  aiScore: 0.95,
  humanPct: 0,
  mixedPct: 0,
  aiPct: 100,
  verdict: 'ai',
  primaryPct: 100,
  primaryLabel: 'AI-Generated',
  headline: 'AI-Generated',
  tokenCount: 12,
  truncated: false,
}

const loading = (rid: string): CardState => ({
  kind: 'loading',
  requestId: rid,
  preview: 'preview text',
  wordCount: 2,
})

describe('initialCardState', () => {
  it('is idle', () => {
    expect(initialCardState).toEqual({ kind: 'idle' })
  })
})

describe('reduceCardState — classify:started', () => {
  it('idle → loading', () => {
    const next = reduceCardState(initialCardState, {
      type: 'classify:started',
      requestId: 'r1',
      preview: 'preview text',
      wordCount: 2,
      charCount: 12,
    })
    expect(next).toEqual({ kind: 'loading', requestId: 'r1', preview: 'preview text', wordCount: 2 })
  })

  it('replaces an earlier in-flight request', () => {
    const next = reduceCardState(loading('r1'), {
      type: 'classify:started',
      requestId: 'r2',
      preview: 'new',
      wordCount: 1,
      charCount: 3,
    })
    expect(next).toEqual({ kind: 'loading', requestId: 'r2', preview: 'new', wordCount: 1 })
  })
})

describe('reduceCardState — classify:result', () => {
  it('loading → ready when requestId matches', () => {
    const next = reduceCardState(loading('r1'), {
      type: 'classify:result',
      requestId: 'r1',
      tabId: 42,
      result,
    })
    expect(next).toEqual({
      kind: 'ready',
      requestId: 'r1',
      preview: 'preview text',
      wordCount: 2,
      result,
    })
  })

  it('ignores stale result (mismatched requestId)', () => {
    const state = loading('r2')
    const next = reduceCardState(state, {
      type: 'classify:result',
      requestId: 'r-stale',
      tabId: 42,
      result,
    })
    expect(next).toBe(state)
  })

  it('ignores result when in idle state', () => {
    const next = reduceCardState(initialCardState, {
      type: 'classify:result',
      requestId: 'r1',
      tabId: 42,
      result,
    })
    expect(next).toEqual(initialCardState)
  })
})

describe('reduceCardState — classify:error', () => {
  it('loading → error when requestId matches', () => {
    const next = reduceCardState(loading('r1'), {
      type: 'classify:error',
      requestId: 'r1',
      tabId: 42,
      error: 'something broke',
    })
    expect(next).toEqual({
      kind: 'error',
      requestId: 'r1',
      preview: 'preview text',
      wordCount: 2,
      error: 'something broke',
    })
  })

  it('ignores stale error (mismatched requestId)', () => {
    const state = loading('r1')
    const next = reduceCardState(state, {
      type: 'classify:error',
      requestId: 'other',
      tabId: 42,
      error: 'x',
    })
    expect(next).toBe(state)
  })
})

describe('reduceCardState — model:status', () => {
  it('loading + not-installed → error with installer hint', () => {
    const next = reduceCardState(loading('r1'), {
      type: 'model:status',
      status: 'not-installed',
    })
    expect(next.kind).toBe('error')
    if (next.kind === 'error') {
      expect(next.error).toMatch(/install/i)
    }
  })

  it('loading + loading(progress) stays loading (no premature error)', () => {
    const state = loading('r1')
    const next = reduceCardState(state, {
      type: 'model:status',
      status: 'loading',
      progress: 42,
    })
    expect(next).toEqual(state)
  })

  it('idle + any status → idle (no orphan cards)', () => {
    const next = reduceCardState(initialCardState, {
      type: 'model:status',
      status: 'not-installed',
    })
    expect(next).toEqual(initialCardState)
  })
})

describe('reduceCardState — dismiss', () => {
  it('any state → idle on dismiss', () => {
    expect(reduceCardState(loading('r1'), { type: 'dismiss' })).toEqual(initialCardState)
    expect(
      reduceCardState(
        { kind: 'ready', requestId: 'r1', preview: 'p', wordCount: 1, result },
        { type: 'dismiss' },
      ),
    ).toEqual(initialCardState)
  })
})

describe('reduceCardState — other messages', () => {
  it('selection:too-short does not alter card state (toast-only)', () => {
    expect(
      reduceCardState(loading('r1'), { type: 'selection:too-short', length: 5 }),
    ).toEqual(loading('r1'))
  })
})
