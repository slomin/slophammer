import { describe, expect, it, vi } from 'vitest'
import { createClassifyQueue, DEFAULT_TASK_TIMEOUT_MS } from '@/llm/classify-queue'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createClassifyQueue', () => {
  it('never runs two tasks concurrently', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const queue = createClassifyQueue(async (text: string) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return text.toUpperCase()
    })

    await Promise.all(['a', 'b', 'c', 'd'].map((t) => queue.run(t)))

    expect(maxInFlight).toBe(1)
  })

  it('resolves each caller with its own result, in order', async () => {
    const queue = createClassifyQueue(async (text: string) => text + '!')
    const results = await Promise.all(['one', 'two', 'three'].map((t) => queue.run(t)))
    expect(results).toEqual(['one!', 'two!', 'three!'])
  })

  it('runs tasks in FIFO order', async () => {
    const order: string[] = []
    const queue = createClassifyQueue(async (text: string) => {
      order.push(text)
      await new Promise((r) => setTimeout(r, 1))
      return text
    })
    await Promise.all(['first', 'second', 'third'].map((t) => queue.run(t)))
    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('a rejected task does not stall the queue', async () => {
    const run = vi.fn(async (text: string) => {
      if (text === 'boom') throw new Error('inference failed')
      return text
    })
    const queue = createClassifyQueue(run)

    const failing = queue.run('boom')
    const following = queue.run('after')

    await expect(failing).rejects.toThrow(/inference failed/)
    await expect(following).resolves.toBe('after')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('a task that rejects synchronously still lets later tasks run', async () => {
    const queue = createClassifyQueue((text: string) => {
      if (text === 'sync-boom') throw new Error('threw before awaiting')
      return Promise.resolve(text)
    })
    await expect(queue.run('sync-boom')).rejects.toThrow(/threw before awaiting/)
    await expect(queue.run('ok')).resolves.toBe('ok')
  })

  it('reports how many tasks are waiting', async () => {
    const gate = deferred<void>()
    const queue = createClassifyQueue(async (text: string) => {
      await gate.promise
      return text
    })

    expect(queue.pending()).toBe(0)
    const all = Promise.all([queue.run('a'), queue.run('b'), queue.run('c')])
    expect(queue.pending()).toBe(3)

    gate.resolve()
    await all
    expect(queue.pending()).toBe(0)
  })

  it('rejects new work beyond maxPending instead of growing without bound', async () => {
    const gate = deferred<void>()
    const queue = createClassifyQueue(
      async (text: string) => {
        await gate.promise
        return text
      },
      { maxPending: 2 },
    )

    const first = queue.run('a')
    const second = queue.run('b')
    await expect(queue.run('c')).rejects.toThrow(/busy/i)

    gate.resolve()
    await expect(first).resolves.toBe('a')
    await expect(second).resolves.toBe('b')

    // Once drained, the queue accepts work again.
    await expect(queue.run('d')).resolves.toBe('d')
  })
})

// A timed-out ONNX run cannot be cancelled. The caller may stop waiting, but
// the serialization tail must remain attached to the real operation or a
// second request can overlap it and recreate the original runtime wedge.
describe('createClassifyQueue — timeout safety', () => {
  it('allows slow CPU fallback work up to ten minutes by default', () => {
    expect(DEFAULT_TASK_TIMEOUT_MS).toBe(10 * 60_000)
  })

  it('times out a task that never settles', async () => {
    const queue = createClassifyQueue(() => new Promise<string>(() => {}), { taskTimeoutMs: 30 })
    await expect(queue.run('never')).rejects.toThrow(/timed out/i)
  })

  it('does not start later work while the timed-out operation is still running', async () => {
    const firstGate = deferred<string>()
    const started: string[] = []
    const queue = createClassifyQueue(
      (text: string) => {
        started.push(text)
        return text === 'slow' ? firstGate.promise : Promise.resolve(text)
      },
      { taskTimeoutMs: 20 },
    )

    const slow = queue.run('slow')
    // Attach the handler now: poisoning rejects queued callers as soon as the
    // head times out, and a rejection delivered before anyone is listening is
    // reported as unhandled. Real callers `await queue.run(...)` immediately.
    const following = queue.run('following').then(
      () => null,
      (e: unknown) => e as Error,
    )
    await expect(slow).rejects.toThrow(/timed out/i)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(started).toEqual(['slow'])

    // The suspect session is never reused: `following` is rejected rather than
    // run once the hung operation finally settles.
    expect((await following)?.message).toMatch(/no longer accepting/i)
    firstGate.resolve('slow')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(started).toEqual(['slow'])
  })

  it('frees pending slots on timeout so the queue never reports busy forever', async () => {
    const gate = deferred<string>()
    const queue = createClassifyQueue(() => gate.promise, {
      taskTimeoutMs: 20,
      maxPending: 2,
    })
    await expect(queue.run('a')).rejects.toThrow(/timed out/i)
    expect(queue.pending()).toBe(0)
    gate.resolve('done')
    await queue.drain()
    expect(queue.pending()).toBe(0)
  })
})

describe('createClassifyQueue — drain', () => {
  it('resolves once queued work has settled', async () => {
    const done: string[] = []
    const queue = createClassifyQueue(async (text: string) => {
      await new Promise((r) => setTimeout(r, 5))
      done.push(text)
      return text
    })
    void queue.run('a')
    void queue.run('b')
    await queue.drain()
    expect(done).toEqual(['a', 'b'])
    expect(queue.pending()).toBe(0)
  })

  it('resolves even when the queued work failed', async () => {
    const queue = createClassifyQueue(async () => {
      throw new Error('inference failed')
    })
    queue.run('boom').catch(() => {})
    await expect(queue.drain()).resolves.toBeUndefined()
  })

  it('resolves immediately on an idle queue', async () => {
    const queue = createClassifyQueue(async (t: string) => t)
    await expect(queue.drain()).resolves.toBeUndefined()
  })
})


// The serialization tail is attached to the real, un-cancellable ONNX
// operation so a timed-out run can never overlap the next one. That is correct,
// but it means a task which never settles would otherwise strand the chain:
// callers queued behind it never settle at all, `pending` never drops, and
// `drain()` never resolves — so model:load and the pre-v1 migration hang too.
// A timeout therefore poisons the queue: everyone gets an error, nothing new is
// started on the suspect session, and the owner is told to rebuild.
describe('createClassifyQueue — a task that never settles', () => {
  it('rejects the caller queued behind the hung task instead of hanging forever', async () => {
    const queue = createClassifyQueue(
      (text: string) => (text === 'hang' ? new Promise<string>(() => {}) : Promise.resolve(text)),
      { taskTimeoutMs: 20 },
    )
    const head = queue.run('hang')
    const behind = queue.run('behind').then(
      () => null,
      (e: unknown) => e as Error,
    )

    await expect(head).rejects.toThrow(/timed out/i)
    expect((await behind)?.message).toMatch(/no longer accepting/i)
  })

  it('never starts queued work on the suspect session', async () => {
    const started: string[] = []
    const queue = createClassifyQueue(
      (text: string) => {
        started.push(text)
        return text === 'hang' ? new Promise<string>(() => {}) : Promise.resolve(text)
      },
      { taskTimeoutMs: 20 },
    )
    await expect(queue.run('hang')).rejects.toThrow(/timed out/i)
    await expect(queue.run('after')).rejects.toThrow(/no longer accepting/i)
    await new Promise((r) => setTimeout(r, 40))
    expect(started).toEqual(['hang'])
  })

  it('releases pending slots so the queue never reports busy forever', async () => {
    const queue = createClassifyQueue(() => new Promise<string>(() => {}), {
      taskTimeoutMs: 20,
      maxPending: 2,
    })
    await expect(queue.run('a')).rejects.toThrow(/timed out/i)
    expect(queue.pending()).toBe(0)
  })

  it('drain resolves so model:load and migration shutdown cannot hang', async () => {
    const queue = createClassifyQueue(() => new Promise<string>(() => {}), { taskTimeoutMs: 20 })
    await expect(queue.run('a')).rejects.toThrow(/timed out/i)
    await expect(
      Promise.race([
        queue.drain().then(() => 'drained'),
        new Promise((r) => setTimeout(() => r('HUNG'), 200)),
      ]),
    ).resolves.toBe('drained')
  })

  it('tells the owner to rebuild, exactly once', async () => {
    const onTaskTimeout = vi.fn()
    const queue = createClassifyQueue(() => new Promise<string>(() => {}), {
      taskTimeoutMs: 20,
      onTaskTimeout,
    })
    await expect(queue.run('a')).rejects.toThrow(/timed out/i)
    await expect(queue.run('b')).rejects.toThrow(/no longer accepting/i)
    expect(onTaskTimeout).toHaveBeenCalledTimes(1)
  })

  it('reset brings the queue back into service after a rebuild', async () => {
    let hang = true
    const queue = createClassifyQueue(
      (text: string) => (hang ? new Promise<string>(() => {}) : Promise.resolve(text)),
      { taskTimeoutMs: 20 },
    )
    await expect(queue.run('a')).rejects.toThrow(/timed out/i)

    hang = false
    queue.reset()
    await expect(queue.run('b')).resolves.toBe('b')
    expect(queue.pending()).toBe(0)
  })
})


// Recovery has to leave the queue in a clean state. A poisoned queue abandons
// what it was holding; those abandoned tasks must never execute afterwards, and
// must not keep accounting against the rebuilt queue.
describe('createClassifyQueue — recovery bookkeeping', () => {
  it('never runs a task that was abandoned by poisoning', async () => {
    const gate = deferred<string>()
    const started: string[] = []
    const queue = createClassifyQueue(
      (text: string) => {
        started.push(text)
        return text === 'hang' ? gate.promise : Promise.resolve(text)
      },
      { taskTimeoutMs: 20 },
    )
    const head = queue.run('hang')
    const abandoned = queue.run('abandoned').then(
      () => null,
      (e: unknown) => e as Error,
    )
    await expect(head).rejects.toThrow(/timed out/i)
    expect((await abandoned)?.message).toMatch(/no longer accepting/i)

    queue.reset()
    // The wedged task finally returns; its queued follower must stay abandoned
    // rather than waking up and running against the rebuilt session.
    gate.resolve('hang')
    await new Promise((r) => setTimeout(r, 40))
    expect(started).toEqual(['hang'])
  })

  it('keeps pending non-negative across a poison and reset cycle', async () => {
    const gate = deferred<string>()
    const queue = createClassifyQueue(
      (text: string) => (text === 'hang' ? gate.promise : Promise.resolve(text)),
      { taskTimeoutMs: 20 },
    )
    const head = queue.run('hang')
    const queued = queue.run('queued').then(
      () => null,
      () => null,
    )
    await expect(head).rejects.toThrow(/timed out/i)
    await queued
    queue.reset()

    gate.resolve('late')
    await new Promise((r) => setTimeout(r, 40))
    expect(queue.pending()).toBe(0)
    expect(queue.pending()).toBeGreaterThanOrEqual(0)
  })

  it('serializes again after a reset', async () => {
    let hang = true
    let inFlight = 0
    let maxInFlight = 0
    const queue = createClassifyQueue(
      async (text: string) => {
        if (hang) return new Promise<string>(() => {})
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight -= 1
        return text
      },
      { taskTimeoutMs: 20 },
    )
    await expect(queue.run('hang')).rejects.toThrow(/timed out/i)
    hang = false
    queue.reset()

    const results = await Promise.all(['a', 'b', 'c'].map((t) => queue.run(t)))
    expect(results).toEqual(['a', 'b', 'c'])
    expect(maxInFlight).toBe(1)
    expect(queue.pending()).toBe(0)
  })
})


describe('createClassifyQueue — reset must not strand a waiting caller', () => {
  it('rejects a task still waiting for its turn when the queue is reset', async () => {
    const gate = deferred<string>()
    const queue = createClassifyQueue(
      (text: string) => (text === 'hold' ? gate.promise : Promise.resolve(text)),
      { taskTimeoutMs: 60_000 },
    )
    queue.run('hold').catch(() => {})
    const waiting = queue.run('waiting').then(
      () => null,
      (e: unknown) => e as Error,
    )

    queue.reset()
    const outcome = await Promise.race([
      waiting,
      new Promise((r) => setTimeout(() => r('STRANDED'), 300)),
    ])
    expect(outcome).not.toBe('STRANDED')
    expect((outcome as Error)?.message).toMatch(/abandoned/i)
    gate.resolve('hold')
  })
})
