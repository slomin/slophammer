import { describe, expect, it, vi } from 'vitest'
import { handleV1InstalledLifecycle } from '@/migration/background-lifecycle'
import { V1_DATA_GENERATION, type MigrationIntent } from '@/migration/state'

describe('background migration lifecycle', () => {
  it('starts the durable intent write before the first generation read', async () => {
    const calls: string[] = []
    let releaseIntent!: () => void
    const intentStored = new Promise<void>((resolve) => { releaseIntent = resolve })
    const persistIntent = vi.fn((_intent: MigrationIntent) => {
      calls.push('persist-intent')
      return intentStored
    })

    const lifecycle = handleV1InstalledLifecycle(
      { reason: 'update', previousVersion: '0.3.0' },
      '1.0.0',
      {
        persistIntent,
        readCompletedGeneration: async () => { calls.push('read-generation'); return undefined },
        clearIntent: async () => { calls.push('clear-intent') },
        startMigration: async () => { calls.push('start') },
        resumeMigration: async () => { calls.push('resume') },
      },
    )

    expect(calls).toEqual(['persist-intent'])
    expect(persistIntent.mock.calls[0]![0]).toMatchObject({
      previousVersion: '0.3.0', targetVersion: '1.0.0',
    })
    releaseIntent()
    await lifecycle
    expect(calls).toEqual(['persist-intent', 'read-generation', 'start'])
  })

  it('clears stale intent and resumes without migration when generation is complete', async () => {
    const calls: string[] = []
    await handleV1InstalledLifecycle(
      { reason: 'update', previousVersion: '0.3.0' },
      '1.0.0',
      {
        persistIntent: async () => { calls.push('persist-intent') },
        readCompletedGeneration: async () => V1_DATA_GENERATION,
        clearIntent: async () => { calls.push('clear-intent') },
        startMigration: async () => { calls.push('start') },
        resumeMigration: async () => { calls.push('resume') },
      },
    )
    expect(calls).toEqual(['persist-intent', 'clear-intent', 'resume'])
  })
})
