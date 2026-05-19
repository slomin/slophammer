import type { ExtensionMessage } from '@/messaging/protocol'

const logEl = document.getElementById('log') as HTMLDivElement
console.info('[inspector] ready')

browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type !== 'LOG') return false
  const { source, level, msg, data, ts } = message
  const time = new Date(ts).toISOString().slice(11, 23)
  const text = `${time} [${source}] ${msg}${data === undefined || data === '' ? '' : ' ' + JSON.stringify(data)}`

  const line = document.createElement('div')
  line.className = `line ${level}`
  line.textContent = text
  logEl.appendChild(line)

  // eslint-disable-next-line no-console
  console[level](text)
  return false
})
