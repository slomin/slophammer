/**
 * Watchdog for a classification that never comes back — a wedged offscreen
 * document, a dropped message, a dead service worker. Without it the card spins
 * in `loading` forever.
 *
 * The deadline is a *silence* timeout, not a latency budget. While a request is
 * genuinely in flight the offscreen document heartbeats `model:status:
 * 'loading'`, and every heartbeat re-arms the deadline. That is what lets a slow
 * device take as long as it needs — a cold start reads the whole model out of
 * OPFS and builds the session — without ever producing a false timeout on work
 * that then succeeds.
 *
 * This lives apart from the content entry point so the timing rules are
 * testable with fake timers instead of only by waiting out the real deadline in
 * a browser.
 */

/** The parts of a card state this needs; keeps the helper free of the DOM. */
export interface WatchdogCardState {
  kind: string
  requestId?: string | null
}

/** The parts of a card action this needs. */
export interface WatchdogAction {
  type: string
  requestId?: string | null
  status?: string
}

export interface ClassifyWatchdogOptions {
  timeoutMs: number
  onTimeout: (requestId: string) => void
  /** Injectable for tests that do not want to install fake timers globally. */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}

export interface ClassifyWatchdog {
  /**
   * Feed every action together with the state it produced. Arms on a new
   * request, re-arms on a loading heartbeat while still waiting, and disarms as
   * soon as the card is no longer waiting.
   */
  sync(action: WatchdogAction, state: WatchdogCardState): void
  clear(): void
  /** Test/diagnostic seam: whether a deadline is currently running. */
  isArmed(): boolean
}

export function createClassifyWatchdog(options: ClassifyWatchdogOptions): ClassifyWatchdog {
  const { timeoutMs, onTimeout } = options
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle))

  let handle: ReturnType<typeof setTimeout> | null = null

  function clear(): void {
    if (handle === null) return
    clearTimer(handle)
    handle = null
  }

  function arm(requestId: string): void {
    // Replace rather than stack: a new request must not inherit the remaining
    // time of the previous one, and a re-arm must extend, not double up.
    clear()
    handle = setTimer(() => {
      handle = null
      onTimeout(requestId)
    }, timeoutMs)
  }

  return {
    isArmed: () => handle !== null,
    clear,
    sync(action, state) {
      if (action.type === 'classify:started' && action.requestId) {
        arm(action.requestId)
        return
      }
      // Keying the re-arm off the resulting state means a stale message for an
      // older request cannot extend or cancel the live request's deadline.
      if (
        action.type === 'model:status' &&
        action.status === 'loading' &&
        state.kind === 'loading' &&
        state.requestId
      ) {
        arm(state.requestId)
        return
      }
      if (state.kind !== 'loading') clear()
    },
  }
}
