import { FflateZipReader } from '@/install/fflate-zip-reader'
import { checkHostedForUpdate } from '@/install/hf-update-checker'
import { fetchZipWithProgress } from '@/install/hosted-model-fetcher'
import { runInstall } from '@/install/install-orchestrator'
import { OpfsWriter, wipeModelFiles } from '@/install/opfs-writer'
import { SUPPORTED_ARTIFACT } from '@/llm/supported-artifact'
import type { MigrationStorageOperation } from '@/messaging/protocol'
import { readMigrationJournal, writeMigrationJournal } from './opfs-journal'
import { browserInstalledArtifactReader, hasSupportedInstalledArtifact } from './installed-artifact'
import {
  migrationState,
  type MigrationState,
} from './state'

export interface MigrationRunnerDeps {
  shutdownClassifier(): Promise<void>
  requestStorageClear(): Promise<void>
  requestStorageWrite(operation: MigrationStorageOperation, checkpointId?: string): Promise<void>
  publish(state: MigrationState): Promise<void> | void
  reloadClassifier(): Promise<void>
  readJournal(): Promise<MigrationState | null>
  writeJournal(state: MigrationState): Promise<void>
  hasSupportedInstall(): Promise<boolean>
  markExistingComplete(): Promise<void>
  wipe(): Promise<void>
  download(): Promise<File>
  install(file: File): Promise<void>
  restoreDefaults(): Promise<void>
}

export function createMigrationProgressPublisher(
  phase: Extract<MigrationState['phase'], 'downloading' | 'installing'>,
  publishState: (state: MigrationState) => Promise<void> | void,
): { publish(progress: number): void; flush(): Promise<void> } {
  let lastProgress = -1
  let writes = Promise.resolve()
  return {
    publish(progress) {
      const normalized = Math.max(0, Math.min(100, Math.round(progress)))
      if (normalized === lastProgress) return
      lastProgress = normalized
      writes = writes.then(() => Promise.resolve(
        publishState(migrationState(phase, { progress: normalized, destructive: true })),
      ))
    },
    flush: () => writes,
  }
}

export function createMigrationRunner(deps: MigrationRunnerDeps): {
  run(): Promise<void>
  running(): boolean
} {
  let active: Promise<void> | null = null

  const persist = async (state: MigrationState) => {
    await deps.writeJournal(state)
    await deps.publish(state)
  }

  const perform = async () => {
    const existing = await deps.readJournal()
    if (existing?.phase === 'ready') {
      await deps.publish(existing)
      return
    }
    let destructive = existing?.destructive ?? false
    try {
      await persist(migrationState('pending', { destructive }))
      await deps.shutdownClassifier()
      if (!destructive && await deps.hasSupportedInstall()) {
        await deps.markExistingComplete()
        await persist(migrationState('ready', { progress: 100, destructive: false }))
        await deps.reloadClassifier()
        return
      }
      destructive = true
      await persist(migrationState('wiping', { destructive }))
      await deps.requestStorageClear()
      await deps.wipe()
      await persist(migrationState('downloading', { progress: 0, destructive }))
      const file = await deps.download()
      await persist(migrationState('installing', { progress: 0, destructive }))
      await deps.install(file)
      await deps.restoreDefaults()
      await persist(migrationState('ready', { progress: 100, destructive }))
      await deps.reloadClassifier()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await persist(migrationState('error', { error: reason, destructive }))
      throw error
    }
  }

  return {
    run() {
      if (!active) {
        active = perform().finally(() => {
          active = null
        })
      }
      return active
    },
    running: () => active !== null,
  }
}

export function createBrowserMigrationDeps(args: {
  shutdownClassifier(): Promise<void>
  requestStorageClear(): Promise<void>
  requestStorageWrite(operation: MigrationStorageOperation, checkpointId?: string): Promise<void>
  publish(state: MigrationState): Promise<void> | void
  reloadClassifier(): Promise<void>
}): MigrationRunnerDeps {
  return {
    ...args,
    readJournal: readMigrationJournal,
    writeJournal: writeMigrationJournal,
    hasSupportedInstall: () => hasSupportedInstalledArtifact(browserInstalledArtifactReader()),
    markExistingComplete: () => args.requestStorageWrite('existing-complete'),
    // Offscreen documents only expose chrome.runtime. Storage cleanup is
    // already acknowledged through the service-worker RPC immediately before
    // this OPFS-only wipe.
    wipe: wipeModelFiles,
    async download() {
      const { latest } = await checkHostedForUpdate({ current: null })
      if (!latest) throw new Error('The pinned SlopHammer 350M artifact was not found.')
      const progressUpdates = createMigrationProgressPublisher('downloading', args.publish)
      const { blob } = await fetchZipWithProgress({
        url: latest.url,
        expectedSha256: SUPPORTED_ARTIFACT.sha256,
        onProgress: (progress) => {
          const fraction = progress.totalBytes > 0
            ? Math.round((progress.downloadedBytes / progress.totalBytes) * 100)
            : 0
          progressUpdates.publish(fraction)
        },
      })
      await progressUpdates.flush()
      return new File([blob], SUPPORTED_ARTIFACT.filename, { type: 'application/zip' })
    },
    async install(file) {
      const progressUpdates = createMigrationProgressPublisher('installing', args.publish)
      await runInstall({
        reader: new FflateZipReader(file),
        opfs: new OpfsWriter(),
        marks: {
          setInstalled: (checkpointId) => args.requestStorageWrite('model-marker', checkpointId),
          async persistStorage() {
            try { await navigator.storage.persist?.() } catch { /* best effort */ }
          },
        },
        hostedMeta: {
          filename: SUPPORTED_ARTIFACT.filename,
          lfsOid: SUPPORTED_ARTIFACT.sha256,
          url: `https://huggingface.co/${SUPPORTED_ARTIFACT.repoId}/resolve/main/${SUPPORTED_ARTIFACT.filename}`,
        },
        onProgress: (progress) => {
          progressUpdates.publish(progress.fraction * 100)
        },
      })
      await progressUpdates.flush()
    },
    restoreDefaults: () => args.requestStorageWrite('restore-defaults'),
  }
}
