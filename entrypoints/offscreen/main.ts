import { createClassifierRepository } from '@/llm'
import { createLogger, installErrorForwarding } from '@/messaging/logger'
import { isClassifyRun, isModelLoad, type ExtensionMessage } from '@/messaging/protocol'

installErrorForwarding('offscreen')
const log = createLogger('offscreen')
const classifier = createClassifierRepository()

log.info('offscreen booted')

browser.runtime
  .sendMessage({ type: 'model:status', status: 'ready' } satisfies ExtensionMessage)
  .catch(() => {
    // sink unattached — no listeners yet during SW cold start
  })

browser.runtime.onMessage.addListener((raw) => {
  if (isModelLoad(raw)) {
    browser.runtime
      .sendMessage({ type: 'model:status', status: 'ready' } satisfies ExtensionMessage)
      .catch(() => {})
    return false
  }

  if (isClassifyRun(raw)) {
    const { requestId, tabId, text } = raw
    log.debug('classify:run received', { requestId, tabId, length: text.length })
    classifier
      .classify(text)
      .then((result) => {
        log.info('classify:result dispatching', { requestId, verdict: result.verdict })
        return browser.runtime.sendMessage({
          type: 'classify:result',
          requestId,
          tabId,
          result,
        } satisfies ExtensionMessage)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        log.error('classify failed', message)
        return browser.runtime.sendMessage({
          type: 'classify:error',
          requestId,
          tabId,
          error: message,
        } satisfies ExtensionMessage)
      })
      .catch(() => {
        // Nothing listening — swallow.
      })
    return false
  }

  return false
})
