import type {
  MigrationStorageClearRequestMessage,
  MigrationStorageWriteRequestMessage,
} from '@/messaging/protocol'
import {
  requireMigrationStorageAck,
  type MigrationStorageAckValue,
} from './storage-write'

export const MIGRATION_STORAGE_PORT = 'slophammer-migration-storage'

export type MigrationStorageRequest =
  | MigrationStorageClearRequestMessage
  | MigrationStorageWriteRequestMessage

interface MigrationStorageErrorResponse {
  migrationStorageError: string
}

function storageError(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null
  const error = (response as Partial<MigrationStorageErrorResponse>).migrationStorageError
  return typeof error === 'string' ? error : null
}

export function requestMigrationStorage(
  request: MigrationStorageRequest,
  expected: MigrationStorageAckValue,
  connect: () => chrome.runtime.Port = () => chrome.runtime.connect({ name: MIGRATION_STORAGE_PORT }),
  timeoutMs = 10_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const port = connect()
    let settled = false

    const cleanup = () => {
      clearTimeout(timer)
      port.onMessage.removeListener(onMessage)
      port.onDisconnect.removeListener(onDisconnect)
      try { port.disconnect() } catch { /* already disconnected */ }
    }
    const succeed = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onMessage = (response: unknown) => {
      const reason = storageError(response)
      if (reason) {
        fail(new Error(reason))
        return
      }
      try {
        requireMigrationStorageAck(response, expected)
        succeed()
      } catch (error) {
        fail(error)
      }
    }
    const onDisconnect = () => {
      fail(new Error(`The service worker disconnected during migration storage operation '${expected}'.`))
    }
    const timer = setTimeout(() => {
      fail(new Error(`Migration storage operation '${expected}' timed out.`))
    }, timeoutMs)

    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(onDisconnect)
    try {
      port.postMessage(request)
    } catch (error) {
      fail(error)
    }
  })
}
