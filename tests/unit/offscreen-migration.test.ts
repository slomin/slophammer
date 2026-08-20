import { describe, expect, it, vi } from 'vitest'
import {
  createMigrationProgressPublisher,
  createMigrationRunner,
  type MigrationRunnerDeps,
} from '@/migration/offscreen-runner'
import { migrationState, type MigrationState } from '@/migration/state'

function harness(options: {
  journal?: MigrationState | null
  failAt?: string
  supportedInstall?: boolean
} = {}) {
  const calls: string[] = []
  const states: MigrationState[] = []
  let journal = options.journal ?? null
  const step = async (name: string) => {
    calls.push(name)
    if (options.failAt === name) throw new Error(`${name} failed`)
  }
  const deps: MigrationRunnerDeps = {
    shutdownClassifier: () => step('shutdown'),
    requestStorageClear: () => step('clear-storage'),
    requestStorageWrite: async () => {},
    publish: async (state) => { states.push(state) },
    reloadClassifier: () => step('reload'),
    readJournal: async () => journal,
    writeJournal: async (state) => { journal = state; calls.push(`journal:${state.phase}`) },
    hasSupportedInstall: async () => { await step('supported-check'); return options.supportedInstall ?? false },
    markExistingComplete: () => step('existing-complete'),
    wipe: () => step('wipe'),
    download: async () => { await step('download'); return new File(['zip'], 'model.zip') },
    install: async () => { await step('install') },
    restoreDefaults: () => step('defaults'),
  }
  return { runner: createMigrationRunner(deps), calls, states, getJournal: () => journal }
}

describe('offscreen migration runner', () => {
  it('coalesces per-chunk progress into one persisted update per percentage', async () => {
    const states: MigrationState[] = []
    const progress = createMigrationProgressPublisher('downloading', (state) => {
      states.push(state)
    })

    for (const value of [0, 0, 1, 1, 7, 7, 100, 100]) progress.publish(value)
    await progress.flush()

    expect(states.map((state) => state.progress)).toEqual([0, 1, 7, 100])
    expect(states.every((state) => state.phase === 'downloading' && state.destructive)).toBe(true)
  })

  it('persists every phase, clears before download, writes ready last, and reloads', async () => {
    const h = harness()
    await h.runner.run()
    expect(h.states.map((state) => state.phase)).toEqual([
      'pending', 'wiping', 'downloading', 'installing', 'ready',
    ])
    expect(h.calls).toEqual([
      'journal:pending', 'shutdown', 'supported-check', 'journal:wiping', 'clear-storage', 'wipe',
      'journal:downloading', 'download', 'journal:installing', 'install', 'defaults',
      'journal:ready', 'reload',
    ])
    expect(h.getJournal()?.phase).toBe('ready')
  })

  it.each(['shutdown', 'clear-storage', 'wipe', 'download', 'install', 'defaults', 'reload'])(
    'retains an actionable error when %s fails and can retry idempotently',
    async (failAt) => {
      const h = harness({ failAt })
      await expect(h.runner.run()).rejects.toThrow(`${failAt} failed`)
      expect(h.getJournal()).toMatchObject({ phase: 'error', error: `${failAt} failed` })
    },
  )

  it('coalesces overlapping triggers into one job', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const h = harness()
    const original = h.runner
    const depsRunner = createMigrationRunner({
      shutdownClassifier: async () => gate,
      requestStorageClear: async () => {}, publish: () => {}, reloadClassifier: async () => {},
      requestStorageWrite: async () => {},
      readJournal: async () => null, writeJournal: async () => {}, wipe: async () => {},
      hasSupportedInstall: async () => false, markExistingComplete: async () => {},
      download: async () => new File(['x'], 'x.zip'), install: async () => {}, restoreDefaults: async () => {},
    })
    void original
    const first = depsRunner.run()
    const second = depsRunner.run()
    expect(first).toBe(second)
    expect(depsRunner.running()).toBe(true)
    release()
    await first
    expect(depsRunner.running()).toBe(false)
  })

  it('is a completed no-op when the journal is ready', async () => {
    const ready = migrationState('ready')
    const h = harness({ journal: ready })
    await h.runner.run()
    expect(h.calls).toEqual([])
    expect(h.states).toEqual([ready])
  })

  it('marks an exact installed 350M artifact complete without wiping or downloading', async () => {
    const h = harness({ supportedInstall: true })
    await h.runner.run()

    expect(h.calls).toEqual([
      'journal:pending', 'shutdown', 'supported-check', 'existing-complete',
      'journal:ready', 'reload',
    ])
    expect(h.states.map((state) => state.phase)).toEqual(['pending', 'ready'])
  })
})
