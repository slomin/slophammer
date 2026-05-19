import { describe, expect, it, vi } from 'vitest'
import {
  createMessageDispatcher,
  forwardToTab,
  type HandlerMap,
  type MessageRouterLogger,
} from '@/background/message-router'
import type { ClassifyResult } from '@/llm/classify-result'
import type { ExtensionMessage } from '@/messaging/protocol'

const sampleResult: ClassifyResult = {
  probs: [0.1, 0.2, 0.3, 0.4],
  rawPct: [10, 20, 30, 40],
  aiScore: 0.9,
  humanPct: 0,
  mixedPct: 0,
  aiPct: 100,
  verdict: 'ai',
  primaryPct: 100,
  primaryLabel: 'AI-Generated',
  headline: 'AI-Generated',
  tokenCount: 10,
  truncated: false,
}

describe('createMessageDispatcher', () => {
  it('dispatches to the matching handler', async () => {
    const onClassifyRun = vi.fn()
    const onClassifyResult = vi.fn()
    const dispatch = createMessageDispatcher({
      'classify:run': onClassifyRun,
      'classify:result': onClassifyResult,
    })

    const msg: ExtensionMessage = { type: 'classify:run', requestId: 'r1', tabId: 42, text: 'hi' }
    await dispatch(msg)

    expect(onClassifyRun).toHaveBeenCalledTimes(1)
    expect(onClassifyRun).toHaveBeenCalledWith(msg)
    expect(onClassifyResult).not.toHaveBeenCalled()
  })

  it('does nothing for unregistered message types', async () => {
    const dispatch = createMessageDispatcher({})
    await expect(
      dispatch({ type: 'classify:run', requestId: 'r1', tabId: 1, text: 'x' }),
    ).resolves.toBeUndefined()
  })

  it('narrows message types inside handlers (compile-time)', async () => {
    const onResult = vi.fn(async (m: { requestId: string; tabId: number; result: ClassifyResult }) => {
      expect(m.result.verdict).toBe('ai')
    })
    const handlers: HandlerMap = { 'classify:result': onResult }
    const dispatch = createMessageDispatcher(handlers)
    await dispatch({ type: 'classify:result', requestId: 'r1', tabId: 1, result: sampleResult })
    expect(onResult).toHaveBeenCalledOnce()
  })

  it('propagates handler errors', async () => {
    const dispatch = createMessageDispatcher({
      'classify:run': async () => {
        throw new Error('boom')
      },
    })
    await expect(
      dispatch({ type: 'classify:run', requestId: 'r1', tabId: 1, text: 'x' }),
    ).rejects.toThrow('boom')
  })

  it('awaits async handlers', async () => {
    let resolved = false
    const dispatch = createMessageDispatcher({
      'model:load': async () => {
        await new Promise((r) => setTimeout(r, 10))
        resolved = true
      },
    })
    await dispatch({ type: 'model:load' })
    expect(resolved).toBe(true)
  })
})

type LoggerCall = (msg: string, data?: unknown) => void
function stubLogger() {
  const logger: MessageRouterLogger = {
    debug: vi.fn<LoggerCall>(),
    info: vi.fn<LoggerCall>(),
    warn: vi.fn<LoggerCall>(),
    error: vi.fn<LoggerCall>(),
  }
  return logger
}

describe('forwardToTab', () => {
  const msg: ExtensionMessage = {
    type: 'classify:result',
    requestId: 'r1',
    tabId: 42,
    result: sampleResult,
  }

  it('returns void synchronously (fire-and-forget)', () => {
    const logger = stubLogger()
    const sendMessage = vi.fn(() => new Promise(() => {})) // never resolves
    const out = forwardToTab(sendMessage, logger, 42, msg)
    expect(out).toBeUndefined()
    expect(sendMessage).toHaveBeenCalledWith(42, msg)
  })

  it('silently swallows sendMessage rejection (broadcast-safe)', async () => {
    const logger = stubLogger()
    const sendMessage = vi.fn(() =>
      Promise.reject(new Error('Could not establish connection')),
    )
    forwardToTab(sendMessage, logger, 42, msg)
    await Promise.resolve()
    await Promise.resolve()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('does not log when sendMessage resolves', async () => {
    const logger = stubLogger()
    const sendMessage = vi.fn(() => Promise.resolve(undefined))
    forwardToTab(sendMessage, logger, 42, msg)
    await Promise.resolve()
    await Promise.resolve()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })
})
