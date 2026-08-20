import type { MigrationState } from './state'

export interface MigrationRunnerHandle {
  run(): Promise<void>
  running(): boolean
}

/**
 * Do not let classification cross an active or journaled migration.
 *
 * The runner becomes active synchronously, before its first asynchronous OPFS
 * journal write. Check both before and after reading the journal so a
 * migration that starts in either gap is awaited rather than bypassed.
 */
export async function waitForMigrationReady(
  runner: MigrationRunnerHandle,
  readJournal: () => Promise<MigrationState | null>,
): Promise<void> {
  if (runner.running()) {
    await runner.run()
    return
  }

  const journal = await readJournal()

  if (runner.running()) {
    await runner.run()
    return
  }
  if (journal && journal.phase !== 'ready') {
    await runner.run()
  }
}
