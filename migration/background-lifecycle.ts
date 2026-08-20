import {
  V1_DATA_GENERATION,
  migrationIntent,
  shouldPersistV1MigrationIntent,
  shouldStartV1Migration,
  type InstallReason,
  type MigrationIntent,
} from './state'

export interface V1InstalledLifecycleDeps {
  persistIntent(intent: MigrationIntent): Promise<void>
  readCompletedGeneration(): Promise<number | undefined>
  clearIntent(): Promise<void>
  startMigration(): Promise<void>
  resumeMigration(): Promise<void>
}

export function handleV1InstalledLifecycle(
  details: { reason: InstallReason; previousVersion?: string },
  currentVersion: string,
  deps: V1InstalledLifecycleDeps,
): Promise<void> {
  // Invoke the durable write synchronously, before constructing the async
  // continuation or reading any prior state. Startup can recover this marker
  // if Chrome terminates the service worker at any later await boundary.
  const intentWrite = shouldPersistV1MigrationIntent({ ...details, currentVersion })
    ? deps.persistIntent(migrationIntent(details.previousVersion!, currentVersion))
    : Promise.resolve()

  return (async () => {
    await intentWrite
    const completedGeneration = await deps.readCompletedGeneration()
    if (shouldStartV1Migration({ ...details, currentVersion, completedGeneration })) {
      await deps.startMigration()
      return
    }
    if (completedGeneration === V1_DATA_GENERATION) await deps.clearIntent()
    await deps.resumeMigration()
  })()
}
