import { createClassifierRepository } from '@/llm'
import type { ClassifierRepository } from '@/llm'
import { startBrowserClassifierWorker } from '@/llm/classifier-worker-client'
import { createClassifyQueue, type ClassifyQueue } from '@/llm/classify-queue'
import {
  DEFAULT_CLASSIFY_TIMEOUT_MS,
  DEFAULT_INIT_TIMEOUT_MS,
} from '@/llm/classifier-worker-client'
import type { ClassifyResult } from '@/llm/classify-result'
import type { RuntimeDiagnostics } from '@/llm/execution-provider'
import { isModelInstalled } from '@/llm/opfs-model-reader'
import { createSharedClassifier } from '@/llm/shared-classifier'
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

interface RuntimeStats {
  diagnostics?: RuntimeDiagnostics
  sessionCreations: number
  runCount: number
  inFlight: number
  maxConcurrentRuns: number
}

const runtimeStats: RuntimeStats = {
  sessionCreations: 0,
  runCount: 0,
  inFlight: 0,
  maxConcurrentRuns: 0,
}

// Declared before `publishRuntimeStats` reads it. As a `const` below, the
// `?.` guard was decoration: an early call throws a TDZ ReferenceError that
// optional chaining cannot catch.
let classifyQueue: ClassifyQueue<string, ClassifyResult> | undefined

function publishRuntimeStats(): void {
  document.documentElement.dataset.runtimeDiagnostics = JSON.stringify({
    ...runtimeStats.diagnostics,
    sessionCreations: runtimeStats.sessionCreations,
    runCount: runtimeStats.runCount,
    inFlight: runtimeStats.inFlight,
    maxConcurrentRuns: runtimeStats.maxConcurrentRuns,
    queueDepth: classifyQueue?.pending() ?? 0,
  })
}

function startFactory(): Promise<ClassifierRepository> {
  return createClassifierRepository({
    isModelInstalled,
    createOnnxClassifier: () =>
      startBrowserClassifierWorker({
        runtimeBaseUrl: chrome.runtime.getURL('ort/'),
        onProgress: (ratio) => {
          const pct = Math.round(2 + ratio * 78)
          void broadcast({ type: 'model:status', status: 'loading', progress: pct })
        },
        onAttempt: ({ provider, fallbackReason }) => {
          void broadcast({ type: 'model:status', status: 'loading', provider })
          if (provider === 'wasm') {
            log.info('using local CPU/WASM fallback', { reason: fallbackReason })
          } else {
            log.debug('initializing WebGPU provider')
          }
        },
        onDiagnostic: (diagnostic) => log.error('classifier initialization detail', diagnostic),
      }),
    onStatus: broadcast,
  })
}

// A rejected classifier promise is an expected state (no model installed or
// neither provider could initialize). Every classify surfaces the reason to
// the user; this guard only stops an unhandled-rejection report.
function trackFactory(): Promise<ClassifierRepository> {
  const p = startFactory().then((repository) => {
    runtimeStats.sessionCreations += 1
    runtimeStats.diagnostics = repository.runtimeDiagnostics
    publishRuntimeStats()
    return repository
  })
  p.catch((err) => log.warn('classifier unavailable', String(err)))
  return p
}

// Stay cold until a classification has passed the migration gate or an
// explicit model:load arrives. Eager startup can race a pre-v1 migration and
// begin loading the retired model in the brief window before its journal is
// created and the shutdown phase runs.
const classifier = createSharedClassifier(trackFactory)

function classifierPromise(): Promise<ClassifierRepository> {
  return classifier.get()
}

// Set only by the migration shutdown, which deliberately blocks classification
// until the update finishes. Every other failure is worth retrying.
let blockedForUpdate = false

// Lifecycle operations must not interleave: a model:load arriving while a wedge
// recovery is awaiting dispose used to leave one of the two freshly built
// classifiers orphaned, never disposed, holding a worker and a full session.
let lifecycle: Promise<unknown> = Promise.resolve()
function serialiseLifecycle<T>(work: () => Promise<T>): Promise<T> {
  const next = lifecycle.then(work, work)
  lifecycle = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

// A worker that crashed or was terminated after a timeout leaves the shared
// promise resolved with a dead repository; a failed rebuild leaves it rejected.
// Either way, caching it means every later classify fails forever, so rebuild
// rather than handing the corpse out again.
async function activeClassifier(): Promise<ClassifierRepository> {
  // A deliberate block must surface its reason, never trigger a rebuild.
  if (blockedForUpdate) return classifierPromise()
  let repo: ClassifierRepository
  try {
    repo = await classifierPromise()
  } catch (err) {
    log.warn('classifier promise is rejected — rebuilding for this request', String(err))
    forgetDiagnostics()
    const rebuilt = trackFactory()
    classifier.replace(rebuilt)
    return rebuilt
  }
  if (!repo.isDisposed?.()) return repo
  log.warn('classifier session is gone — rebuilding before this request')
  forgetDiagnostics()
  const next = trackFactory()
  classifier.replace(next)
  return next
}

// Diagnostics describe a session that exists. Keeping them after one is
// disposed makes `pnpm debug status` and the QA suite report a live provider
// for a classifier that is not running.
function forgetDiagnostics(): void {
  runtimeStats.diagnostics = undefined
  // A wedged classify never runs its `finally`, so without this the counter
  // stays above zero for the rest of the session and every later run inflates
  // maxConcurrentRuns.
  runtimeStats.inFlight = 0
  publishRuntimeStats()
}

/**
 * The single way the classifier is torn down and replaced.
 *
 * Deliberately never waits for the queue to drain. Draining from here is a
 * circular wait: the shared promise is what a queued task resolves its
 * repository through, so a task still in the queue cannot finish until this
 * function installs a new promise, and this function cannot finish until that
 * task drains. Disposing is the better tool anyway — it terminates the worker,
 * which is the only thing that actually stops an in-flight ONNX run, and which
 * rejects every outstanding request cleanly. Callers get an error instead of a
 * hang, and the queue's tail advances on its own.
 */
function replaceClassifier(reason: string, options: { block?: boolean } = {}): Promise<void> {
  const block = options.block === true
  return serialiseLifecycle(async () => {
    const previous = classifier.current()
    // Install the placeholder *first*: until it is in place a request can slip
    // in and rebuild a classifier this teardown is about to discard.
    const placeholder = Promise.reject<ClassifierRepository>(new Error(reason))
    placeholder.catch(() => {})
    blockedForUpdate = block
    classifier.replace(placeholder)
    forgetDiagnostics()

    const old = await previous?.catch(() => null)
    if (old?.dispose) {
      try {
        await old.dispose()
        log.debug('released the previous classifier session')
      } catch (err) {
        // Tolerated: a release can fail on a lost device or an already-gone
        // session, and the worker is terminated either way.
        log.warn('failed to release the previous session', String(err))
      }
    }
    // Safe unconditionally now — the old session is gone, so nothing the queue
    // starts next can overlap it.
    classifyQueue?.reset()
    log.info('classifier released', { reason })
  })
}

// Deliberately lazy: the likely cause of a wedge is memory pressure, so
// rebuilding a full session immediately would compete with the very condition
// that caused it. `activeClassifier` builds one on the next request.
function recoverFromWedge(): Promise<void> {
  return replaceClassifier('Classifier is restarting after a wedged run.')
}

// Every classification goes through this queue so overlapping requests can
// never reach the ONNX Runtime session at the same time. Resolving the shared
// promise inside the task means a re-initialised classifier (model:load) is picked up
// by the next queued request.
classifyQueue = createClassifyQueue(
  (text: string) =>
    activeClassifier().then(async (repo) => {
      runtimeStats.runCount += 1
      runtimeStats.inFlight += 1
      runtimeStats.maxConcurrentRuns = Math.max(
        runtimeStats.maxConcurrentRuns,
        runtimeStats.inFlight,
      )
      publishRuntimeStats()
      try {
        return await repo.classify(text)
      } finally {
        // Clamped: a teardown zeroes this, and the disposal then rejects the
        // in-flight request, so this decrement can arrive after that reset.
        runtimeStats.inFlight = Math.max(0, runtimeStats.inFlight - 1)
        publishRuntimeStats()
      }
    }),
  {
    // The queue's timer starts when a task reaches the head, which is *before*
    // the classifier promise resolves — so on a cold start it covers worker
    // init as well as the classification. Sized above both, or it would poison
    // a perfectly healthy worker that was merely still initialising, instead of
    // letting the worker-level timeout recover cleanly.
    taskTimeoutMs: DEFAULT_INIT_TIMEOUT_MS + DEFAULT_CLASSIFY_TIMEOUT_MS + 60_000,
    // A task that outlives that is stuck behind something the worker-level
    // timeout could not recover. The queue stops taking work rather than
    // starting a second run on a session whose first run is still alive, so
    // rebuild the classifier and put it back into service.
    onTaskTimeout: () => {
      log.error('a classification exceeded the queue timeout — rebuilding the classifier')
      void recoverFromWedge()
    },
  },
)

publishRuntimeStats()

log.info('offscreen booted')

async function reinitialiseClassifier(): Promise<void> {
  log.info('model:load received — re-initialising classifier', {
    queued: classifyQueue?.pending() ?? 0,
  })
  await replaceClassifier('Classifier is reloading after a model change.')
  // This is the operation that lifts a block, so it says so explicitly rather
  // than relying on a side effect of starting a factory.
  blockedForUpdate = false
  // Rebuilt eagerly, unlike wedge recovery: a model:load means the user just
  // installed something and is about to use it.
  const next = trackFactory()
  classifier.replace(next)
  next.catch((err) => log.warn('classifier unavailable', String(err)))
}

async function shutdownClassifier(): Promise<void> {
  // Routed through the same primitive, so it can no longer race a model:load
  // and orphan a live worker while the migration clears OPFS underneath it.
  await replaceClassifier('SlopHammer update in progress.', { block: true })
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
    queued: classifyQueue?.pending() ?? 0,
  })
  try {
    const wordCount = countWords(text)
    if (wordCount < MIN_SELECTION_WORDS) {
      throw new Error(
        `Too short to judge — select at least ${MIN_SELECTION_WORDS} words (${wordCount} selected)`,
      )
    }
    let result
    try {
      result = await withHeartbeat(
        async () => {
          await ensureMigrationReady()
          return classifyQueue!.run(text)
        },
        () => { void broadcast({ type: 'model:status', status: 'loading' }) },
        HEARTBEAT_MS,
      )
    } finally {
      // The in-task publish runs inside the queue's own task, before the queue
      // decrements its pending count, so the snapshot it leaves behind always
      // overstates queueDepth by one. Republish once the queue has settled so
      // `pnpm debug status` reports the real depth.
      publishRuntimeStats()
    }
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
