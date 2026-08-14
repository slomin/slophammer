#!/usr/bin/env node
// Drive and inspect a running Slop Hammer install over raw CDP.
//
// Requires a browser started by `pnpm qa` (or `pnpm chrome`), which exposes CDP
// on :9222 and serves the fixtures on :8765.
//
//   node scripts/debug-extension.mjs status
//   node scripts/debug-extension.mjs classify "some text of at least 75 chars…"
//   node scripts/debug-extension.mjs classify --section 1
//   node scripts/debug-extension.mjs logs [seconds]
//   node scripts/debug-extension.mjs reach          # content-script reachability
//
// Why raw CDP rather than the obvious alternatives:
//   * chrome-devtools-mcp hides chrome-extension:// contexts, so the service
//     worker, offscreen document and options page are unreachable — which is
//     where all the logic lives.
//   * Playwright's connectOverCDP opens the browser websocket then hangs during
//     init against this browser (extension background_page targets are a known
//     trigger), and its aborted auto-attach can leave targets paused.
//
// Rules encoded here, each learned from a failure:
//   1. Output goes through fs.writeSync so a killed process never loses it.
//   2. The MV3 service worker idles out constantly — wake it and poll.
//   3. Every CDP call has a timeout, so a hang fails loudly.
//   4. Probe tabs carry a unique URL marker; several tabs share a prefix and
//      tabs.query() returns the first match.
//   5. /json/new returns before the navigation commits, so wait for the real
//      document, not just readyState.
import fs from 'node:fs'

const CDP = process.env.SLOPHAMMER_CDP ?? 'http://127.0.0.1:9222'
const TEST_PAGE = process.env.SLOPHAMMER_TEST_PAGE ?? 'http://localhost:8765/'

export const say = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ')
  fs.writeSync(1, line + '\n')
}

const withTimeout = (p, ms, label) =>
  Promise.race([
    Promise.resolve(p),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT(${ms}ms): ${label}`)), ms)),
  ])

const targets = async () =>
  await (await withTimeout(fetch(`${CDP}/json/list`), 8000, 'json/list')).json()

function open(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pend = new Map()
  const events = []
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.method === 'Runtime.consoleAPICalled')
      events.push({
        origin: target.__tag,
        kind: m.params.type,
        text: m.params.args.map((a) => String(a.value ?? a.description ?? a.type)).join(' '),
      })
    if (m.method === 'Runtime.exceptionThrown')
      events.push({
        origin: target.__tag,
        kind: 'exception',
        text: String(m.params.exceptionDetails.exception?.description ?? ''),
      })
    if (m.method === 'Log.entryAdded')
      events.push({
        origin: target.__tag,
        kind: m.params.entry.level,
        text: `(${m.params.entry.source}) ${m.params.entry.text}`,
      })
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id)
      pend.delete(m.id)
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
    }
  })
  const send = (method, params = {}) => {
    const i = ++id
    ws.send(JSON.stringify({ id: i, method, params }))
    return withTimeout(new Promise((res, rej) => pend.set(i, { res, rej })), 30000, method)
  }
  return {
    tag: target.__tag,
    events,
    send,
    close: () => {
      try {
        ws.close()
      } catch {
        /* already closed */
      }
    },
    ready: withTimeout(
      new Promise((r) => ws.addEventListener('open', r)),
      10000,
      'ws open ' + target.__tag,
    ),
    async eval(expression) {
      const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        allowUnsafeEvalBlockedByCSP: true,
      })
      if (r.exceptionDetails) {
        return { __error: String(r.exceptionDetails.exception?.description ?? '').slice(0, 300) }
      }
      return r.result.value
    },
  }
}

export async function attach(pred, tag) {
  const t = (await targets()).find(pred)
  if (!t) return null
  t.__tag = tag ?? t.type
  const c = open(t)
  await c.ready
  await c.send('Runtime.enable')
  try {
    await c.send('Log.enable')
  } catch {
    /* not supported on this target type */
  }
  return c
}

// Rule 2: the service worker idles out; wake it via the options page and poll.
export async function getServiceWorker(tries = 25) {
  for (let i = 0; i < tries; i++) {
    const sw = await attach((x) => x.type === 'service_worker', 'sw')
    if (sw) return sw
    const o = await attach((x) => x.url.includes('options.html'), 'options')
    if (o) {
      await o.eval(`chrome.runtime.sendMessage({type:'sh-debug-wake'}).catch(()=>{})`).catch(() => {})
      o.close()
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}

// Rule 4 again, and the reason it matters here: the CDP page target and the
// chrome.tabs entry are resolved by two unrelated orderings, so matching each
// on a URL substring can select text in one tab and dispatch the request to
// another. Match on the exact href of the tab we actually attached to, and say
// so when it is ambiguous.
export async function tabIdForHref(sw, href) {
  const matches = await sw.eval(
    `(async()=>(await chrome.tabs.query({})).filter(t=>t.url===${JSON.stringify(href)}).map(t=>t.id))()`,
  )
  if (!matches || matches.length === 0) return null
  if (matches.length > 1) {
    say(`  warning: ${matches.length} tabs are open on ${href}; using the first`)
  }
  return matches[0]
}

export const CARD_SNAPSHOT = `(() => {
  const h=document.querySelector('[data-slop-hammer-card]')
  if(!h) return {mounted:false}
  const s=h.shadowRoot, root=s&&s.querySelector('[data-testid="card-root"]')
  if(!root) return {mounted:true, root:false}
  const r=root.getBoundingClientRect()
  const hit=document.elementFromPoint(Math.round(r.left+r.width/2),Math.round(r.top+r.height/2))
  return {mounted:true,state:root.dataset.state,mode:root.dataset.mode,
    verdict:s.querySelector('[data-testid="verdict-label"]')?.textContent?.trim()||null,
    percent:s.querySelector('[data-testid="verdict-big"]')?.textContent?.trim()||null,
    confidence:s.querySelector('[data-testid="verdict-confidence"]')?.textContent?.trim()||null,
    truncation:s.querySelector('[data-testid="truncation-note"]')?.textContent?.trim()||null,
    error:s.querySelector('[data-testid="error-message"]')?.textContent?.trim()||null,
    buckets:[0,1,2,3].map(i=>s.querySelector('[data-testid="raw-'+i+'"]')?.querySelector('.fill')?.dataset.pct??null),
    rect:{top:Math.round(r.top),left:Math.round(r.left)},
    onScreen: r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth,
    visibleToUser: hit===h}
})()`

export async function waitForCard(page, ms = 60000) {
  const deadline = Date.now() + ms
  let last = null
  while (Date.now() < deadline) {
    last = await page.eval(CARD_SNAPSHOT).catch(() => null)
    if (last?.state && last.state !== 'loading') return last
    await new Promise((r) => setTimeout(r, 300))
  }
  return { ...(last ?? {}), timedOut: true }
}

// Sends exactly what the context-menu handler sends — including ensuring the
// offscreen document first. Without that, a classify:run issued after a browser
// restart has no listener and simply hangs until the card's watchdog fires.
export async function dispatchClassify(sw, tabId, text, requestId = 'debug-' + process.pid) {
  return sw.eval(`(async()=>{
    await chrome.offscreen.createDocument({
      url:'offscreen.html',
      reasons:[chrome.offscreen.Reason.WORKERS],
      justification:'debug harness'
    }).catch(()=>{ /* already exists */ })
    let startedErr=null
    try{ await chrome.tabs.sendMessage(${tabId},{type:'classify:started',requestId:${JSON.stringify(requestId)},
      preview:${JSON.stringify(text.slice(0, 200))},wordCount:${text.trim().split(/\s+/).length},charCount:${text.length}}) }
    catch(e){ startedErr=String(e).slice(0,140) }
    chrome.runtime.sendMessage({type:'classify:run',requestId:${JSON.stringify(requestId)},tabId:${tabId},text:${JSON.stringify(text)}}).catch(()=>{})
    return {requestId:${JSON.stringify(requestId)},startedErr}})()`)
}

async function cmdStatus() {
  const list = await targets()
  say('targets:')
  for (const t of list) say(`  ${t.type.padEnd(16)} ${t.url.slice(0, 78)}`)

  const sw = await getServiceWorker()
  if (!sw) return say('\nservice worker: NOT REACHABLE')
  say('\nservice worker: reachable')
  say(
    '  contexts: ' +
      JSON.stringify(
        await sw.eval(`(async()=>(await chrome.runtime.getContexts({})).map(c=>c.contextType))()`),
      ),
  )

  const off = await attach((x) => x.url.includes('offscreen.html'), 'offscreen')
  if (off) {
    say(
      '\nmodel: ' +
        JSON.stringify(
          await off.eval(`(async()=>{
            try{
              const root=await navigator.storage.getDirectory()
              const dir=await root.getDirectoryHandle('slop-hammer')
              const sentinel=JSON.parse(await (await (await dir.getFileHandle('.ready')).getFile()).text())
              const est=await navigator.storage.estimate()
              return {installed:true, checkpoint:sentinel.checkpointId, source:sentinel.source,
                      hosted:sentinel.hosted?.filename ?? null, usageMB:Math.round(est.usage/1e6)}
            }catch(e){ return {installed:false, reason:String(e).slice(0,80)} }})()`),
          null,
          2,
        ),
    )
    say('webgpu: ' + JSON.stringify(await off.eval(`(async()=>({available:!!navigator.gpu,
      adapter: navigator.gpu ? !!(await navigator.gpu.requestAdapter()) : false}))()`)))
    off.close()
  }
  sw.close()
}

async function cmdClassify(args) {
  const sectionFlag = args.indexOf('--section')
  const sw = await getServiceWorker()
  if (!sw) return say('service worker not reachable — is the browser running? (pnpm qa)')
  // localhost and 127.0.0.1 are the same server but never the same string, so
  // match on host:port rather than on the configured URL verbatim.
  const { port } = new URL(TEST_PAGE)
  const isFixturePage = (u) => {
    try {
      const parsed = new URL(u)
      return parsed.port === port && ['localhost', '127.0.0.1'].includes(parsed.hostname)
    } catch {
      return false
    }
  }
  const page = await attach((x) => isFixturePage(x.url), 'page')
  if (!page) return say(`no tab open on ${TEST_PAGE} — run: pnpm qa`)

  let text
  if (sectionFlag !== -1) {
    const idx = Number(args[sectionFlag + 1] ?? 0)
    text = await page.eval(`(()=>{const p=document.querySelectorAll('section p')[${idx}]
      if(!p) return null
      const r=document.createRange();r.selectNodeContents(p)
      const s=getSelection();s.removeAllRanges();s.addRange(r);return s.toString()})()`)
    if (!text) return say(`no fixture section ${idx} on the test page`)
  } else {
    text = args.filter((a) => !a.startsWith('--')).join(' ')
  }
  if (!text || text.trim().length < 75) {
    return say(`text is ${text ? text.trim().length : 0} chars; the extension requires 75+`)
  }

  // Ask the page itself where it is, so the tab we message is the tab we just
  // made the selection in.
  const href = await page.eval('location.href')
  const tabId = await tabIdForHref(sw, href)
  if (tabId == null) return say(`could not find a tab matching ${href}`)
  say(`classifying ${text.length} chars in tab ${tabId} (${href})…`)
  const sent = await dispatchClassify(sw, tabId, text)
  if (sent.startedErr) say('  WARNING: classify:started failed — ' + sent.startedErr)
  const started = Date.now()
  const card = await waitForCard(page)
  say(`settled in ${((Date.now() - started) / 1000).toFixed(1)}s:`)
  say(card)
  sw.close()
  page.close()
}

async function cmdLogs(args) {
  const seconds = Number(args[0] ?? 20)
  const contexts = []
  for (const [pred, tag] of [
    [(x) => x.type === 'service_worker', 'sw'],
    [(x) => x.url.includes('offscreen.html'), 'offscreen'],
    [(x) => x.url.includes('options.html'), 'options'],
    [(x) => x.url.startsWith('http'), 'page'],
  ]) {
    const c = await attach(pred, tag)
    if (c) contexts.push(c)
  }
  if (!contexts.length) return say('no contexts to attach to')
  say(`streaming from: ${contexts.map((c) => c.tag).join(', ')} for ${seconds}s…\n`)
  const seen = new Map(contexts.map((c) => [c.tag, 0]))
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    for (const c of contexts) {
      const from = seen.get(c.tag)
      for (const e of c.events.slice(from)) {
        say(`[${e.kind.padEnd(7)}] (${c.tag}) ${e.text.slice(0, 200)}`)
      }
      seen.set(c.tag, c.events.length)
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  const all = contexts.flatMap((c) => c.events)
  say(
    `\nsummary: ${all.length} messages, ` +
      `${all.filter((e) => e.kind === 'error' || e.kind === 'exception').length} errors, ` +
      `${all.filter((e) => e.kind === 'warning' || e.kind === 'warn').length} warnings`,
  )
  contexts.forEach((c) => c.close())
}

async function cmdReach() {
  const sw = await getServiceWorker()
  if (!sw) return say('service worker not reachable')
  const rows = await sw.eval(`(async()=>{
    const tabs=await chrome.tabs.query({})
    const out=[]
    for(const t of tabs){
      if(t.id==null){continue}
      let reachable=false, via=null, err=null
      try{ await chrome.tabs.sendMessage(t.id,{type:'ping'}); reachable=true; via='ping' }
      catch(e){ err=String(e).slice(0,70) }
      out.push({id:t.id, url:(t.url||'').slice(0,58), reachable, via, err})
    }
    return out})()`)
  say('content-script reachability (ping only — no injection):')
  for (const r of rows) {
    say(`  ${r.reachable ? 'OK  ' : 'MISS'} ${String(r.id).padEnd(12)} ${r.url}`)
    if (!r.reachable && r.err) say(`       ${r.err}`)
  }
  sw.close()
}

const [cmd, ...rest] = process.argv.slice(2)
const commands = { status: cmdStatus, classify: cmdClassify, logs: cmdLogs, reach: cmdReach }

if (!cmd || !commands[cmd]) {
  say('usage: node scripts/debug-extension.mjs <status|classify|logs|reach> [args]')
  say('')
  say('  status                     targets, model install, WebGPU')
  say('  classify "<text>"          classify text on the fixtures page')
  say('  classify --section <n>     classify fixture section n (0-based)')
  say('  logs [seconds]             stream console from every extension context')
  say('  reach                      which tabs have a live content script')
  process.exit(cmd ? 1 : 0)
}

try {
  await commands[cmd](rest)
} catch (err) {
  say('FAILED: ' + String(err?.message ?? err))
  process.exit(1)
}
