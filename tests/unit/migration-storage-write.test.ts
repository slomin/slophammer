import { describe, expect, it, vi } from 'vitest'
import {
  applyMigrationStorageWrite,
  migrationStorageAck,
  requireMigrationStorageAck,
  type MigrationStorageWriter,
} from '@/migration/storage-write'
import { DEFAULT_SETTINGS } from '@/settings/settings-types'
import { SETTINGS_KEY } from '@/settings/settings-store'
import {
  V1_DATA_GENERATION,
  V1_DATA_GENERATION_KEY,
  V1_MIGRATION_INTENT_KEY,
} from '@/migration/state'

function writer() {
  const storage: MigrationStorageWriter = { set: vi.fn(), remove: vi.fn() }
  return storage
}

describe('service-worker migration storage writes', () => {
  it('requires a response from the service worker instead of any extension listener', () => {
    expect(() => requireMigrationStorageAck(undefined, 'existing-complete')).toThrow(/acknowledge/)
    expect(() => requireMigrationStorageAck(
      migrationStorageAck('existing-complete'),
      'existing-complete',
    )).not.toThrow()
    expect(() => requireMigrationStorageAck(
      migrationStorageAck('model-marker'),
      'existing-complete',
    )).toThrow(/acknowledge/)
  })

  it('writes the installed marker before the offscreen sentinel is activated', async () => {
    const storage = writer()
    await expect(applyMigrationStorageWrite({
      type: 'migration:storage-write-request',
      operation: 'model-marker',
      checkpointId: 'SlopHammer 350M v0.1',
    }, storage)).resolves.toBe('model-marker')
    expect(storage.set).toHaveBeenCalledWith({
      model_installed: true,
      checkpoint_id: 'SlopHammer 350M v0.1',
    })
  })

  it('marks an existing exact install complete without replacing settings', async () => {
    const storage = writer()
    await applyMigrationStorageWrite({
      type: 'migration:storage-write-request', operation: 'existing-complete',
    }, storage)
    expect(storage.set).toHaveBeenCalledWith({ [V1_DATA_GENERATION_KEY]: V1_DATA_GENERATION })
    expect(storage.set).not.toHaveBeenCalledWith(expect.objectContaining({ [SETTINGS_KEY]: expect.anything() }))
    expect(storage.remove).toHaveBeenCalledWith(V1_MIGRATION_INTENT_KEY)
  })

  it('restores defaults after a destructive install and clears intent', async () => {
    const storage = writer()
    await applyMigrationStorageWrite({
      type: 'migration:storage-write-request', operation: 'restore-defaults',
    }, storage)
    expect(storage.set).toHaveBeenCalledWith({
      [SETTINGS_KEY]: DEFAULT_SETTINGS,
      [V1_DATA_GENERATION_KEY]: V1_DATA_GENERATION,
    })
    expect(storage.remove).toHaveBeenCalledWith(V1_MIGRATION_INTENT_KEY)
  })

  it('rejects a marker request without an identity', async () => {
    await expect(applyMigrationStorageWrite({
      type: 'migration:storage-write-request', operation: 'model-marker',
    }, writer())).rejects.toThrow(/checkpointId/)
  })
})
