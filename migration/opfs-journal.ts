import type { MigrationState } from './state'

export const MIGRATION_JOURNAL_FILE = '.slophammer-v1-migration.json'

async function root(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory()
}

export async function readMigrationJournal(): Promise<MigrationState | null> {
  try {
    const handle = await (await root()).getFileHandle(MIGRATION_JOURNAL_FILE, { create: false })
    const value: unknown = JSON.parse(await (await handle.getFile()).text())
    if (!value || typeof value !== 'object' || typeof (value as MigrationState).phase !== 'string') {
      return null
    }
    return value as MigrationState
  } catch {
    return null
  }
}

export async function writeMigrationJournal(state: MigrationState): Promise<void> {
  const handle = await (await root()).getFileHandle(MIGRATION_JOURNAL_FILE, { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(state))
  await writable.close()
}
