import type { ClassifierRepository } from './classifier-repository'
import type { ClassifyResult } from './classify-result'
import type {
  ClassifierWorkerRequest,
  ClassifierWorkerResponse,
} from './classifier-worker-protocol'
import type { ProviderAttempt, RuntimeDiagnostics } from './execution-provider'

export interface ClassifierWorkerLike {
  postMessage(message: ClassifierWorkerRequest): void
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
  terminate(): void
}

export interface ClassifierWorkerClientOptions {
  worker: ClassifierWorkerLike
  runtimeBaseUrl: string
  onProgress?: (ratio: number) => void
  onAttempt?: (attempt: ProviderAttempt) => void
  onDiagnostic?: (message: string) => void
  initTimeoutMs?: number
  disposeTimeoutMs?: number
  /**
   * Backstop for a `classify` the worker never answers. The offscreen queue
   * chains its serialization tail on this promise, so an unsettled request
   * strands every request behind it. Must be shorter than the queue's own
   * task timeout so this fires first and recovers cleanly.
   */
  classifyTimeoutMs?: number
}

export const DEFAULT_INIT_TIMEOUT_MS = 10 * 60_000
const DEFAULT_DISPOSE_TIMEOUT_MS = 10_000
// Bounds the worst-case spinner: the offscreen heartbeat keeps the card's 45s
// watchdog re-armed for as long as a request is in flight, so this is what
// actually decides how long a user can stare at a loading card. Kept generous
// because the only hardware measured here is Apple Silicon (1.2s WebGPU, 2.4s
// CPU/WASM) — a false timeout on a slow Chromebook would restart a healthy
// worker, which is worse than waiting. It fires well before the queue's
// last-resort poison, so recovery is a clean worker restart.
export const DEFAULT_CLASSIFY_TIMEOUT_MS = 5 * 60_000

function nextRequestId(sequence: number): string {
  return `worker-${sequence}`
}

export function createClassifierWorkerClient(
  options: ClassifierWorkerClientOptions,
): Promise<ClassifierRepository> {
  const {
    worker,
    runtimeBaseUrl,
    onProgress,
    onAttempt,
    onDiagnostic,
    initTimeoutMs = DEFAULT_INIT_TIMEOUT_MS,
    disposeTimeoutMs = DEFAULT_DISPOSE_TIMEOUT_MS,
    classifyTimeoutMs = DEFAULT_CLASSIFY_TIMEOUT_MS,
  } = options
  let sequence = 0
  let settled = false
  let disposed = false
  let initTimer: ReturnType<typeof setTimeout> | undefined
  let diagnostics: RuntimeDiagnostics | undefined
  const pending = new Map<
    string,
    {
      resolve: (result: ClassifyResult) => void
      reject: (error: Error) => void
      timer?: ReturnType<typeof setTimeout>
    }
  >()

  const settle = (requestId: string) => {
    const request = pending.get(requestId)
    if (!request) return null
    if (request.timer) clearTimeout(request.timer)
    pending.delete(requestId)
    return request
  }
  const disposePending = new Map<string, () => void>()

  let resolveInit!: (repository: ClassifierRepository) => void
  let rejectInit!: (error: Error) => void
  const ready = new Promise<ClassifierRepository>((resolve, reject) => {
    resolveInit = resolve
    rejectInit = reject
  })

  const cleanupListeners = () => {
    worker.removeEventListener('message', onMessage as EventListener)
    worker.removeEventListener('error', onError as EventListener)
    worker.removeEventListener('messageerror', onMessageError as EventListener)
  }

  const fatal = (message: string) => {
    const error = new Error(message)
    if (!settled) {
      settled = true
      clearTimeout(initTimer)
      rejectInit(error)
    }
    for (const request of pending.values()) {
      if (request.timer) clearTimeout(request.timer)
      request.reject(error)
    }
    pending.clear()
    for (const resolve of disposePending.values()) resolve()
    disposePending.clear()
    cleanupListeners()
    worker.terminate()
    disposed = true
  }

  const repository: ClassifierRepository = {
    get runtimeDiagnostics() {
      return diagnostics
    },
    isDisposed: () => disposed,
    classify(text: string): Promise<ClassifyResult> {
      if (disposed) return Promise.reject(new Error('Classifier worker is no longer available.'))
      const requestId = nextRequestId(++sequence)
      const result = new Promise<ClassifyResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          // The ONNX run cannot be interrupted from outside the worker, so the
          // only real cancellation is terminating the worker. `fatal` does that
          // and rejects everything outstanding, which lets the offscreen queue's
          // tail advance instead of stranding every later request.
          pending.delete(requestId)
          reject(new Error(`Classification timed out after ${classifyTimeoutMs}ms.`))
          fatal(`Classifier worker stopped responding after ${classifyTimeoutMs}ms.`)
        }, classifyTimeoutMs)
        pending.set(requestId, { resolve, reject, timer })
      })
      worker.postMessage({ type: 'classify', requestId, text })
      return result
    },
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      const requestId = nextRequestId(++sequence)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          disposePending.delete(requestId)
          resolve()
        }, disposeTimeoutMs)
        disposePending.set(requestId, () => {
          clearTimeout(timer)
          disposePending.delete(requestId)
          resolve()
        })
        worker.postMessage({ type: 'dispose', requestId })
      })
      // Mirror `fatal`: release every waiter and drop their closures. Leaving
      // the timed-out dispose entry in the map kept its timer closure alive for
      // the life of the client, and a second dispose caller hung on its own.
      for (const resolve of disposePending.values()) resolve()
      disposePending.clear()
      const error = new Error('Classifier worker was disposed.')
      for (const request of pending.values()) {
        if (request.timer) clearTimeout(request.timer)
        request.reject(error)
      }
      pending.clear()
      cleanupListeners()
      worker.terminate()
    },
  }

  function onMessage(event: MessageEvent<ClassifierWorkerResponse>) {
    const message = event.data
    switch (message.type) {
      case 'init:progress':
        onProgress?.(message.bytesRead / Math.max(1, message.totalBytes))
        break
      case 'init:attempt':
        onAttempt?.({
          provider: message.provider,
          fallbackReason: message.fallbackReason,
        })
        break
      case 'init:ready':
        if (settled) break
        settled = true
        clearTimeout(initTimer)
        diagnostics = message.diagnostics
        resolveInit(repository)
        break
      case 'init:error':
        if (message.diagnostic) onDiagnostic?.(message.diagnostic)
        fatal(message.error)
        break
      case 'classify:result': {
        const request = settle(message.requestId)
        if (!request) break
        request.resolve(message.result)
        break
      }
      case 'classify:error': {
        const request = settle(message.requestId)
        if (!request) break
        request.reject(new Error(message.error))
        break
      }
      case 'dispose:done': {
        const resolve = disposePending.get(message.requestId)
        if (!resolve) break
        disposePending.delete(message.requestId)
        resolve()
        break
      }
    }
  }

  function onError(event: ErrorEvent) {
    fatal(event.message || 'Classifier worker crashed.')
  }

  function onMessageError() {
    fatal('Classifier worker returned an unreadable message.')
  }

  worker.addEventListener('message', onMessage as EventListener)
  worker.addEventListener('error', onError as EventListener)
  worker.addEventListener('messageerror', onMessageError as EventListener)
  initTimer = setTimeout(
    () => fatal(`Classifier worker did not initialize within ${initTimeoutMs}ms.`),
    initTimeoutMs,
  )
  worker.postMessage({ type: 'init', runtimeBaseUrl })
  return ready
}

export interface BrowserClassifierWorkerOptions {
  runtimeBaseUrl: string
  onProgress?: (ratio: number) => void
  onAttempt?: (attempt: ProviderAttempt) => void
  onDiagnostic?: (message: string) => void
}

export function startBrowserClassifierWorker(
  options: BrowserClassifierWorkerOptions,
): Promise<ClassifierRepository> {
  const worker = new Worker(new URL('./classifier-worker.ts', import.meta.url), {
    type: 'module',
    name: 'slophammer-classifier',
  })
  return createClassifierWorkerClient({ worker, ...options })
}
