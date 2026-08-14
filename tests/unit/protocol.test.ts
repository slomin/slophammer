import { describe, expect, it } from 'vitest'
import {
  isClassifyError,
  isClassifyResult,
  isClassifyRun,
  isClassifyStarted,
  isLogMessage,
  isModelInstalled,
  isModelLoad,
  isModelStatus,
  isSelectionTooShort,
  type ClassifyErrorMessage,
  type ClassifyResultMessage,
  type ClassifyRunMessage,
  type ClassifyStartedMessage,
  type ExtensionMessage,
  type LogMessage,
  type ModelInstalledMessage,
  type ModelLoadMessage,
  type ModelStatusMessage,
  type SelectionTooShortMessage,
} from '@/messaging/protocol'
import type { ClassifyResult } from '@/llm/classify-result'

const sampleResult: ClassifyResult = {
  probs: [0.1, 0.2, 0.3, 0.4],
  rawPct: [10, 20, 30, 40],
  aiScore: 0.9,
  verdict: 'ai',
  tokenCount: 10,
  analysedTokens: 10,
  truncated: false,
}

const messages: Record<string, ExtensionMessage> = {
  classifyRun: { type: 'classify:run', requestId: 'r1', tabId: 1, text: 'hi' },
  classifyStarted: {
    type: 'classify:started',
    requestId: 'r1',
    preview: 'hi',
    wordCount: 1,
    charCount: 2,
  },
  classifyResult: { type: 'classify:result', requestId: 'r1', tabId: 1, result: sampleResult },
  classifyError: { type: 'classify:error', requestId: 'r1', tabId: 1, error: 'nope' },
  selectionTooShort: { type: 'selection:too-short', length: 3 },
  modelLoad: { type: 'model:load' },
  modelStatus: { type: 'model:status', status: 'ready' },
  modelInstalled: { type: 'model:installed' },
  log: {
    type: 'LOG',
    source: 'background',
    level: 'info',
    msg: 'boot',
    ts: 1,
  },
}

describe('type guards', () => {
  const guardMap = [
    ['classifyRun', isClassifyRun],
    ['classifyStarted', isClassifyStarted],
    ['classifyResult', isClassifyResult],
    ['classifyError', isClassifyError],
    ['selectionTooShort', isSelectionTooShort],
    ['modelLoad', isModelLoad],
    ['modelStatus', isModelStatus],
    ['modelInstalled', isModelInstalled],
    ['log', isLogMessage],
  ] as const

  for (const [key, guard] of guardMap) {
    it(`${guard.name} accepts its own message`, () => {
      expect(guard(messages[key]!)).toBe(true)
    })

    it(`${guard.name} rejects every other message`, () => {
      for (const [otherKey, msg] of Object.entries(messages)) {
        if (otherKey === key) continue
        expect(guard(msg)).toBe(false)
      }
    })
  }

  it('guards narrow the type (compile-time)', () => {
    const m: ExtensionMessage = messages.classifyRun!
    if (isClassifyRun(m)) {
      const run: ClassifyRunMessage = m
      expect(run.text).toBe('hi')
    } else {
      throw new Error('guard failed')
    }
  })
})

describe('ExtensionMessage union', () => {
  it('all ported message types belong to the union', () => {
    const _: ExtensionMessage[] = [
      messages.classifyRun as ClassifyRunMessage,
      messages.classifyStarted as ClassifyStartedMessage,
      messages.classifyResult as ClassifyResultMessage,
      messages.classifyError as ClassifyErrorMessage,
      messages.selectionTooShort as SelectionTooShortMessage,
      messages.modelLoad as ModelLoadMessage,
      messages.modelStatus as ModelStatusMessage,
      messages.modelInstalled as ModelInstalledMessage,
      messages.log as LogMessage,
    ]
    expect(_).toHaveLength(9)
  })
})
