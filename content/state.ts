import type { ClassifyResult } from '@/llm/classify-result'
import type { ExtensionMessage } from '@/messaging/protocol'

export type CardState =
  | { kind: 'idle' }
  | { kind: 'loading'; requestId: string; preview: string; wordCount: number }
  | { kind: 'ready'; requestId: string; preview: string; wordCount: number; result: ClassifyResult }
  | { kind: 'error'; requestId: string | null; preview: string; wordCount: number; error: string }

export type CardAction = ExtensionMessage | { type: 'dismiss' }

export const initialCardState: CardState = { kind: 'idle' }

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
      }

    case 'classify:error':
      if (state.kind === 'idle') return state
      if (state.kind === 'loading' && state.requestId !== action.requestId) return state
      return {
        kind: 'error',
        requestId: state.requestId,
        preview: state.preview,
        wordCount: state.wordCount,
        error: action.error,
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
