import type { ClassifyResult } from '@/llm/classify-result'
import type {
  ClassifyErrorMessage,
  ClassifyResultMessage,
  ClassifyStartedMessage,
  ModelStatusMessage,
  SelectionTooShortMessage,
} from '@/messaging/protocol'

export type CardState =
  | { kind: 'idle' }
  | { kind: 'loading'; requestId: string; preview: string; wordCount: number; startedAtMs: number }
  | {
      kind: 'ready'
      requestId: string
      preview: string
      wordCount: number
      result: ClassifyResult
      durationMs: number
    }
  | { kind: 'error'; requestId: string | null; preview: string; wordCount: number; error: string }

export type CardAction =
  | (ClassifyStartedMessage & { startedAtMs: number })
  | (ClassifyResultMessage & { finishedAtMs: number })
  | ClassifyErrorMessage
  | ModelStatusMessage
  | SelectionTooShortMessage
  | { type: 'dismiss' }
  | { type: 'classify:timeout'; requestId: string }

export const initialCardState: CardState = { kind: 'idle' }

// Shown when a request never comes back. Without this the card spins in
// 'loading' forever — a wedged offscreen document produces no result and no
// error, so nothing ever moves the card out of the loading state.
export const CLASSIFY_TIMEOUT_MESSAGE =
  'Timed out — the local model stopped responding. Try again.'

// Generous enough that a cold model load (~9s measured, slower on weaker GPUs)
// never trips it, short enough that a wedged classifier doesn't look infinite.
export const CLASSIFY_TIMEOUT_MS = 45_000

export function reduceCardState(state: CardState, action: CardAction): CardState {
  switch (action.type) {
    case 'dismiss':
      return initialCardState

    case 'classify:started':
      return {
        kind: 'loading',
        requestId: action.requestId,
        preview: action.preview,
        wordCount: action.wordCount,
        startedAtMs: action.startedAtMs,
      }

    case 'classify:result':
      if (state.kind === 'idle') return state
      if (state.kind !== 'loading' || state.requestId !== action.requestId) return state
      return {
        kind: 'ready',
        requestId: state.requestId,
        preview: state.preview,
        wordCount: state.wordCount,
        result: action.result,
        durationMs: Math.max(0, action.finishedAtMs - state.startedAtMs),
      }

    case 'selection:too-short':
      return {
        kind: 'error',
        requestId: null,
        preview: '',
        wordCount: action.wordCount,
        error: `Too short to judge — select at least ${action.minWords} words (${action.wordCount} selected)`,
      }

    case 'classify:error':
      if (state.kind !== 'loading' || state.requestId !== action.requestId) return state
      return {
        kind: 'error',
        requestId: state.requestId,
        preview: state.preview,
        wordCount: state.wordCount,
        error: action.error,
      }

    case 'classify:timeout':
      // Only the in-flight request can time out. A stale timer, or one that
      // fires after the result already landed, must not disturb the card.
      if (state.kind !== 'loading') return state
      if (state.requestId !== action.requestId) return state
      return {
        kind: 'error',
        requestId: state.requestId,
        preview: state.preview,
        wordCount: state.wordCount,
        error: CLASSIFY_TIMEOUT_MESSAGE,
      }

    case 'model:status':
      // The card reducer doesn't react to status transitions in Phase 2 —
      // model:status is informational; classify:result / classify:error drive
      // the card state. A later phase may reintroduce a status-driven UX.
      return state

    default:
      return state
  }
}
