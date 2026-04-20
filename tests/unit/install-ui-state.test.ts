import { describe, expect, it } from 'vitest'
import { initialInstallState, reduceInstallState, type InstallState } from '@/install/install-ui-state'

const installingUnpack = (partial: Partial<Extract<InstallState, { kind: 'installing'; phase: 'unpacking' }>> = {}): InstallState => ({
  kind: 'installing',
  phase: 'unpacking',
  progress: 0,
  completed: 0,
  total: 5,
  ...partial,
})

const installingDownload = (partial: Partial<Extract<InstallState, { kind: 'installing'; phase: 'downloading' }>> = {}): InstallState => ({
  kind: 'installing',
  phase: 'downloading',
  downloadedBytes: 0,
  totalBytes: 0,
  ...partial,
})

const installed = (overrides: Partial<Extract<InstallState, { kind: 'installed' }>> = {}): Extract<InstallState, { kind: 'installed' }> => ({
  kind: 'installed',
  checkpointId: 'v1',
  installedAt: 1700000000000,
  updateStatus: 'idle',
  ...overrides,
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

  it('detecting → installed with updateStatus: idle on detected-installed', () => {
    const next = reduceInstallState(initialInstallState, {
      type: 'detected-installed',
      checkpointId: 'ckpt',
      installedAt: 1700000000000,
    })
    expect(next).toEqual({
      kind: 'installed',
      checkpointId: 'ckpt',
      installedAt: 1700000000000,
      updateStatus: 'idle',
    })
  })
})

describe('reduceInstallState — manual install flow', () => {
  it('empty → installing (unpacking) on file-picked', () => {
    const next = reduceInstallState({ kind: 'empty' }, { type: 'file-picked' })
    expect(next.kind).toBe('installing')
    if (next.kind === 'installing') {
      expect(next.phase).toBe('unpacking')
      if (next.phase === 'unpacking') {
        expect(next.progress).toBe(0)
        expect(next.completed).toBe(0)
      }
    }
  })

  it('progress during unpacking updates fields', () => {
    const state = installingUnpack({ progress: 10, completed: 1, total: 9 })
    const next = reduceInstallState(state, {
      type: 'progress',
      progress: 42,
      currentFile: 'tokenizer.json',
      completed: 3,
      total: 9,
    })
    expect(next).toEqual({
      kind: 'installing',
      phase: 'unpacking',
      progress: 42,
      currentFile: 'tokenizer.json',
      completed: 3,
      total: 9,
    })
  })

  it('installing → installed on success', () => {
    const next = reduceInstallState(installingUnpack(), {
      type: 'install-success',
      checkpointId: 'v1',
      installedAt: 1700000000000,
    })
    expect(next).toEqual({
      kind: 'installed',
      checkpointId: 'v1',
      installedAt: 1700000000000,
      updateStatus: 'idle',
    })
  })

  it('installing → error on failure', () => {
    const next = reduceInstallState(installingUnpack(), { type: 'install-failed', message: 'broken' })
    expect(next).toEqual({ kind: 'error', message: 'broken' })
  })

  it('ignores progress events when not in unpacking phase', () => {
    const s: InstallState = { kind: 'empty' }
    expect(
      reduceInstallState(s, { type: 'progress', progress: 10, completed: 1, total: 5 }),
    ).toBe(s)
    const dl = installingDownload()
    expect(
      reduceInstallState(dl, { type: 'progress', progress: 10, completed: 1, total: 5 }),
    ).toBe(dl)
  })
})

describe('reduceInstallState — hosted download flow', () => {
  it('empty → installing (downloading) on hosted-download-started', () => {
    const next = reduceInstallState({ kind: 'empty' }, { type: 'hosted-download-started' })
    expect(next).toEqual({
      kind: 'installing',
      phase: 'downloading',
      downloadedBytes: 0,
      totalBytes: 0,
    })
  })

  it('installed → installing (downloading) on hosted-download-started (install-update path)', () => {
    const next = reduceInstallState(installed({ updateStatus: 'available' }), {
      type: 'hosted-download-started',
      totalBytes: 1000,
    })
    expect(next).toEqual({
      kind: 'installing',
      phase: 'downloading',
      downloadedBytes: 0,
      totalBytes: 1000,
    })
  })

  it('updates bytes while downloading', () => {
    const next = reduceInstallState(installingDownload({ totalBytes: 100 }), {
      type: 'hosted-download-progress',
      downloadedBytes: 45,
      totalBytes: 100,
    })
    expect(next).toEqual({
      kind: 'installing',
      phase: 'downloading',
      downloadedBytes: 45,
      totalBytes: 100,
    })
  })

  it('ignores hosted-download-progress when not in downloading phase', () => {
    const s = installingUnpack()
    expect(
      reduceInstallState(s, { type: 'hosted-download-progress', downloadedBytes: 1, totalBytes: 2 }),
    ).toBe(s)
  })

  it('switches to unpacking phase on hosted-download-done', () => {
    const next = reduceInstallState(installingDownload({ downloadedBytes: 100, totalBytes: 100 }), {
      type: 'hosted-download-done',
    })
    expect(next).toEqual({
      kind: 'installing',
      phase: 'unpacking',
      progress: 0,
      completed: 0,
      total: 5,
    })
  })
})

describe('reduceInstallState — update check on installed', () => {
  const base = installed()

  it('update-check-started flips updateStatus to checking and clears prior pending/error', () => {
    const next = reduceInstallState(
      installed({ updateStatus: 'error', updateError: 'oops', pendingUpdate: { filename: 'x', lfsOid: 'y', url: 'z' } }),
      { type: 'update-check-started' },
    )
    expect(next.kind).toBe('installed')
    if (next.kind === 'installed') {
      expect(next.updateStatus).toBe('checking')
      expect(next.pendingUpdate).toBeUndefined()
      expect(next.updateError).toBeUndefined()
    }
  })

  it('update-check-up-to-date sets updateStatus to up-to-date', () => {
    const next = reduceInstallState(base, { type: 'update-check-up-to-date' })
    if (next.kind !== 'installed') throw new Error('expected installed')
    expect(next.updateStatus).toBe('up-to-date')
    expect(next.pendingUpdate).toBeUndefined()
  })

  it('update-check-available stores pendingUpdate', () => {
    const pending = { filename: 'slop_hammer_0_8b_v0_2.zip', lfsOid: 'deadbeef', url: 'https://example.test/x' }
    const next = reduceInstallState(base, { type: 'update-check-available', pendingUpdate: pending })
    if (next.kind !== 'installed') throw new Error('expected installed')
    expect(next.updateStatus).toBe('available')
    expect(next.pendingUpdate).toEqual(pending)
  })

  it('update-check-failed stores the error message', () => {
    const next = reduceInstallState(base, { type: 'update-check-failed', message: 'no network' })
    if (next.kind !== 'installed') throw new Error('expected installed')
    expect(next.updateStatus).toBe('error')
    expect(next.updateError).toBe('no network')
  })

  it('update actions are ignored when not in installed state', () => {
    const s: InstallState = { kind: 'empty' }
    expect(reduceInstallState(s, { type: 'update-check-started' })).toBe(s)
    expect(reduceInstallState(s, { type: 'update-check-up-to-date' })).toBe(s)
  })
})

describe('reduceInstallState — recovery', () => {
  it('installed → empty on wipe', () => {
    expect(reduceInstallState(installed(), { type: 'wipe' })).toEqual({ kind: 'empty' })
  })

  it('error → empty on retry', () => {
    expect(reduceInstallState({ kind: 'error', message: 'x' }, { type: 'retry' })).toEqual({ kind: 'empty' })
  })
})
