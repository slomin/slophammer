import { createClassifierRepository, FakeClassifierRepository } from '@/llm'
import type { ClassifierRepository } from '@/llm'
import { setupOnnxClassifier } from '@/llm/onnx-setup'
import { isModelInstalled } from '@/llm/opfs-model-reader'
import { createLogger, installErrorForwarding } from '@/messaging/logger'
import {
  isClassifyRun,
  isModelLoad,
  type ClassifyRunMessage,
  type ExtensionMessage,
} from '@/messaging/protocol'

installErrorForwarding('offscreen')
const log = createLogger('offscreen')

function broadcast(message: ExtensionMessage): void {
  browser.runtime.sendMessage(message).catch(() => {
    // Fire-and-forget — no listener is an expected cold-start state.
  })
}

function startFactory(): Promise<ClassifierRepository> {
  return createClassifierRepository({
    isModelInstalled,
    createOnnxClassifier: () =>
      setupOnnxClassifier((p) => {
        const pct = Math.round(2 + (p.bytesRead / Math.max(1, p.totalBytes)) * 78)
        broadcast({ type: 'model:status', status: 'loading', progress: pct })
      }),
    createFakeClassifier: () => {
      log.warn('using FakeClassifierRepository — real model unavailable')
      return new FakeClassifierRepository()
    },
    onStatus: broadcast,
  })
}

let repoPromise: Promise<ClassifierRepository> = startFactory()
log.info('offscreen booted')

async function handleClassifyRun(message: ClassifyRunMessage): Promise<void> {
  const { requestId, tabId, text } = message
  log.debug('classify:run received', { requestId, tabId, length: text.length })
  const repo = await repoPromise
  try {
    const result = await repo.classify(text)
    log.info('classify:result dispatching', {
      requestId,
      verdict: result.verdict,
      probs: {
        human: result.rawPct[0].toFixed(2),
        lightly: result.rawPct[1].toFixed(2),
        moderately: result.rawPct[2].toFixed(2),
        heavily: result.rawPct[3].toFixed(2),
      },
      aiScore: result.aiScore.toFixed(3),
    })
    broadcast({ type: 'classify:result', requestId, tabId, result })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('classify failed', error)
    broadcast({ type: 'classify:error', requestId, tabId, error })
  }
}

browser.runtime.onMessage.addListener((raw) => {
  if (isModelLoad(raw)) {
    log.info('model:load received — re-initialising classifier')
    repoPromise = startFactory()
    return false
  }
  if (isClassifyRun(raw)) {
    void handleClassifyRun(raw)
    return false
  }
  return false
})
