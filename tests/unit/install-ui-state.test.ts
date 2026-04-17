import { describe, expect, it } from 'vitest'
import { initialInstallState, reduceInstallState, type InstallState } from '@/install/install-ui-state'

const installing = (partial: Partial<Extract<InstallState, { kind: 'installing' }>> = {}): InstallState => ({
  kind: 'installing',
  progress: 0,
  completed: 0,
  total: 5,
  ...partial,
})

describe('initialInstallState', () => {
  it('starts as detecting', () => {
    expect(initialInstallState).toEqual({ kind: 'detecting' })
  })
})

describe('reduceInstallState — detection', () => {
  it('detecting → empty on detected-empty', () => {
    expect(reduceInstallState(initialInstallState, { type: 'detected-empty' })).toEqual({ kind: 'empty' })
  })

  it('detecting → installed when sentinel is found', () => {
    const next = reduceInstallState(initialInstallState, {
      type: 'detected-installed',
      checkpointId: 'ckpt',
      installedAt: 1700000000000,
    })
    expect(next).toEqual({ kind: 'installed', checkpointId: 'ckpt', installedAt: 1700000000000 })
  })
})

describe('reduceInstallState — install flow', () => {
  it('empty → installing on file-picked', () => {
    const next = reduceInstallState({ kind: 'empty' }, { type: 'file-picked' })
    expect(next.kind).toBe('installing')
    if (next.kind === 'installing') {
      expect(next.progress).toBe(0)
      expect(next.completed).toBe(0)
    }
  })

  it('installing progress updates preserve kind and overwrite fields', () => {
    const state = installing({ progress: 10, completed: 1, total: 9 })
    const next = reduceInstallState(state, {
      type: 'progress',
      progress: 42,
      currentFile: 'tokenizer.json',
      completed: 3,
      total: 9,
    })
    expect(next).toEqual({
      kind: 'installing',
      progress: 42,
      currentFile: 'tokenizer.json',
      completed: 3,
      total: 9,
    })
  })

  it('installing → installed on success', () => {
    const next = reduceInstallState(installing(), {
      type: 'install-success',
      checkpointId: 'v1',
      installedAt: 1700000000000,
    })
    expect(next).toEqual({ kind: 'installed', checkpointId: 'v1', installedAt: 1700000000000 })
  })

  it('installing → error on failure', () => {
    const next = reduceInstallState(installing(), { type: 'install-failed', message: 'broken' })
    expect(next).toEqual({ kind: 'error', message: 'broken' })
  })

  it('ignores progress events when not installing', () => {
    const s: InstallState = { kind: 'empty' }
    expect(
      reduceInstallState(s, { type: 'progress', progress: 10, completed: 1, total: 5 }),
    ).toBe(s)
  })
})

describe('reduceInstallState — recovery', () => {
  it('installed → empty on wipe', () => {
    expect(
      reduceInstallState(
        { kind: 'installed', checkpointId: 'x', installedAt: 1 },
        { type: 'wipe' },
      ),
    ).toEqual({ kind: 'empty' })
  })

  it('error → empty on retry', () => {
    expect(reduceInstallState({ kind: 'error', message: 'x' }, { type: 'retry' })).toEqual({ kind: 'empty' })
  })
})
