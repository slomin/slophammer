export type InstallState =
  | { kind: 'detecting' }
  | { kind: 'empty' }
  | {
      kind: 'installing'
      progress: number
      currentFile?: string
      completed: number
      total: number
    }
  | { kind: 'installed'; checkpointId: string; installedAt: number }
  | { kind: 'error'; message: string }

export type InstallAction =
  | { type: 'detected-empty' }
  | { type: 'detected-installed'; checkpointId: string; installedAt: number }
  | { type: 'file-picked' }
  | {
      type: 'progress'
      progress: number
      currentFile?: string
      completed: number
      total: number
    }
  | { type: 'install-success'; checkpointId: string; installedAt: number }
  | { type: 'install-failed'; message: string }
  | { type: 'wipe' }
  | { type: 'retry' }

export const initialInstallState: InstallState = { kind: 'detecting' }

export function reduceInstallState(state: InstallState, action: InstallAction): InstallState {
  switch (action.type) {
    case 'detected-empty':
      return { kind: 'empty' }
    case 'detected-installed':
      return { kind: 'installed', checkpointId: action.checkpointId, installedAt: action.installedAt }
    case 'file-picked':
      return { kind: 'installing', progress: 0, completed: 0, total: 5 }
    case 'progress':
      if (state.kind !== 'installing') return state
      return {
        kind: 'installing',
        progress: action.progress,
        currentFile: action.currentFile,
        completed: action.completed,
        total: action.total,
      }
    case 'install-success':
      return {
        kind: 'installed',
        checkpointId: action.checkpointId,
        installedAt: action.installedAt,
      }
    case 'install-failed':
      return { kind: 'error', message: action.message }
    case 'wipe':
      return { kind: 'empty' }
    case 'retry':
      return { kind: 'empty' }
  }
}
