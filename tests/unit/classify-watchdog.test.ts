import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLASSIFY_TIMEOUT_MS } from '@/content/state'
import { createClassifyWatchdog } from '@/content/classify-watchdog'

const loading = (requestId: string) => ({ kind: 'loading' as const, requestId })
const ready = (requestId: string) => ({ kind: 'ready' as const, requestId })

describe('classify watchdog', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires once the deadline passes with no word from the classifier', () => {
    const onTimeout = vi.fn()
    const watchdog = createClassifyWatchdog({ timeoutMs: CLASSIFY_TIMEOUT_MS, onTimeout })

    watchdog.sync({ type: 'classify:started', requestId: 'r1' }, loading('r1'))
    vi.advanceTimersByTime(CLASSIFY_TIMEOUT_MS - 1)
    expect(onTimeout).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onTimeout).toHaveBeenCalledWith('r1')
  })

  it('a loading heartbeat re-arms the deadline, so a slow run never false-times-out', () => {
    const onTimeout = vi.fn()
    const watchdog = createClassifyWatchdog({ timeoutMs: CLASSIFY_TIMEOUT_MS, onTimeout })
    watchdog.sync({ type: 'classify:started', requestId: 'r1' }, loading('r1'))

    // The offscreen document heartbeats every 10s. Run well past the deadline.
    for (let elapsed = 0; elapsed < CLASSIFY_TIMEOUT_MS * 3; elapsed += 10_000) {
      vi.advanceTimersByTime(10_000)
      watchdog.sync({ type: 'model:status', status: 'loading' }, loading('r1'))
    }

    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('stops heartbeating and the deadline still fires', () => {
    const onTimeout = vi.fn()
    const watchdog = createClassifyWatchdog({ timeoutMs: CLASSIFY_TIMEOUT_MS, onTimeout })
    watchdog.sync({ type: 'classify:started', requestId: 'r1' }, loading('r1'))

    vi.advanceTimersByTime(10_000)
    watchdog.sync({ type: 'model:status', status: 'loading' }, loading('r1'))

    vi.advanceTimersByTime(CLASSIFY_TIMEOUT_MS)
    expect(onTimeout).toHaveBeenCalledWith('r1')
  })

  it('a non-loading status does not extend a live request', () => {
    const onTimeout = vi.fn()
    const watchdog = createClassifyWatchdog({ timeoutMs: CLASSIFY_TIMEOUT_MS, onTimeout })
    watchdog.sync({ type: 'classify:started', requestId: 'r1' }, loading('r1'))

    vi.advanceTimersByTime(CLASSIFY_TIMEOUT_MS - 1_000)
    watchdog.sync({ type: 'model:status', status: 'ready' }, loading('r1'))
    vi.advanceTimersByTime(1_000)

    expect(onTimeout).toHaveBeenCalledWith('r1')
  })

  it('disarms as soon as the card is no longer waiting', () => {
    const onTimeout = vi.fn()
    const watchdog = createClassifyWatchdog({ timeoutMs: CLASSIFY_TIMEOUT_MS, onTimeout })
    watchdog.sync({ type: 'classify:started', requestId: 'r1' }, loading('r1'))
    watchdog.sync({ type: 'classify:result', requestId: 'r1' }, ready('r1'))

    vi.advanceTimersByTime(CLASSIFY_TIMEOUT_MS * 2)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('a heartbeat arriving after the card settled does not re-arm anything', () => {
    const onTimeout = vi.fn()
    const watchdog = createClassifyWatchdog({ timeoutMs: CLASSIFY_TIMEOUT_MS, onTimeout })
    watchdog.sync({ type: 'classify:started', requestId: 'r1' }, loading('r1'))
    watchdog.sync({ type: 'classify:result', requestId: 'r1' }, ready('r1'))
    watchdog.sync({ type: 'model:status', status: 'loading' }, ready('r1'))

    vi.advanceTimersByTime(CLASSIFY_TIMEOUT_MS * 2)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('a new request replaces the previous deadline rather than stacking one', () => {
    const onTimeout = vi.fn()
    const watchdog = createClassifyWatchdog({ timeoutMs: CLASSIFY_TIMEOUT_MS, onTimeout })
    watchdog.sync({ type: 'classify:started', requestId: 'r1' }, loading('r1'))
    vi.advanceTimersByTime(CLASSIFY_TIMEOUT_MS - 1_000)
    watchdog.sync({ type: 'classify:started', requestId: 'r2' }, loading('r2'))

    vi.advanceTimersByTime(1_000)
    expect(onTimeout).not.toHaveBeenCalled()

    vi.advanceTimersByTime(CLASSIFY_TIMEOUT_MS)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith('r2')
  })
})
