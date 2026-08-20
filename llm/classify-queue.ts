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
}

export interface ClassifyQueue<T, R> {
  run(input: T): Promise<R>
  pending(): number
  /** Resolves once everything currently queued has settled. */
  drain(): Promise<void>
}

export const DEFAULT_MAX_PENDING = 8
export const DEFAULT_TASK_TIMEOUT_MS = 10 * 60_000

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

  return {
    pending: () => pending,

    drain: () => tail.then(() => undefined, () => undefined),

    run(input: T): Promise<R> {
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
      const operation = tail.then(() => {
        markStarted()
        return Promise.resolve(task(input))
      })
      tail = operation.then(
        () => undefined,
        () => undefined,
      )
      void operation.finally(() => {
        pending -= 1
      }).catch(() => {})

      // Waiting in the FIFO is not execution time. Arm only when this task
      // reaches the head, matching the pre-hardening behaviour.
      return started.then(
        () =>
          new Promise<R>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`Classification timed out after ${taskTimeoutMs}ms.`)),
              taskTimeoutMs,
            )
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
    },
  }
}
