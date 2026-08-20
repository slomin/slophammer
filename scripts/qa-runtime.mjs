#!/usr/bin/env node
// Runtime QA for the execution-provider path (issue #32), as one repeatable
// command instead of a pile of one-off CDP probes.
//
//   pnpm qa                      # launch CfT with WebGPU available
//   pnpm qa:runtime              # verify whatever provider the browser gives
//
//   pnpm qa --no-webgpu          # launch CfT with WebGPU genuinely unavailable
//   pnpm qa:runtime --expect wasm
//
// Flags:
//   --expect <webgpu|wasm>  fail unless the classifier chose this provider
//   --watchdog              also wait out the card's real deadline in-browser
//   --site <url>            also smoke a real site (opt-in; needs the network)
//
// The watchdog's timing rules are covered deterministically by
// tests/unit/classify-watchdog.test.ts with fake timers, so the in-browser
// version is opt-in: it can only confirm what that test already proves, and it
// costs a real wall-clock deadline to do it.
//
// Every check prints PASS/FAIL with the evidence it used; the process exits
// non-zero if any check fails, so this is usable from CI or a release gate.
import {
  CARD_SNAPSHOT,
  attach,
  closeTab,
  dispatchClassify,
  getServiceWorker,
  offscreenDiagnostics,
  openTab,
  say,
  selectLongParagraph,
  tabIdForHref,
  targets,
  waitForCard,
} from './debug-extension.mjs'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = argv.indexOf(name)
  return i === -1 ? dflt : argv[i + 1]
}
const has = (name) => argv.includes(name)

const EXPECT = flag('--expect', null)
const WATCHDOG = has('--watchdog')
// A real site is opt-in. It is the only check that touches the network, which
// made it both the slowest step and the only genuinely flaky one — page weight
// and markup are outside our control. The local hostile-CSS fixture covers the
// same failure mode deterministically; use --site before a release.
const SITE = flag('--site', null)
const FIXTURES = process.env.SLOPHAMMER_TEST_PAGE ?? 'http://localhost:8765/'
const HOSTILE = new URL('/hostile', FIXTURES).href

if (EXPECT && !['webgpu', 'wasm'].includes(EXPECT)) {
  say(`--expect must be webgpu or wasm (received ${JSON.stringify(EXPECT)})`)
  process.exit(1)
}

// Chrome emits this itself on a machine with no WebGPU adapter. It is not ours
// and not a defect, so it must not fail the log check — but nothing else may
// appear either.
const EXPECTED_WARNINGS = [/Failed to create WebGPU Context Provider/i]

// Budgets are deliberately tight. Measured on Apple Silicon: 1.2-1.8s warm on
// WebGPU, 3.0s cold / 2.4s warm on CPU/WASM. A generous multiple of that still
// fails in seconds instead of hanging for minutes, which is the whole point of
// a check. Raise COLD_MS only if a genuinely slow device needs it.
const COLD_MS = 90_000 // first run also reads ~240MB out of OPFS and builds the session
const WARM_MS = 30_000
const LOADING_MS = 10_000 // time for a dispatch to take the card back to 'loading'
const DRAIN_MS = 120_000 // a 6-deep backlog at ~2.5s each

// Read the card's deadline from source so this check stays correct if the
// constant moves, and so it runs only just past it rather than a fixed 70s.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WATCHDOG_MS = (() => {
  const src = readFileSync(resolve(repoRoot, 'content/state.ts'), 'utf8')
  const m = src.match(/CLASSIFY_TIMEOUT_MS\s*=\s*([\d_]+)/)
  if (!m) throw new Error('could not read CLASSIFY_TIMEOUT_MS from content/state.ts')
  return Number(m[1].replace(/_/g, ''))
})()
const WATCHDOG_OBSERVE_MS = WATCHDOG_MS + 5_000

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  say(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} ${detail}`)
}
const fail = (name, error) => record(name, false, `threw: ${String(error?.message ?? error)}`)

async function classifyOn(page, sw, tabId, text, requestId, budgetMs = WARM_MS) {
  const started = Date.now()
  await dispatchClassify(sw, tabId, text, requestId)
  // Wait for this request to take the card back to 'loading' first, so a stale
  // 'ready' from an earlier run is never read as a fresh result.
  const spin = Date.now() + LOADING_MS
  while (Date.now() < spin) {
    const state = await page
      .eval(`(()=>{const h=document.querySelector('[data-slop-hammer-card]')
        const r=h&&h.shadowRoot&&h.shadowRoot.querySelector('[data-testid="card-root"]')
        return r?r.dataset.state:null})()`)
      .catch(() => null)
    if (state === 'loading') break
    await new Promise((r) => setTimeout(r, 50))
  }
  const card = await waitForCard(page, budgetMs)
  return { card, ms: Date.now() - started }
}

// ---------------------------------------------------------------------------

const sw = await getServiceWorker()
if (!sw) {
  say('service worker not reachable — is the browser running? (pnpm qa)')
  process.exit(1)
}

// Resolve the fixture tab first, while it is the only tab matching, so probe
// tabs opened below can never be selected by mistake.
// 2. Cold start on whichever provider the browser allows.
// Rule 4: `/hostile` is served from the same host:port, so a prefix match can
// silently attach to the wrong page. Match the fixture root's exact path.
const fixtureRoot = new URL(FIXTURES)
const isFixtureRoot = (u) => {
  try {
    const parsed = new URL(u)
    return (
      parsed.port === fixtureRoot.port &&
      ['localhost', '127.0.0.1'].includes(parsed.hostname) &&
      parsed.pathname === fixtureRoot.pathname &&
      parsed.search === '' // every probe tab carries ?qa=…, so exclude them
    )
  } catch {
    return false
  }
}
const page = await attach((x) => isFixtureRoot(x.url), 'page')
if (!page) {
  say(`no tab open on ${FIXTURES} — run: pnpm qa`)
  process.exit(1)
}
await page.send('Page.enable').catch(() => {})
await page.send('Page.reload', {}).catch(() => {})
await new Promise((r) => setTimeout(r, 2000))
for (let i = 0; i < 60; i++) {
  const ok = await page
    .eval(`document.readyState==='complete' && !!document.querySelector('section p')`)
    .catch(() => false)
  if (ok) break
  await new Promise((r) => setTimeout(r, 250))
}

const text = await page.eval(`(()=>{const p=document.querySelectorAll('section p')[1]
  if(!p) return null
  const r=document.createRange();r.selectNodeContents(p)
  const s=getSelection();s.removeAllRanges();s.addRange(r);return s.toString()})()`)
if (!text) {
  say('no fixture section 1 on the test page')
  process.exit(1)
}
const href = await page.eval('location.href')
const tabId = await tabIdForHref(sw, href)

// The watchdog check drives messages at the content script and never touches
// the classifier, so it runs on its own tab concurrently with everything else.
// It is the longest single check; serialising it doubled the suite's runtime.
async function runWatchdog() {
  const tab = await openTab(`${FIXTURES}?qa=watchdog`, { bringToFront: false })
  try {
    const id = await tabIdForHref(sw, await tab.eval('location.href'))
    if (id == null) throw new Error('no tab id for the watchdog page')
    const rid = `qa-watchdog-${process.pid}`
    await sw.eval(`chrome.tabs.sendMessage(${id},{type:'classify:started',
      requestId:${JSON.stringify(rid)},preview:'watchdog probe',wordCount:60,charCount:400}).catch(()=>{})`)
    const started = Date.now()
    let left = null
    let nextBeat = 0
    while (Date.now() - started < WATCHDOG_OBSERVE_MS) {
      const elapsed = Date.now() - started
      if (elapsed >= nextBeat) {
        await sw.eval(
          `chrome.tabs.sendMessage(${id},{type:'model:status',status:'loading'}).catch(()=>{})`,
        )
        nextBeat = elapsed + 10_000
      }
      const card = await tab.eval(CARD_SNAPSHOT).catch(() => null)
      if (card?.state && card.state !== 'loading' && !left) {
        left = { at: Math.round(elapsed / 1000), state: card.state }
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    return { left }
  } finally {
    await closeTab(tab)
  }
}

const watchdogRun = WATCHDOG ? runWatchdog().catch((error) => ({ error })) : null

// Page loads — especially a real site over the network — dominate these two
// checks, so start them now and classify once the fixture checks are done.
const preload = async (url, prepare) => {
  const tab = await openTab(url, { bringToFront: false })
  if (prepare) await prepare(tab)
  const body = await selectLongParagraph(tab)
  return { tab, body }
}
const hostilePreload = preload(HOSTILE, (t) =>
  // The transformed-ancestor bug only showed with the page scrolled.
  t.eval(`window.scrollTo(0, Math.max(0, document.body.scrollHeight/2))`),
).catch((error) => ({ error }))
const sitePreload = SITE ? preload(SITE).catch((error) => ({ error })) : null


// 1. WebGPU evidence, from the browser rather than from the launch flag.
//    `--disable-features=WebGPU` does NOT disable WebGPU; only `--disable-gpu`
//    does, so the flag is never trusted on its own.
let browserWebGpu = null
try {
  const gpu = await openTab('chrome://gpu')
  const report = await gpu.eval(
    `(()=>{
      const deep=(root,acc)=>{for(const el of root.querySelectorAll('*'))if(el.shadowRoot)deep(el.shadowRoot,acc)
        acc.push(root.textContent||'');return acc}
      const txt=deep(document,[]).join('\\n')
      return {disabled:/WebGPU:\\s*Disabled/i.test(txt), mentioned:/WebGPU/i.test(txt)}})()`,
    30000,
  )
  await closeTab(gpu)
  const probe = await attach((x) => x.url.includes('offscreen.html'), 'offscreen')
  const adapter = probe
    ? await probe.eval(
        `(async()=>({exposed:!!self.navigator.gpu,
          adapter: self.navigator.gpu ? !!(await navigator.gpu.requestAdapter()) : false}))()`,
        30000,
      )
    : null
  probe?.close()
  browserWebGpu = adapter?.adapter === true && !report.disabled
  record(
    'webgpu-evidence',
    report.mentioned,
    `chrome://gpu disabled=${report.disabled}, offscreen adapter=${adapter?.adapter}`,
  )
} catch (error) {
  fail('webgpu-evidence', error)
}

let baseline = null
try {
  const cold = await classifyOn(page, sw, tabId, text, `qa-cold-${process.pid}`, COLD_MS)
  baseline = cold.card
  record(
    'cold-start',
    cold.card.state === 'ready' && !cold.card.timedOut,
    `${(cold.ms / 1000).toFixed(1)}s verdict=${cold.card.verdict} ${cold.card.percent}% raw=${JSON.stringify(cold.card.buckets)}`,
  )
} catch (error) {
  fail('cold-start', error)
}

// 3. The provider actually chosen, and the reason if it fell back.
let diag = await offscreenDiagnostics()
try {
  const provider = diag?.executionProvider
  const ok = EXPECT ? provider === EXPECT : Boolean(provider)
  const reason = provider === 'wasm' ? ` reason="${diag?.fallbackReason ?? ''}"` : ''
  record(
    'provider',
    ok && (provider !== 'wasm' || Boolean(diag?.fallbackReason)),
    `${provider} threads=${diag?.wasmThreads} coi=${diag?.crossOriginIsolated}${reason}` +
      (EXPECT ? ` (expected ${EXPECT})` : ''),
  )
  if (browserWebGpu !== null) {
    record(
      'provider-matches-browser',
      browserWebGpu ? provider === 'webgpu' : provider === 'wasm',
      `browser WebGPU usable=${browserWebGpu}, chose ${provider}`,
    )
  }
} catch (error) {
  fail('provider', error)
}

// 4. Repeat runs reuse the one session rather than rebuilding it.
try {
  const before = diag?.sessionCreations
  const runs = []
  for (let i = 0; i < 2; i++) {
    runs.push(await classifyOn(page, sw, tabId, text, `qa-repeat-${process.pid}-${i}`))
  }
  diag = await offscreenDiagnostics()
  const sameVerdict = runs.every((r) => r.card.verdict === baseline?.verdict)
  record(
    'repeat-runs',
    runs.every((r) => r.card.state === 'ready') &&
      diag?.sessionCreations === before &&
      sameVerdict,
    `${runs.map((r) => (r.ms / 1000).toFixed(1) + 's').join(', ')} sessionCreations=${diag?.sessionCreations} verdict stable=${sameVerdict}`,
  )
} catch (error) {
  fail('repeat-runs', error)
}

// 5. Concurrent tabs: one shared session, strictly serialized.
try {
  const before = await offscreenDiagnostics()
  // Rule 4: a unique URL marker per tab, or tabs.query picks the wrong one.
  const tabs = await Promise.all(
    [0, 1, 2, 3].map((i) => openTab(`${FIXTURES}?qa=${i}`, { bringToFront: false })),
  )
  const dispatched = []
  for (const [i, t] of tabs.entries()) {
    const body = await t.eval(`(()=>{const p=document.querySelectorAll('section p')[${i % 3}]
      if(!p) return null
      const r=document.createRange();r.selectNodeContents(p)
      const s=getSelection();s.removeAllRanges();s.addRange(r);return s.toString()})()`)
    const h = await t.eval('location.href')
    const id = await tabIdForHref(sw, h)
    dispatched.push({ page: t, id, body })
  }
  await Promise.all(
    dispatched.map((d, i) => dispatchClassify(sw, d.id, d.body, `qa-conc-${process.pid}-${i}`)),
  )
  const cards = await Promise.all(dispatched.map((d) => waitForCard(d.page, DRAIN_MS)))
  const after = await offscreenDiagnostics()
  for (const t of tabs) await closeTab(t)
  record(
    'concurrency',
    cards.every((c) => c.state === 'ready' && !c.timedOut) &&
      after?.maxConcurrentRuns === 1 &&
      after?.sessionCreations === before?.sessionCreations,
    `${cards.length} tabs ready, maxConcurrentRuns=${after?.maxConcurrentRuns}, sessionCreations=${after?.sessionCreations}`,
  )
} catch (error) {
  fail('concurrency', error)
}

// 6. Burst backlog drains without wedging and without overlapping runs.
try {
  const before = await offscreenDiagnostics()
  const BURST = 5
  for (let i = 0; i < BURST; i++) {
    await dispatchClassify(sw, tabId, text, `qa-backlog-${process.pid}-${i}`)
  }
  let after = null
  const deadline = Date.now() + DRAIN_MS
  let peakDepth = 0
  while (Date.now() < deadline) {
    after = await offscreenDiagnostics()
    peakDepth = Math.max(peakDepth, after?.queueDepth ?? 0)
    if (
      after &&
      after.inFlight === 0 &&
      after.queueDepth === 0 &&
      after.runCount >= (before?.runCount ?? 0) + BURST
    ) {
      break
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  const card = await page.eval(CARD_SNAPSHOT).catch(() => null)
  const drained = after?.inFlight === 0 && after?.queueDepth === 0
  record(
    'backlog',
    drained && after?.maxConcurrentRuns === 1,
    `peak queueDepth=${peakDepth}, drained to ${after?.queueDepth}, maxConcurrentRuns=${after?.maxConcurrentRuns}, card=${card?.state}`,
  )
} catch (error) {
  fail('backlog', error)
}

// 8. Hostile CSS page — the card must be mounted, on screen and actually hit-
//    testable, with the page scrolled (a transformed ancestor broke this once).
try {
  const { tab: hostile, body, error } = await hostilePreload
  if (error) throw error
  if (!body) throw new Error('no 40+ word paragraph on the hostile page')
  const id = await tabIdForHref(sw, await hostile.eval('location.href'))
  const { card } = await classifyOn(hostile, sw, id, body, `qa-hostile-${process.pid}`)
  await closeTab(hostile)
  record(
    'hostile-page',
    card.state === 'ready' && card.visibleToUser === true && card.onScreen === true,
    `state=${card.state} visibleToUser=${card.visibleToUser} onScreen=${card.onScreen}`,
  )
} catch (error) {
  fail('hostile-page', error)
}

// 9. A real site, for cross-site CSS resilience.
if (!SITE) {
  say('SKIP  real-site              opt-in, needs the network (--site <url>)')
} else {
  try {
    const { tab: site, body, error } = await sitePreload
    if (error) throw error
    if (!body) throw new Error(`no 40+ word paragraph on ${SITE}`)
    const id = await tabIdForHref(sw, await site.eval('location.href'))
    const { card } = await classifyOn(site, sw, id, body, `qa-site-${process.pid}`)
    await closeTab(site)
    record(
      'real-site',
      card.state === 'ready' && card.visibleToUser === true,
      `${new URL(SITE).hostname} state=${card.state} visibleToUser=${card.visibleToUser}`,
    )
  } catch (error) {
    fail('real-site', error)
  }
}

// Watchdog result, started before the classifier checks and almost always
// already finished by now.
if (!WATCHDOG) {
  say('SKIP  watchdog               covered by tests/unit/classify-watchdog.test.ts (--watchdog to run)')
} else {
  const outcome = await watchdogRun
  if (outcome?.error) {
    fail('watchdog', outcome.error)
  } else {
    record(
      'watchdog',
      !outcome.left,
      outcome.left
        ? `card left 'loading' after ${outcome.left.at}s`
        : `held 'loading' ${Math.round(WATCHDOG_OBSERVE_MS / 1000)}s > ${WATCHDOG_MS / 1000}s deadline`,
    )
  }
}

// 10. Console hygiene across every reachable context.
try {
  const contexts = []
  for (const t of await targets()) {
    if (t.type === 'service_worker' || t.url.includes('offscreen.html') || t.url.includes('options.html')) {
      const c = await attach((x) => x.id === t.id, t.type).catch(() => null)
      if (c) contexts.push(c)
    }
  }
  // Rule 8: each context replays its retained console buffer on attach, so
  // there is nothing to wait for here.
  const errors = []
  const warnings = []
  for (const c of contexts) {
    for (const e of c.events) {
      if (e.kind === 'error' || e.kind === 'exception') errors.push(e.text)
      if (e.kind === 'warning') warnings.push(e.text)
    }
    c.close()
  }
  const unexpected = warnings.filter((w) => !EXPECTED_WARNINGS.some((re) => re.test(w)))
  record(
    'console',
    errors.length === 0 && unexpected.length === 0,
    `${errors.length} errors, ${warnings.length} warnings (${unexpected.length} unexpected)` +
      (errors.length ? ` :: ${errors[0].slice(0, 120)}` : '') +
      (unexpected.length ? ` :: ${unexpected[0].slice(0, 120)}` : ''),
  )
} catch (error) {
  fail('console', error)
}

sw.close()
page.close()

const failed = results.filter((r) => !r.ok)
say('')
say(`${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  say(`failed: ${failed.map((f) => f.name).join(', ')}`)
  process.exit(1)
}
process.exit(0)
