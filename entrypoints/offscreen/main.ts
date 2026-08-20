import { createClassifierRepository } from '@/llm'
import type { ClassifierRepository } from '@/llm'
import { createClassifyQueue } from '@/llm/classify-queue'
import { setupOnnxClassifier } from '@/llm/onnx-setup'
import { isModelInstalled } from '@/llm/opfs-model-reader'
import { MIN_SELECTION_WORDS, countWords } from '@/llm/input-policy'
import { withHeartbeat } from '@/llm/inference-heartbeat'
import { createLogger, installErrorForwarding } from '@/messaging/logger'
import {
  isClassifyRun,
  isModelLoad,
  type MigrationStorageOperation,
  type ClassifyRunMessage,
  type ExtensionMessage,
} from '@/messaging/protocol'
import { createBrowserMigrationDeps, createMigrationRunner } from '@/migration/offscreen-runner'
import { waitForMigrationReady } from '@/migration/gate'
import { readMigrationJournal } from '@/migration/opfs-journal'
import { requestMigrationStorage } from '@/migration/storage-rpc'

installErrorForwarding('offscreen')
const log = createLogger('offscreen')

function broadcast(message: ExtensionMessage): Promise<void> {
  return browser.runtime.sendMessage(message).then(() => {}, () => {
    // Fire-and-forget — no listener is an expected cold-start state.
  })
}

function startFactory(): Promise<ClassifierRepository> {
  return createClassifierRepository({
    isModelInstalled,
    createOnnxClassifier: () =>
      setupOnnxClassifier((p) => {
        const pct = Math.round(2 + (p.bytesRead / Math.max(1, p.totalBytes)) * 78)
        broadcast({ type: 'model:status', status: 'loading', progress: pct })
      }),
    onStatus: broadcast,
  })
}

// A rejected repoPromise is an expected state (no model installed, WebGPU
// unavailable, corrupt install). Every classify surfaces the reason to the
// user; this guard only stops it being reported as an unhandled rejection.
function trackFactory(): Promise<ClassifierRepository> {
  const p = startFactory()
  p.catch((err) => log.warn('classifier unavailable', String(err)))
  return p
}

// Stay cold until a classification has passed the migration gate or an
// explicit model:load arrives. Eager startup can race a pre-v1 migration and
// begin loading the retired model in the brief window before its journal is
// created and the shutdown phase runs.
let repoPromise: Promise<ClassifierRepository> | null = null

function classifierPromise(): Promise<ClassifierRepository> {
  if (!repoPromise) repoPromise = trackFactory()
  return repoPromise
}

// Every classification goes through this queue so overlapping requests can
// never reach the ONNX Runtime session at the same time. Resolving repoPromise
// inside the task means a re-initialised classifier (model:load) is picked up
// by the next queued request.
const classifyQueue = createClassifyQueue((text: string) =>
  classifierPromise().then((repo) => repo.classify(text)),
)

log.info('offscreen booted')

// Replacing the repository without releasing the old session leaks the model
// weights and lets an in-flight inference overlap the new session's setup —
// the concurrency class the queue exists to prevent. Swap only once the queue
// has drained, and release what we are dropping.
async function reinitialiseClassifier(): Promise<void> {
  log.info('model:load received — re-initialising classifier', {
    queued: classifyQueue.pending(),
  })
  const previous = repoPromise
  repoPromise = classifyQueue
    .drain()
    .then(async () => {
      const old = await previous?.catch(() => null)
      if (old?.dispose) {
        try {
          await old.dispose()
          log.debug('released the previous classifier session')
        } catch (err) {
          log.warn('failed to release the previous session', String(err))
        }
      }
      return startFactory()
    })
    .then((repo) => repo)
  repoPromise.catch((err) => log.warn('classifier unavailable', String(err)))
}

async function shutdownClassifier(): Promise<void> {
  const previous = repoPromise
  await classifyQueue.drain()
  const old = await previous?.catch(() => null)
  if (old?.dispose) await old.dispose()
  const blocked = Promise.reject<ClassifierRepository>(new Error('SlopHammer update in progress.'))
  blocked.catch(() => {})
  repoPromise = blocked
}

function requestStorageClear(): Promise<void> {
  return requestMigrationStorage({ type: 'migration:storage-clear-request' }, 'cleared')
}

function requestStorageWrite(
  operation: MigrationStorageOperation,
  checkpointId?: string,
): Promise<void> {
  return requestMigrationStorage(
    { type: 'migration:storage-write-request', operation, checkpointId },
    operation,
  )
}

const migrationRunner = createMigrationRunner(
  createBrowserMigrationDeps({
    shutdownClassifier,
    requestStorageClear,
    requestStorageWrite,
    publish: (state) => broadcast({ type: 'migration:status', state }),
    reloadClassifier: reinitialiseClassifier,
  }),
)

async function ensureMigrationReady(): Promise<void> {
  await waitForMigrationReady(migrationRunner, readMigrationJournal)
}

// The card's watchdog treats a model:status of 'loading' as proof the
// classifier is alive. Progress is only emitted while bytes are being read out
// of OPFS; building the ONNX session afterwards is a long silent step that on a
// cold start alone can outlast the watchdog, producing a false timeout on work
// that then succeeds. A heartbeat covers the whole in-flight period, so a
// genuinely wedged classifier still times out but a slow one does not.
const HEARTBEAT_MS = 10_000

async function handleClassifyRun(message: ClassifyRunMessage): Promise<void> {
  const { requestId, tabId, text } = message
  log.debug('classify:run received', {
    requestId,
    tabId,
    length: text.length,
    queued: classifyQueue.pending(),
  })
  try {
    const wordCount = countWords(text)
    if (wordCount < MIN_SELECTION_WORDS) {
      throw new Error(
        `Too short to judge — select at least ${MIN_SELECTION_WORDS} words (${wordCount} selected)`,
      )
    }
    const result = await withHeartbeat(
      async () => {
        await ensureMigrationReady()
        return classifyQueue.run(text)
      },
      () => { void broadcast({ type: 'model:status', status: 'loading' }) },
      HEARTBEAT_MS,
    )
    log.info('classify:result dispatching', {
      requestId,
      verdict: result.verdict,
      probs: {
        human: result.rawPct[0].toFixed(2),
        lightly: result.rawPct[1].toFixed(2),
        moderately: result.rawPct[2].toFixed(2),
        heavily: result.rawPct[3].toFixed(2),
      },
      extLlr: result.extLlr.toFixed(4),
      threshold: result.threshold.toFixed(4),
    })
    broadcast({ type: 'classify:result', requestId, tabId, result })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('classify failed', error)
    broadcast({ type: 'classify:error', requestId, tabId, error })
  }
}

browser.runtime.onMessage.addListener((raw) => {
  if (raw && typeof raw === 'object' && (raw as { type?: string }).type === 'migration:start') {
    void migrationRunner.run().catch((err) => log.error('migration failed', String(err)))
    return false
  }
  if (raw && typeof raw === 'object' && (raw as { type?: string }).type === 'migration:resume') {
    void ensureMigrationReady().catch((err) => log.error('migration resume failed', String(err)))
    return false
  }
  if (isModelLoad(raw)) {
    void reinitialiseClassifier()
    return false
  }
  if (isClassifyRun(raw)) {
    void handleClassifyRun(raw)
    return false
  }
  return false
})

void readMigrationJournal().then((journal) => {
  if (journal && journal.phase !== 'ready') {
    void migrationRunner.run().catch((err) => log.error('migration resume failed', String(err)))
  }
})
