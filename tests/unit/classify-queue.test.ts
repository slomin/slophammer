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
    const following = queue.run('following')
    await expect(slow).rejects.toThrow(/timed out/i)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(started).toEqual(['slow'])

    firstGate.resolve('slow')
    await expect(following).resolves.toBe('following')
    expect(started).toEqual(['slow', 'following'])
  })

  it('keeps the pending slot until the underlying task settles', async () => {
    const gate = deferred<string>()
    const queue = createClassifyQueue(() => gate.promise, {
      taskTimeoutMs: 20,
      maxPending: 2,
    })
    await expect(queue.run('a')).rejects.toThrow(/timed out/i)
    expect(queue.pending()).toBe(1)
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
