import type {
  MigrationStorageOperation,
  MigrationStorageWriteRequestMessage,
} from '@/messaging/protocol'

export type MigrationStorageAckValue = MigrationStorageOperation | 'cleared'

export interface MigrationStorageAck {
  migrationStorage: MigrationStorageAckValue
}

export function migrationStorageAck(value: MigrationStorageAckValue): MigrationStorageAck {
  return { migrationStorage: value }
}

export function requireMigrationStorageAck(
  response: unknown,
  expected: MigrationStorageAckValue,
): void {
  if (
    !response ||
    typeof response !== 'object' ||
    (response as { migrationStorage?: unknown }).migrationStorage !== expected
  ) {
    throw new Error(`The service worker did not acknowledge migration storage operation '${expected}'.`)
  }
}
import { DEFAULT_SETTINGS } from '@/settings/settings-types'
import { SETTINGS_KEY } from '@/settings/settings-store'
import {
  V1_DATA_GENERATION,
  V1_DATA_GENERATION_KEY,
  V1_MIGRATION_INTENT_KEY,
} from './state'

export interface MigrationStorageWriter {
  set(values: Record<string, unknown>): Promise<void>
  remove(key: string): Promise<void>
}

export async function applyMigrationStorageWrite(
  request: MigrationStorageWriteRequestMessage,
  storage: MigrationStorageWriter,
): Promise<MigrationStorageOperation> {
  switch (request.operation) {
    case 'model-marker':
      if (!request.checkpointId) throw new Error('Migration model marker is missing checkpointId.')
      await storage.set({ model_installed: true, checkpoint_id: request.checkpointId })
      break
    case 'existing-complete':
      await storage.set({ [V1_DATA_GENERATION_KEY]: V1_DATA_GENERATION })
      await storage.remove(V1_MIGRATION_INTENT_KEY)
      break
    case 'restore-defaults':
      await storage.set({
        [SETTINGS_KEY]: DEFAULT_SETTINGS,
        [V1_DATA_GENERATION_KEY]: V1_DATA_GENERATION,
      })
      await storage.remove(V1_MIGRATION_INTENT_KEY)
      break
  }
  return request.operation
}
