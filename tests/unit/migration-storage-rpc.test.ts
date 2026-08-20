import { describe, expect, it, vi } from 'vitest'
import { requestMigrationStorage } from '@/migration/storage-rpc'

function fakePort() {
  let messageListener: ((response: unknown) => void) | null = null
  let disconnectListener: (() => void) | null = null
  const port = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn((listener) => { messageListener = listener }),
      removeListener: vi.fn(),
    },
    onDisconnect: {
      addListener: vi.fn((listener) => { disconnectListener = listener }),
      removeListener: vi.fn(),
    },
  }
  return {
    port: port as unknown as chrome.runtime.Port,
    respond: (response: unknown) => messageListener?.(response),
    disconnect: () => disconnectListener?.(),
  }
}

describe('migration storage port RPC', () => {
  it('resolves only after the service worker returns the matching acknowledgement', async () => {
    const fake = fakePort()
    const pending = requestMigrationStorage(
      { type: 'migration:storage-write-request', operation: 'existing-complete' },
      'existing-complete',
      () => fake.port,
    )
    expect(fake.port.postMessage).toHaveBeenCalledOnce()
    fake.respond({ migrationStorage: 'existing-complete' })
    await expect(pending).resolves.toBeUndefined()
    expect(fake.port.disconnect).toHaveBeenCalledOnce()
  })

  it('rejects mismatched responses and disconnects', async () => {
    const fake = fakePort()
    const pending = requestMigrationStorage(
      { type: 'migration:storage-clear-request' },
      'cleared',
      () => fake.port,
    )
    fake.respond({ migrationStorage: 'model-marker' })
    await expect(pending).rejects.toThrow(/acknowledge/)
    expect(fake.port.disconnect).toHaveBeenCalledOnce()
  })

  it('surfaces service-worker failures', async () => {
    const fake = fakePort()
    const pending = requestMigrationStorage(
      { type: 'migration:storage-clear-request' },
      'cleared',
      () => fake.port,
    )
    fake.respond({ migrationStorageError: 'storage failed' })
    await expect(pending).rejects.toThrow('storage failed')
  })

  it('rejects a disconnected service worker instead of hanging', async () => {
    const fake = fakePort()
    const pending = requestMigrationStorage(
      { type: 'migration:storage-clear-request' },
      'cleared',
      () => fake.port,
    )
    fake.disconnect()
    await expect(pending).rejects.toThrow(/disconnected/)
  })

  it('rejects a synchronous port failure instead of leaking listeners', async () => {
    const fake = fakePort()
    vi.mocked(fake.port.postMessage).mockImplementation(() => { throw new Error('port closed') })
    await expect(requestMigrationStorage(
      { type: 'migration:storage-clear-request' },
      'cleared',
      () => fake.port,
    )).rejects.toThrow('port closed')
    expect(fake.port.disconnect).toHaveBeenCalledOnce()
  })
})
