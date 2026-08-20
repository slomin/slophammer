import { describe, expect, it } from 'vitest'
import { CLASSIFY_TIMEOUT_MESSAGE, reduceCardState, type CardState } from '@/content/state'

const loading: CardState = {
  kind: 'loading', requestId: 'r1', preview: 'x', wordCount: 40, startedAtMs: 10,
}

describe('classification timeout', () => {
  it('turns only the matching loading request into an error without timing metadata', () => {
    const timedOut = reduceCardState(loading, { type: 'classify:timeout', requestId: 'r1' })
    expect(timedOut).toMatchObject({ kind: 'error', error: CLASSIFY_TIMEOUT_MESSAGE })
    expect(timedOut).not.toHaveProperty('startedAtMs')
    expect(reduceCardState(loading, { type: 'classify:timeout', requestId: 'stale' })).toBe(loading)
  })
})
