/// <reference lib="webworker" />

import type { ClassifierRepository } from './classifier-repository'
import type {
  ClassifierWorkerRequest,
  ClassifierWorkerResponse,
} from './classifier-worker-protocol'
import { RuntimeInitializationError } from './execution-provider'
import { setupOnnxClassifier } from './onnx-setup'

const scope = self as DedicatedWorkerGlobalScope
let repositoryPromise: Promise<ClassifierRepository> | null = null
// Deliberately a second serializer, on top of the offscreen document's queue.
// It is redundant today — that queue submits one classify at a time, so this
// chain never holds more than one entry — but it guards the thing that actually
// breaks: two concurrent `session.run()` calls permanently wedged inference and
// took the whole offscreen document down with them. This lives at the session
// boundary, so a future caller that reaches the worker by another route cannot
// reintroduce that failure. Backpressure and visibility stay with the offscreen
// queue, which is where `queueDepth` and `maxPending` are reported from.
let tail: Promise<unknown> = Promise.resolve()

function post(message: ClassifierWorkerResponse): void {
  scope.postMessage(message)
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function initialise(runtimeBaseUrl: string): Promise<ClassifierRepository> {
  if (repositoryPromise) return repositoryPromise
  repositoryPromise = setupOnnxClassifier({
    runtimeBaseUrl,
    onProgress: (progress) => post({ type: 'init:progress', ...progress }),
    onAttempt: (attempt) => post({ type: 'init:attempt', ...attempt }),
  })
  repositoryPromise.then(
    (repository) => {
      // Throwing here would reject a derived promise nobody handles, which does
      // not fire the Worker `error` event either — the client would post neither
      // init:ready nor init:error and simply sit on its 10-minute init timeout.
      if (!repository.runtimeDiagnostics) {
        const error = 'Classifier initialized without runtime diagnostics.'
        console.error('[SlopHammer:classifier-worker]', error)
        post({ type: 'init:error', error, diagnostic: error })
        return
      }
      post({ type: 'init:ready', diagnostics: repository.runtimeDiagnostics })
    },
    (error) => {
      const diagnostic =
        error instanceof RuntimeInitializationError ? error.diagnosticMessage() : message(error)
      console.error('[SlopHammer:classifier-worker] initialization failed', diagnostic)
      post({ type: 'init:error', error: message(error), diagnostic })
    },
  )
  return repositoryPromise
}

function classify(requestId: string, text: string): void {
  const operation = tail.then(async () => {
    if (!repositoryPromise) throw new Error('Classifier worker is not initialized.')
    const repository = await repositoryPromise
    return repository.classify(text)
  })
  tail = operation.catch(() => {})
  void operation.then(
    (result) => post({ type: 'classify:result', requestId, result }),
    (error) => post({ type: 'classify:error', requestId, error: message(error) }),
  )
}

function dispose(requestId: string): void {
  const operation = tail.then(async () => {
    const repository = await repositoryPromise?.catch(() => null)
    await repository?.dispose?.()
    repositoryPromise = null
    post({ type: 'dispose:done', requestId })
  })
  tail = operation.catch(() => {})
}

scope.addEventListener('message', (event: MessageEvent<ClassifierWorkerRequest>) => {
  const request = event.data
  switch (request.type) {
    case 'init':
      void initialise(request.runtimeBaseUrl)
      break
    case 'classify':
      classify(request.requestId, request.text)
      break
    case 'dispose':
      dispose(request.requestId)
      break
  }
})
