import { describe, expect, it, vi } from 'vitest'
import { waitForMigrationReady } from '@/migration/gate'
import { migrationState } from '@/migration/state'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('waitForMigrationReady', () => {
  it('waits for a runner that is active before its first journal write', async () => {
    const active = deferred<void>()
    const runner = { running: () => true, run: vi.fn(() => active.promise) }
    const readJournal = vi.fn().mockResolvedValue(null)

    let passed = false
    const waiting = waitForMigrationReady(runner, readJournal).then(() => { passed = true })
    await Promise.resolve()

    expect(passed).toBe(false)
    expect(runner.run).toHaveBeenCalledOnce()
    expect(readJournal).not.toHaveBeenCalled()

    active.resolve()
    await waiting
  })

  it('catches a runner that starts while the journal read is in flight', async () => {
    const journal = deferred<null>()
    const active = deferred<void>()
    let running = false
    const runner = { running: () => running, run: vi.fn(() => active.promise) }
    const waiting = waitForMigrationReady(runner, () => journal.promise)

    running = true
    journal.resolve(null)
    await Promise.resolve()
    expect(runner.run).toHaveBeenCalledOnce()

    active.resolve()
    await waiting
  })

  it('starts a resumable journal and ignores a ready journal', async () => {
    const runner = { running: () => false, run: vi.fn().mockResolvedValue(undefined) }
    await waitForMigrationReady(runner, async () => migrationState('wiping', { destructive: true }))
    expect(runner.run).toHaveBeenCalledOnce()

    runner.run.mockClear()
    await waitForMigrationReady(runner, async () => migrationState('ready', { progress: 100, destructive: true }))
    expect(runner.run).not.toHaveBeenCalled()
  })
})
