import { createLlmRepository } from '@/llm'
import { createLogger, installErrorForwarding } from '@/messaging/logger'
import type { ExtensionMessage, ScoreResponse } from '@/messaging/protocol'

export default defineBackground(() => {
  installErrorForwarding('background')
  const log = createLogger('background')
  const llm = createLlmRepository()

  log.info('service worker booted')

  browser.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === 'SCORE_REQUEST') {
      llm
        .scoreSlop(message.text)
        .then((score) => {
          log.debug('scored', { preview: message.text.slice(0, 40), score })
          const response: ScoreResponse = { type: 'SCORE_RESPONSE', score }
          sendResponse(response)
        })
        .catch((err) => {
          log.error('scoring failed', String(err))
          sendResponse({ type: 'SCORE_RESPONSE', score: -1 } satisfies ScoreResponse)
        })
      return true
    }
    return false
  })
})
