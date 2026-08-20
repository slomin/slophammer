import { describe, expect, it, vi } from 'vitest'
import {
  createClassifierWorkerClient,
  type ClassifierWorkerLike,
} from '@/llm/classifier-worker-client'
import type { ClassifierWorkerResponse } from '@/llm/classifier-worker-protocol'

class FakeWorker implements ClassifierWorkerLike {
  readonly posted: unknown[] = []
  readonly terminate = vi.fn()
  private readonly messageListeners = new Set<(event: MessageEvent<ClassifierWorkerResponse>) => void>()
  private readonly errorListeners = new Set<(event: ErrorEvent) => void>()
  private readonly messageErrorListeners = new Set<(event: MessageEvent) => void>()

  postMessage(message: unknown): void {
    this.posted.push(message)
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === 'message') this.messageListeners.add(listener as (event: MessageEvent<ClassifierWorkerResponse>) => void)
    if (type === 'error') this.errorListeners.add(listener as (event: ErrorEvent) => void)
    if (type === 'messageerror') this.messageErrorListeners.add(listener as (event: MessageEvent) => void)
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (type === 'message') this.messageListeners.delete(listener as (event: MessageEvent<ClassifierWorkerResponse>) => void)
    if (type === 'error') this.errorListeners.delete(listener as (event: ErrorEvent) => void)
    if (type === 'messageerror') this.messageErrorListeners.delete(listener as (event: MessageEvent) => void)
  }

  emit(data: ClassifierWorkerResponse): void {
    for (const listener of this.messageListeners) listener({ data } as MessageEvent<ClassifierWorkerResponse>)
  }

  fail(message: string): void {
    for (const listener of this.errorListeners) listener({ message } as ErrorEvent)
  }
}

const result = {
  probs: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
  rawPct: [10, 20, 30, 40] as [number, number, number, number],
  bucketLabels: ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'] as [string, string, string, string],
  extLlr: 4.2,
  threshold: 3.8088,
  verdict: 'flagged' as const,
  tokenCount: 40,
  analysedTokens: 512,
  truncated: false,
}

describe('classifier worker client', () => {
  it('initialises one worker, reuses its session, and releases it', async () => {
    const worker = new FakeWorker()
    const progress: number[] = []
    const ready = createClassifierWorkerClient({
      worker,
      runtimeBaseUrl: 'chrome-extension://id/ort/',
      onProgress: (value) => progress.push(value),
    })

    expect(worker.posted).toEqual([
      { type: 'init', runtimeBaseUrl: 'chrome-extension://id/ort/' },
    ])
    worker.emit({ type: 'init:progress', bytesRead: 5, totalBytes: 10 })
    worker.emit({
      type: 'init:ready',
      diagnostics: {
        executionProvider: 'wasm',
        wasmThreads: 2,
        crossOriginIsolated: true,
        fallbackReason: 'No compatible WebGPU adapter was found.',
      },
    })

    const repo = await ready
    expect(progress).toEqual([0.5])
    expect(repo.runtimeDiagnostics?.executionProvider).toBe('wasm')

    const first = repo.classify('first')
    const firstMessage = worker.posted.at(-1) as { type: string; requestId: string }
    worker.emit({ type: 'classify:result', requestId: firstMessage.requestId, result })
    await expect(first).resolves.toEqual(result)

    const second = repo.classify('second')
    const secondMessage = worker.posted.at(-1) as { type: string; requestId: string }
    worker.emit({ type: 'classify:result', requestId: secondMessage.requestId, result })
    await expect(second).resolves.toEqual(result)

    expect(worker.posted.filter((message) => (message as { type?: string }).type === 'init')).toHaveLength(1)
    expect(firstMessage.requestId).not.toBe(secondMessage.requestId)

    const disposed = repo.dispose?.()
    const disposeMessage = worker.posted.at(-1) as { type: string; requestId: string }
    worker.emit({ type: 'dispose:done', requestId: disposeMessage.requestId })
    await disposed
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('rejects initialization and terminates the worker on a fatal worker error', async () => {
    const worker = new FakeWorker()
    const ready = createClassifierWorkerClient({
      worker,
      runtimeBaseUrl: 'chrome-extension://id/ort/',
    })

    worker.fail('worker crashed')
    await expect(ready).rejects.toThrow(/worker crashed/i)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('keeps actionable copy separate from detailed provider diagnostics', async () => {
    const worker = new FakeWorker()
    const diagnostics: string[] = []
    const ready = createClassifierWorkerClient({
      worker,
      runtimeBaseUrl: 'chrome-extension://id/ort/',
      onDiagnostic: (message) => diagnostics.push(message),
    })

    worker.emit({
      type: 'init:error',
      error: 'Neither WebGPU nor local CPU/WASM inference could start. Restart Chrome and try again.',
      diagnostic: 'WebGPU: device lost; CPU/WASM: failed to allocate 900 MB',
    })

    await expect(ready).rejects.toThrow(/restart Chrome/i)
    expect(diagnostics).toEqual([
      'WebGPU: device lost; CPU/WASM: failed to allocate 900 MB',
    ])
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})


// A classify request the worker never answers must not leave the promise
// unsettled: the offscreen queue chains its serialization tail on it, so an
// unsettled request strands every later request behind it. Terminating the
// worker is what actually cancels the in-flight ONNX run — the session cannot
// be interrupted any other way.
describe('classifier worker client — an unanswered classify', () => {
  async function readyClient(classifyTimeoutMs: number) {
    const worker = new FakeWorker()
    const ready = createClassifierWorkerClient({
      worker,
      runtimeBaseUrl: 'chrome-extension://id/ort/',
      classifyTimeoutMs,
    })
    worker.emit({
      type: 'init:ready',
      diagnostics: {
        executionProvider: 'wasm',
        wasmThreads: 4,
        crossOriginIsolated: true,
      },
    })
    return { worker, repo: await ready }
  }

  it('rejects the request rather than hanging forever', async () => {
    const { repo } = await readyClient(20)
    await expect(repo.classify('text')).rejects.toThrow(/timed out/i)
  })

  it('terminates the worker, which is the only way to stop the ONNX run', async () => {
    const { worker, repo } = await readyClient(20)
    await expect(repo.classify('text')).rejects.toThrow(/timed out/i)
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('reports itself disposed so the owner rebuilds instead of reusing it', async () => {
    const { repo } = await readyClient(20)
    expect(repo.isDisposed?.()).toBe(false)
    await expect(repo.classify('text')).rejects.toThrow(/timed out/i)
    expect(repo.isDisposed?.()).toBe(true)
    await expect(repo.classify('again')).rejects.toThrow(/no longer available/i)
  })

  it('does not fire once the worker has answered', async () => {
    const { worker, repo } = await readyClient(60)
    const pending = repo.classify('text')
    const posted = worker.posted.at(-1) as { requestId: string }
    worker.emit({ type: 'classify:result', requestId: posted.requestId, result })
    await expect(pending).resolves.toMatchObject({ verdict: 'flagged' })
    await new Promise((r) => setTimeout(r, 90))
    expect(worker.terminate).not.toHaveBeenCalled()
  })
})
