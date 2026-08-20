#!/usr/bin/env node
// Drive and inspect a running SlopHammer install over raw CDP.
//
// Requires a browser started by `pnpm qa` (or `pnpm chrome`), which exposes CDP
// on :9222 and serves the fixtures on :8765.
//
//   node scripts/debug-extension.mjs status
//   node scripts/debug-extension.mjs classify "some text of at least 40 words…"
//   node scripts/debug-extension.mjs classify --section 1
//   node scripts/debug-extension.mjs logs [seconds]
//   node scripts/debug-extension.mjs throttle 4   # keep open; Ctrl-C resets
//   node scripts/debug-extension.mjs backlog 8    # prove the queue serializes
//   node scripts/debug-extension.mjs watchdog 70  # prove heartbeats hold the card
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
import { pathToFileURL } from 'node:url'

const CDP_PORT = readIntegerEnv('SLOPHAMMER_CDP_PORT', 9222, { min: 1, max: 65535 })
const CDP = process.env.SLOPHAMMER_CDP ?? `http://127.0.0.1:${CDP_PORT}`
const TEST_PAGE = process.env.SLOPHAMMER_TEST_PAGE ?? 'http://localhost:8765/'
const CLASSIFY_WAIT_MS = readIntegerEnv('SLOPHAMMER_DEBUG_CLASSIFY_WAIT_MS', 15 * 60_000, {
  min: 1,
})

function readIntegerEnv(name, fallback, { min, max = Number.MAX_SAFE_INTEGER }) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${name} must be an integer from ${min} to ${max} (received ${JSON.stringify(raw)}).`,
    )
  }
  return value
}

export const say = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ')
  fs.writeSync(1, line + '\n')
}

const withTimeout = (p, ms, label) =>
  Promise.race([
    Promise.resolve(p),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT(${ms}ms): ${label}`)), ms)),
  ])

export const targets = async () =>
  await (await withTimeout(fetch(`${CDP}/json/list`), 8000, 'json/list')).json()

export { CDP, TEST_PAGE }

export function open(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pend = new Map()
  const events = []
  const closed = new Promise((resolve) => ws.addEventListener('close', resolve, { once: true }))
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
    targetId: target.id,
    tag: target.__tag,
    events,
    send,
    closed,
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

async function attachTarget(target, tag) {
  target.__tag = tag ?? target.type
  const c = open(target)
  await c.ready
  await c.send('Runtime.enable')
  try {
    await c.send('Log.enable')
  } catch {
    /* not supported on this target type */
  }
  return c
}

export async function attach(pred, tag) {
  const target = (await targets()).find(pred)
  return target ? attachTarget(target, tag) : null
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
// Open a tab on any URL and return a session that is genuinely on that document.
// Rule 5: /json/new resolves before the navigation commits. Rule 7: innerText is
// empty in a tab that has never been rendered, so bring it to front.
export async function openTab(url, { bringToFront = true } = {}) {
  const created = await withTimeout(
    fetch(`${CDP}/json/new?${url}`, { method: 'PUT' }),
    15000,
    'json/new',
  )
  const target = await created.json()
  const page = open(target)
  await page.ready
  await page.send('Runtime.enable')
  await page.send('Page.enable').catch(() => {})
  for (let i = 0; i < 120; i++) {
    const ok = await page
      .eval(`location.href !== 'about:blank' && document.readyState === 'complete'`)
      .catch(() => false)
    if (ok) break
    await new Promise((r) => setTimeout(r, 250))
  }
  if (bringToFront) await page.send('Page.bringToFront').catch(() => {})
  return page
}

export async function closeTab(page) {
  await fetch(`${CDP}/json/close/${page.targetId}`).catch(() => {})
  page.close()
}

// Select the first paragraph with enough words to pass the 40-word gate and
// return its text, so the same check works on fixtures and on real sites.
export async function selectLongParagraph(page, minWords = 45) {
  return page.eval(`(()=>{
    const ps=[...document.querySelectorAll('p')]
      .filter(p=>(p.textContent||'').trim().split(/\\s+/).length>=${minWords})
    if(!ps.length) return null
    const r=document.createRange();r.selectNodeContents(ps[0])
    const g=getSelection();g.removeAllRanges();g.addRange(r);return g.toString()})()`)
}

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
    detail:s.querySelector('[data-testid="verdict-text"]')?.textContent?.trim()||null,
    truncation:s.querySelector('[data-testid="truncation-note"]')?.textContent?.trim()||null,
    error:s.querySelector('[data-testid="error-message"]')?.textContent?.trim()||null,
    buckets:[0,1,2,3].map(i=>s.querySelector('[data-testid="raw-'+i+'"]')?.querySelector('.fill')?.dataset.pct??null),
    rect:{top:Math.round(r.top),left:Math.round(r.left)},
    onScreen: r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth,
    visibleToUser: hit===h}
})()`

export async function waitForCard(page, ms = CLASSIFY_WAIT_MS) {
  const deadline = Date.now() + ms
  let last = null
  while (Date.now() < deadline) {
    last = await page.eval(CARD_SNAPSHOT).catch(() => null)
    if (last?.state && last.state !== 'loading') return last
    await new Promise((r) => setTimeout(r, 100))
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
  for (const t of list) {
    const title = t.title && t.title !== t.url ? ` (${String(t.title).slice(0, 32)})` : ''
    say(`  ${t.type.padEnd(16)} ${t.url.slice(0, 78)}${title}`)
  }

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
    const offscreenDiagnostics = await off.eval(`(()=>{
      let runtime=null
      const encoded=document.documentElement.dataset.runtimeDiagnostics
      if(encoded){ try{ runtime=JSON.parse(encoded) }catch(e){ runtime={parseError:String(e)} } }
      return {
        crossOriginIsolated:self.crossOriginIsolated,
        secureContext:self.isSecureContext,
        sharedArrayBuffer:typeof SharedArrayBuffer!=='undefined',
        hardwareConcurrency:navigator.hardwareConcurrency,
        runtime
      }
    })()`)
    say('\noffscreen: ' + JSON.stringify(offscreenDiagnostics, null, 2))
    say(
      'model: ' +
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
  } else {
    say('\noffscreen: not running')
  }

  // The classifier worker is a dedicated module worker of the offscreen
  // document and Chrome never lists it as a browser-level CDP target — before
  // the first classification `/json/list` shows no workers at all, and
  // afterwards it shows exactly `ort.env.wasm.numThreads` entries, which are
  // ONNX Runtime's pthreads parked in Atomics.wait (they answer no CDP call).
  // So report the worker through the diagnostics it publishes, not by target.
  const workerThreads = (await targets()).filter((t) => t.type === 'worker').length
  say(`ort pthread targets: ${workerThreads} (the classifier worker itself is not a CDP target)`)
  sw.close()
}

// localhost and 127.0.0.1 are the same server but never the same string, so
// match on host:port rather than on the configured URL verbatim.
export function isFixturePage(u) {
  try {
    const parsed = new URL(u)
    return (
      parsed.port === new URL(TEST_PAGE).port &&
      ['localhost', '127.0.0.1'].includes(parsed.hostname)
    )
  } catch {
    return false
  }
}

async function cmdClassify(args) {
  const sectionFlag = args.indexOf('--section')
  const sw = await getServiceWorker()
  if (!sw) return say('service worker not reachable — is the browser running? (pnpm qa)')
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
  const wordCount = text?.trim() ? text.trim().split(/\s+/).length : 0
  if (wordCount < 40) {
    return say(`text has ${wordCount} words; the extension requires 40+`)
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
  if (card.timedOut) {
    say(`classification did not settle within ${CLASSIFY_WAIT_MS}ms`)
    process.exitCode = 1
  }
  sw.close()
  page.close()
}

async function cmdLogs(args) {
  const seconds = Number(args[0] ?? 20)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`logs duration must be a positive number of seconds (received ${args[0]}).`)
  }
  const contexts = []
  const attachedTargetIds = new Set()

  const tagFor = (target) => {
    const suffix = String(target.id ?? '').slice(-6)
    if (target.type === 'service_worker') return `sw:${suffix}`
    // The classifier worker never appears as its own target; Chrome routes its
    // console into the parent offscreen document's stream, so this covers it.
    if (target.url.includes('offscreen.html')) return `offscreen:${suffix}`
    if (target.url.includes('options.html')) return `options:${suffix}`
    if (target.url.startsWith('http')) return `page:${suffix}`
    return null
  }

  const refreshContexts = async () => {
    for (const target of await targets()) {
      if (!target.id || attachedTargetIds.has(target.id)) continue
      const tag = tagFor(target)
      if (!tag) continue
      try {
        const context = await attachTarget(target, tag)
        attachedTargetIds.add(target.id)
        contexts.push(context)
        say(`attached log stream: ${tag} ${target.url.slice(0, 90)}`)
      } catch (error) {
        // Targets can disappear between /json/list and Runtime.enable. Retry a
        // replacement target on the next refresh instead of failing the stream.
        say(`  log attach skipped (${tag}): ${String(error).slice(0, 120)}`)
      }
    }
  }

  await refreshContexts()
  if (!contexts.length) return say('no contexts to attach to')
  say(`streaming from: ${contexts.map((c) => c.tag).join(', ')} for ${seconds}s…\n`)
  const seen = new Map(contexts.map((c) => [c.tag, 0]))
  const deadline = Date.now() + seconds * 1000
  let nextRefresh = Date.now() + 1000
  while (Date.now() < deadline) {
    if (Date.now() >= nextRefresh) {
      await refreshContexts()
      for (const context of contexts) {
        if (!seen.has(context.tag)) seen.set(context.tag, 0)
      }
      nextRefresh = Date.now() + 1000
    }
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

async function cmdThrottle(args) {
  const rate = Number(args[0])
  if (!Number.isFinite(rate) || rate < 1) {
    throw new Error(`throttle rate must be a number at least 1 (received ${args[0]}).`)
  }

  // Emulation.setCPUThrottlingRate only slows the target's MAIN thread. Measured
  // on the offscreen document: a busy loop went 29ms → 293ms at 10x while the
  // same loop inside a dedicated worker stayed at 28ms → 29ms. Inference runs in
  // the classifier worker, so this cannot make a classification slower. What it
  // does slow is the offscreen main thread — message handling and the heartbeat
  // that keeps a long request's card alive. Use `backlog` to hold a card in
  // 'loading' past the 45s watchdog.
  const off = await attach((x) => x.url.includes('offscreen.html'), 'offscreen')
  if (!off) {
    throw new Error('offscreen document is not running — run one classification first.')
  }

  await off.send('Emulation.setCPUThrottlingRate', { rate })
  if (rate === 1) {
    say('offscreen main-thread CPU throttle reset to 1x')
    off.close()
    return
  }

  say(`offscreen main-thread CPU throttle active at ${rate}x`)
  say('note: this does NOT slow inference — that runs in the classifier worker')
  say('press Ctrl-C to reset to 1x and detach')

  let signal
  const interrupted = new Promise((resolve) => {
    signal = resolve
  })
  const onSignal = () => signal('signal')
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  const reason = await Promise.race([interrupted, off.closed.then(() => 'closed')])
  process.removeListener('SIGINT', onSignal)
  process.removeListener('SIGTERM', onSignal)

  if (reason === 'closed') {
    say('offscreen document closed; Chrome reset the target-scoped CPU throttle')
    return
  }

  await off.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {})
  off.close()
  say('offscreen main-thread CPU throttle reset to 1x')
}

// Show the queue serializing a burst. On fast hardware this cannot reach the
// 45s watchdog — the queue rejects past DEFAULT_MAX_PENDING (8), so the longest
// a card can sit in 'loading' is 8 x per-run, which is ~20s on Apple Silicon.
// Use `watchdog` to verify the timeout behaviour itself.
async function cmdBacklog(args) {
  const count = Number(args[0] ?? 8)
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`backlog count must be a positive integer (received ${args[0]}).`)
  }
  const sw = await getServiceWorker()
  if (!sw) return say('service worker not reachable')
  const page = await attach((x) => isFixturePage(x.url), 'page')
  if (!page) return say(`no tab open on ${TEST_PAGE} — run: pnpm qa`)

  const text = await page.eval(`(()=>{const p=document.querySelectorAll('section p')[1]
    if(!p) return null
    const r=document.createRange();r.selectNodeContents(p)
    const s=getSelection();s.removeAllRanges();s.addRange(r);return s.toString()})()`)
  if (!text) return say('no fixture section 1 on the test page')

  const href = await page.eval('location.href')
  const tabId = await tabIdForHref(sw, href)
  if (tabId == null) return say(`could not find a tab matching ${href}`)

  // Sample the baseline before dispatching: runs complete while the burst is
  // still being sent, so a baseline taken afterwards already counts some of
  // them and the completion check can never be satisfied.
  const before = await offscreenDiagnostics()
  const started = Date.now()
  const rejected = []
  for (let i = 0; i < count; i++) {
    await dispatchClassify(sw, tabId, text, `backlog-${process.pid}-${i}`)
  }
  say(`queued ${count} classifications in tab ${tabId} (runCount was ${before?.runCount ?? 0})…`)

  const deadline = Date.now() + 10 * 60_000
  let last = null
  while (Date.now() < deadline) {
    const card = await page.eval(CARD_SNAPSHOT).catch(() => null)
    const diag = await offscreenDiagnostics()
    last = diag
    const elapsed = (Date.now() - started) / 1000
    say(`  t=${elapsed.toFixed(0)}s card=${card?.state} err=${card?.error ?? 'none'} runCount=${diag?.runCount} inFlight=${diag?.inFlight} queueDepth=${diag?.queueDepth}`)
    // The error node keeps its last text even after the card recovers, so only
    // trust it while the card is actually in the error state.
    if (card?.state === 'error' && card.error) rejected.push(card.error)
    if (
      diag &&
      diag.inFlight === 0 &&
      diag.queueDepth === 0 &&
      diag.runCount >= (before?.runCount ?? 0) + count
    ) {
      break
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  say(`sessionCreations=${last?.sessionCreations} maxConcurrentRuns=${last?.maxConcurrentRuns}`)
  if (last?.maxConcurrentRuns > 1) {
    say('FAILED: inference ran concurrently — the queue did not serialize')
    process.exitCode = 1
  }
  if (rejected.length) say(`card errors seen: ${JSON.stringify([...new Set(rejected)])}`)
  sw.close()
  page.close()
}

export async function offscreenDiagnostics() {
  const off = await attach((x) => x.url.includes('offscreen.html'), 'offscreen')
  if (!off) return null
  try {
    return await off.eval(`(()=>{const e=document.documentElement.dataset.runtimeDiagnostics
      return e?JSON.parse(e):null})()`)
  } finally {
    off.close()
  }
}

// The only hardware-independent way to prove the card's 45s watchdog is held
// open by the offscreen heartbeat. Inference here is far too fast to cross 45s
// on its own, so drive the exact two messages the content script reacts to and
// assert the card is still 'loading' well past the deadline.
async function cmdWatchdog(args) {
  const seconds = Number(args[0] ?? 70)
  if (!Number.isFinite(seconds) || seconds <= 45) {
    throw new Error(`watchdog duration must exceed the 45s deadline (received ${args[0]}).`)
  }
  const sw = await getServiceWorker()
  if (!sw) return say('service worker not reachable')
  const page = await attach((x) => isFixturePage(x.url), 'page')
  if (!page) return say(`no tab open on ${TEST_PAGE} — run: pnpm qa`)
  const href = await page.eval('location.href')
  const tabId = await tabIdForHref(sw, href)
  if (tabId == null) return say(`could not find a tab matching ${href}`)

  const requestId = `watchdog-${process.pid}`
  await sw.eval(`chrome.tabs.sendMessage(${tabId},{type:'classify:started',
    requestId:${JSON.stringify(requestId)},preview:'watchdog probe',wordCount:60,charCount:400}).catch(()=>{})`)
  say(`armed the card watchdog in tab ${tabId}; heartbeating for ${seconds}s (deadline is 45s)…`)

  const started = Date.now()
  let leftLoading = null
  let nextBeat = 0
  while ((Date.now() - started) / 1000 < seconds) {
    const elapsed = (Date.now() - started) / 1000
    if (elapsed >= nextBeat) {
      await sw.eval(`chrome.tabs.sendMessage(${tabId},{type:'model:status',status:'loading'}).catch(()=>{})`)
      nextBeat = elapsed + 10
    }
    const card = await page.eval(CARD_SNAPSHOT).catch(() => null)
    if (card?.state && card.state !== 'loading' && !leftLoading) {
      leftLoading = { at: elapsed, state: card.state, error: card.error }
    }
    if (Math.round(elapsed) % 15 === 0) {
      say(`  t=${elapsed.toFixed(0)}s card=${card?.state} err=${card?.error ?? 'none'}`)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  if (leftLoading) {
    say(`FAILED: card left 'loading' after ${leftLoading.at.toFixed(0)}s — ${JSON.stringify(leftLoading)}`)
    process.exitCode = 1
  } else {
    say(`OK: card held 'loading' for ${seconds}s (> 45s) — heartbeats re-arm the watchdog`)
  }
  // Leave the tab in a clean state rather than a card spinning forever.
  await sw.eval(`chrome.tabs.sendMessage(${tabId},{type:'classify:error',
    requestId:${JSON.stringify(requestId)},tabId:${tabId},error:'watchdog probe finished'}).catch(()=>{})`)
  sw.close()
  page.close()
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

// Guard the CLI so the helpers above can be imported by ad-hoc QA harnesses
// without the import itself running a command and calling process.exit.
const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

const [cmd, ...rest] = isCli ? process.argv.slice(2) : []
const commands = {
  status: cmdStatus,
  classify: cmdClassify,
  logs: cmdLogs,
  throttle: cmdThrottle,
  backlog: cmdBacklog,
  watchdog: cmdWatchdog,
  reach: cmdReach,
}

if (!isCli) {
  // imported as a module — nothing to run
} else if (!cmd || !commands[cmd]) {
  say('usage: node scripts/debug-extension.mjs <status|classify|logs|throttle|backlog|watchdog|reach> [args]')
  say('')
  say('  status                     targets, model install, provider/runtime diagnostics')
  say('  classify "<text>"          classify text on the fixtures page')
  say('  classify --section <n>     classify fixture section n (0-based)')
  say('  logs [seconds]             stream console from every reachable context')
  say('  throttle <rate>            throttle the offscreen MAIN thread (not inference)')
  say('  backlog [n]                queue n classifications; proves the queue serializes')
  say('  watchdog [seconds]         prove heartbeats hold the card past its 45s deadline')
  say('  reach                      which tabs have a live content script')
  say('')
  say('environment:')
  say('  SLOPHAMMER_CDP             full CDP base URL (overrides the port below)')
  say('  SLOPHAMMER_CDP_PORT        CDP port when SLOPHAMMER_CDP is unset (default 9222)')
  say('  SLOPHAMMER_TEST_PAGE       fixture URL (default http://localhost:8765/)')
  say('  SLOPHAMMER_DEBUG_CLASSIFY_WAIT_MS  card wait (default 900000 / 15 minutes)')
  process.exit(cmd ? 1 : 0)
}

if (isCli) {
  try {
    await commands[cmd](rest)
  } catch (err) {
    say('FAILED: ' + String(err?.message ?? err))
    process.exit(1)
  }
}
