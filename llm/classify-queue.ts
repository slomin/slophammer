// Serializes classifier work so overlapping requests can never reach the ONNX
// Runtime session concurrently.
//
// Why this exists: four overlapping `classify:run` messages permanently wedged
// the offscreen document — no results, no error, and the document stopped
// responding even to CDP. Sequential requests are stable, so the queue keeps
// `session.run()` strictly one-at-a-time. See the hardening epic.

export interface ClassifyQueueOptions {
  /** Reject rather than queue once this many requests are outstanding. */
  maxPending?: number
  /**
   * Backstop for a task that never settles. Without it the chain never
   * advances and every later request queues behind it forever — the original
   * wedge, just serialized. Generous enough not to fire on a slow cold load.
   */
  taskTimeoutMs?: number
  /**
   * Called once when a task exceeds `taskTimeoutMs`. The session behind that
   * task is suspect — the work is still running and cannot be cancelled — so
   * the owner should dispose and rebuild it, then call `reset()`.
   */
  onTaskTimeout?: () => void
}

export interface ClassifyQueue<T, R> {
  run(input: T): Promise<R>
  pending(): number
  /** Resolves once everything currently queued has settled. */
  drain(): Promise<void>
  /** Return to service after the owner has rebuilt the classifier. */
  reset(): void
}

export const DEFAULT_MAX_PENDING = 8
export const DEFAULT_TASK_TIMEOUT_MS = 10 * 60_000

export const QUEUE_POISONED_MESSAGE =
  'Classifier is no longer accepting work — a previous run timed out and the session is being rebuilt.'

export function createClassifyQueue<T, R>(
  task: (input: T) => Promise<R> | R,
  options: ClassifyQueueOptions = {},
): ClassifyQueue<T, R> {
  const maxPending = options.maxPending ?? DEFAULT_MAX_PENDING
  const taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS
  // `tail` is the promise every new task chains onto, which is what enforces
  // one-at-a-time execution.
  let tail: Promise<unknown> = Promise.resolve()
  let pending = 0
  // A timed-out task is still running inside the ONNX session. We must not
  // start anything else on that session, but we also must not leave callers
  // waiting on a chain that will never advance, so the queue stops taking work
  // until the owner rebuilds. Both wedges are avoided; neither is traded for
  // the other.
  let poisoned = false
  // Tasks still waiting for their turn. Their `operation` is chained onto the
  // hung tail, so it will never settle on its own — they have to be rejected
  // explicitly or their callers wait forever.
  const waiting = new Set<(error: Error) => void>()

  function poison(): void {
    if (poisoned) return
    poisoned = true
    // Nothing queued can ever run now, so free the slots and let `drain()`
    // resolve — otherwise model:load and the pre-v1 migration shutdown hang.
    pending = 0
    tail = Promise.resolve()
    for (const abort of waiting) abort(new Error(QUEUE_POISONED_MESSAGE))
    waiting.clear()
    options.onTaskTimeout?.()
  }

  return {
    pending: () => pending,

    drain: () => tail.then(() => undefined, () => undefined),

    reset() {
      poisoned = false
      pending = 0
      tail = Promise.resolve()
      waiting.clear()
    },

    run(input: T): Promise<R> {
      if (poisoned) return Promise.reject(new Error(QUEUE_POISONED_MESSAGE))
      if (pending >= maxPending) {
        return Promise.reject(
          new Error(`Classifier is busy — ${pending} requests are already queued.`),
        )
      }
      pending += 1

      // `operation` is the real, non-cancellable ONNX work. The caller-facing
      // timeout must not replace it as the serialization tail: doing so lets a
      // later task enter the same session while timed-out work is still alive.
      let markStarted!: () => void
      const started = new Promise<void>((resolve) => {
        markStarted = resolve
      })
      let abort!: (error: Error) => void
      const aborted = new Promise<never>((_, reject) => {
        abort = reject
      })
      aborted.catch(() => {})
      waiting.add(abort)
      const operation = tail.then(() => {
        // A queue poisoned while this task waited must not start it.
        if (poisoned) throw new Error(QUEUE_POISONED_MESSAGE)
        waiting.delete(abort)
        markStarted()
        return Promise.resolve(task(input))
      })
      tail = operation.then(
        () => undefined,
        () => undefined,
      )
      void operation
        .finally(() => {
          if (!poisoned) pending -= 1
        })
        .catch(() => {})

      // Waiting in the FIFO is not execution time. Arm only when this task
      // reaches the head, matching the pre-hardening behaviour. A task that
      // never reaches the head still settles, because poisoning rejects it.
      const executed = started.then(
        () =>
          new Promise<R>((resolve, reject) => {
            const timer = setTimeout(() => {
              // Reject this caller first, then poison — the poison sweep must
              // not overwrite the specific timeout error with the generic one.
              reject(new Error(`Classification timed out after ${taskTimeoutMs}ms.`))
              poison()
            }, taskTimeoutMs)
            operation.then(
              (value) => {
                clearTimeout(timer)
                resolve(value)
              },
              (err) => {
                clearTimeout(timer)
                reject(err)
              },
            )
          }),
      )
      return Promise.race([executed, aborted])
    },
  }
}
