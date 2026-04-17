// Rebuild the extension + refresh the canonical release folder + force the
// running Chrome for Testing instance (launched via `pnpm chrome`) to
// re-install the service worker from the freshly-built files. No manual
// click in chrome://extensions required.

import { execSync } from 'node:child_process'

const CDP_URL = process.env.CDP_URL ?? 'http://127.0.0.1:9222'

execSync('pnpm release', { stdio: 'inherit' })

async function json(path) {
  const r = await fetch(CDP_URL + path)
  if (!r.ok) throw new Error('CDP ' + path + ' ' + r.status)
  return r.json()
}

async function wakeSW() {
  const pages = await json('/json/list')
  const extPage = pages.find((p) => p.url?.startsWith('chrome-extension://'))
  if (!extPage) {
    throw new Error(
      'No extension page is open — open chrome-extension://<id>/inspector.html in CfT so the SW can be woken.',
    )
  }
  const ws = new WebSocket(extPage.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  await new Promise((resolve) => {
    const id = 1
    ws.addEventListener('message', (e) => {
      if (JSON.parse(e.data).id === id) resolve()
    })
    ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: {
          expression: `chrome.runtime.sendMessage({type:"wake"}).catch(()=>{})`,
          awaitPromise: true,
          returnByValue: true,
        },
      }),
    )
  })
  ws.close()
}

async function getSW() {
  for (let i = 0; i < 30; i++) {
    const tabs = await json('/json/list')
    const sw = tabs.find((t) => t.type === 'service_worker' && t.url?.includes('elalp'))
    if (sw) return sw.webSocketDebuggerUrl
    await new Promise((r) => setTimeout(r, 150))
  }
  return null
}

async function reload() {
  await wakeSW()
  const swUrl = await getSW()
  if (!swUrl) throw new Error('could not locate service worker target')
  const ws = new WebSocket(swUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  await new Promise((resolve) => {
    const id = 1
    ws.addEventListener('message', (e) => {
      if (JSON.parse(e.data).id === id) resolve()
    })
    ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: {
          expression: `chrome.runtime.reload()`,
          returnByValue: true,
        },
      }),
    )
  })
  ws.close()
  console.log('Extension reloaded.')
}

try {
  await reload()
} catch (err) {
  console.error('Reload failed:', err.message)
  process.exit(1)
}
