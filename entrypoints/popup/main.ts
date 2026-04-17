import { createLogger, installErrorForwarding } from '@/messaging/logger'
import type { ScoreRequest, ScoreResponse } from '@/messaging/protocol'

installErrorForwarding('popup')
const log = createLogger('popup')
log.info('popup opened')

const input = document.getElementById('input') as HTMLTextAreaElement
const button = document.getElementById('score') as HTMLButtonElement
const result = document.getElementById('result') as HTMLPreElement

button.addEventListener('click', async () => {
  const text = input.value
  log.debug('score clicked', { length: text.length })
  result.textContent = '…'
  const request: ScoreRequest = { type: 'SCORE_REQUEST', text }
  const response = (await browser.runtime.sendMessage(request)) as ScoreResponse | undefined
  if (!response) {
    result.textContent = 'ERR'
    log.error('no response from background')
    return
  }
  result.textContent = response.score.toFixed(3)
})
