export type InstallPhase =
  | { phase: 'downloading'; downloadedBytes: number; totalBytes: number }
  | {
      phase: 'unpacking'
      progress: number
      currentFile?: string
      completed: number
      total: number
    }

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error'

export interface PendingUpdate {
  filename: string
  lfsOid: string
  url: string
}

export type InstallState =
  | { kind: 'detecting' }
  | { kind: 'empty' }
  | ({ kind: 'installing' } & InstallPhase)
  | {
      kind: 'installed'
      checkpointId: string
      installedAt: number
      updateStatus: UpdateStatus
      pendingUpdate?: PendingUpdate
      updateError?: string
    }
  | { kind: 'error'; message: string }

export type InstallAction =
  | { type: 'detected-empty' }
  | { type: 'detected-installed'; checkpointId: string; installedAt: number }
  | { type: 'file-picked' }
  | { type: 'hosted-download-started'; totalBytes?: number }
  | { type: 'hosted-download-progress'; downloadedBytes: number; totalBytes: number }
  | { type: 'hosted-download-done' }
  | {
      type: 'progress'
      progress: number
      currentFile?: string
      completed: number
      total: number
    }
  | { type: 'install-success'; checkpointId: string; installedAt: number }
  | { type: 'install-failed'; message: string }
  | { type: 'update-check-started' }
  | { type: 'update-check-up-to-date' }
  | { type: 'update-check-available'; pendingUpdate: PendingUpdate }
  | { type: 'update-check-failed'; message: string }
  | { type: 'wipe' }
  | { type: 'retry' }

export const initialInstallState: InstallState = { kind: 'detecting' }

function installedBase(
  checkpointId: string,
  installedAt: number,
  overrides: Partial<Extract<InstallState, { kind: 'installed' }>> = {},
): Extract<InstallState, { kind: 'installed' }> {
  return {
    kind: 'installed',
    checkpointId,
    installedAt,
    updateStatus: 'idle',
    ...overrides,
  }
}

export function reduceInstallState(state: InstallState, action: InstallAction): InstallState {
  switch (action.type) {
    case 'detected-empty':
      return { kind: 'empty' }
    case 'detected-installed':
      return installedBase(action.checkpointId, action.installedAt)
    case 'file-picked':
      return { kind: 'installing', phase: 'unpacking', progress: 0, completed: 0, total: 5 }
    case 'hosted-download-started':
      return {
        kind: 'installing',
        phase: 'downloading',
        downloadedBytes: 0,
        totalBytes: action.totalBytes ?? 0,
      }
    case 'hosted-download-progress':
      if (state.kind !== 'installing' || state.phase !== 'downloading') return state
      return {
        kind: 'installing',
        phase: 'downloading',
        downloadedBytes: action.downloadedBytes,
        totalBytes: action.totalBytes,
      }
    case 'hosted-download-done':
      if (state.kind !== 'installing') return state
      return { kind: 'installing', phase: 'unpacking', progress: 0, completed: 0, total: 5 }
    case 'progress':
      if (state.kind !== 'installing' || state.phase !== 'unpacking') return state
      return {
        kind: 'installing',
        phase: 'unpacking',
        progress: action.progress,
        currentFile: action.currentFile,
        completed: action.completed,
        total: action.total,
      }
    case 'install-success':
      return installedBase(action.checkpointId, action.installedAt)
    case 'install-failed':
      return { kind: 'error', message: action.message }
    case 'update-check-started':
      if (state.kind !== 'installed') return state
      return {
        ...state,
        updateStatus: 'checking',
        pendingUpdate: undefined,
        updateError: undefined,
      }
    case 'update-check-up-to-date':
      if (state.kind !== 'installed') return state
      return {
        ...state,
        updateStatus: 'up-to-date',
        pendingUpdate: undefined,
        updateError: undefined,
      }
    case 'update-check-available':
      if (state.kind !== 'installed') return state
      return {
        ...state,
        updateStatus: 'available',
        pendingUpdate: action.pendingUpdate,
        updateError: undefined,
      }
    case 'update-check-failed':
      if (state.kind !== 'installed') return state
      return {
        ...state,
        updateStatus: 'error',
        pendingUpdate: undefined,
        updateError: action.message,
      }
    case 'wipe':
      return { kind: 'empty' }
    case 'retry':
      return { kind: 'empty' }
  }
}
