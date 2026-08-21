#!/usr/bin/env node
// Rehearse the v0.3.0 → 1.0.0 upgrade in Chrome for Testing, end to end.
//
//   pnpm build          # the 1.0.0 build under test, in .output/chrome-mv3
//   pnpm qa:upgrade [--keep]
//
// What it does, in order:
//   1. Builds the real v0.3.0 extension from its release commit in a git
//      worktree and loads it on a fresh scratch profile. The extension ID is
//      derived from the load path, so old and new builds are both served from
//      one stable directory — that is what makes Chrome see an *update*.
//   2. Installs the retired 0.8B model through the 0.3.0 options page, exactly
//      as a v0.x user did, and plants legacy settings so the wipe is observable.
//   3. Swaps the 1.0.0 build into that directory while Chrome is running and
//      reloads the extension through chrome://extensions, which is the path a
//      real update takes: Chrome compares manifests and fires onInstalled with
//      reason "update" and the previous version. (Relaunching with
//      --load-extension after swapping the files does NOT do that — Chrome
//      reports a fresh "install" with no previousVersion, measured.) Then it
//      watches the migration: intent → wiping → downloading → installing →
//      ready, and asserts
//      legacy storage is gone, the data generation is stamped, the sentinel
//      names the pinned 350M artifact, no retired file survives in OPFS, and a
//      classification returns a card.
//   4. Interruption: restores the populated v0.3.0 profile, upgrades the same
//      way, kills Chrome outright while the download is in flight, relaunches,
//      and asserts the persisted intent and journal resume to ready without
//      reviving the retired model.
//   5. Tears everything down unless --keep is given.
//
// Output is PASS/FAIL per check through the shared unbuffered `say`, and the
// process exits non-zero if any check failed. Needs the network: the 0.8B zip
// (~400 MB) once and the 350M zip (~206 MB) twice.
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
process.chdir(repoRoot)

const CDP_PORT = 9333
// debug-extension.mjs reads the port when it is imported, so set it first —
// and drop the full-URL override, which would otherwise silently point every
// call at the developer's live QA browser and reload their real extension.
process.env.SLOPHAMMER_CDP_PORT = String(CDP_PORT)
delete process.env.SLOPHAMMER_CDP
const debug = await import('./debug-extension.mjs')
const { say, targets, openTab, closeTab, tabIdForHref, dispatchClassify, waitForCard, attach } = debug

const KEEP = process.argv.includes('--keep')
const LEGACY_COMMIT = 'd29dfc0'
const LEGACY_VERSION = '0.3.0'
const SCRATCH = resolve('references/releases/upgrade-rehearsal')
const LEGACY_WORKTREE = resolve(SCRATCH, `v${LEGACY_VERSION}`)
const EXT_DIR = resolve(SCRATCH, 'ext')
const PROFILE = resolve(SCRATCH, 'profile')
const PROFILE_SNAPSHOT = resolve(SCRATCH, 'profile-legacy-snapshot')
const NEW_BUILD = resolve('.output/chrome-mv3')
const BIN_PATH_FILE = resolve('chrome-for-testing/bin-path.txt')
const PAGE_PORT = 8797
const PAGE_URL = `http://127.0.0.1:${PAGE_PORT}/`
const SUPPORTED = {
  checkpointId: 'SlopHammer 350M v0.1',
  filename: 'slophammer_350m_v0_1.zip',
  sha256: '3d4f39017e0b47df6d4d3ee1d4a827f7a2eb42106fa12ed95dad4e67c0d63d4e',
}
const LEGACY_INSTALL_MS = 20 * 60_000
const MIGRATION_MS = 20 * 60_000
const TEXT =
  'The quick brown fox jumps over the lazy dog while the committee deliberates at length about matters of no consequence whatsoever, producing minutes that nobody reads and decisions that nobody implements, which is roughly how these things tend to go in practice and has been for years.'

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  say(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(26)} ${detail}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })
const elapsed = (from) => `${((Date.now() - from) / 1000).toFixed(1)}s`

// ---------------------------------------------------------------------------
// Chrome lifecycle

let chrome = null

function launchChrome() {
  const bin = fs.readFileSync(BIN_PATH_FILE, 'utf8').trim()
  chrome = spawn(
    bin,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PROFILE}`,
      `--load-extension=${EXT_DIR}`,
      `--disable-extensions-except=${EXT_DIR}`,
      '--use-mock-keychain',
      '--password-store=basic',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-crash-restore-bubble',
      '--disable-features=InfiniteSessionRestore',
      'about:blank',
    ],
    { stdio: 'ignore', detached: true },
  )
  chrome.unref()
}

async function cdpUp() {
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(1500) })
    return r.ok
  } catch {
    return false
  }
}

async function waitForChrome(ms = 30_000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await cdpUp()) return
    await sleep(250)
  }
  throw new Error('Chrome for Testing did not expose CDP in time')
}

// SIGTERM is a normal quit; SIGKILL is the "Chrome was terminated" case the
// interruption check needs. Either way, wait until the port is silent and no
// process from the group is left, so the next launch gets a closed profile.
async function stopChrome(signal = 'SIGTERM') {
  if (chrome) {
    try {
      process.kill(-chrome.pid, signal)
    } catch {
      /* already gone */
    }
  }
  const start = Date.now()
  while (Date.now() - start < 20_000) {
    if (!(await cdpUp())) break
    await sleep(250)
  }
  try {
    const pids = execSync(`lsof -ti :${CDP_PORT} || true`).toString().trim()
    if (pids) execSync(`kill -9 ${pids.split('\n').join(' ')} || true`)
  } catch {
    /* nothing bound */
  }
  // The profile lock is released a moment after the port closes.
  await sleep(1500)
  chrome = null
}

// ---------------------------------------------------------------------------
// Legacy build

function manifestVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(resolve(dir, 'manifest.json'), 'utf8')).version
  } catch {
    return null
  }
}

function buildLegacy() {
  const built = resolve(LEGACY_WORKTREE, '.output/chrome-mv3')
  if (manifestVersion(built) === LEGACY_VERSION) {
    say(`legacy build already present at ${built}`)
    return built
  }
  fs.mkdirSync(SCRATCH, { recursive: true })
  sh('git worktree prune')
  if (!fs.existsSync(LEGACY_WORKTREE)) {
    sh(`git worktree add --detach "${LEGACY_WORKTREE}" ${LEGACY_COMMIT}`)
  }
  say(`building v${LEGACY_VERSION} from ${LEGACY_COMMIT} …`)
  sh('pnpm install --frozen-lockfile', { cwd: LEGACY_WORKTREE, env: { ...process.env, CI: '1' } })
  sh('pnpm build', { cwd: LEGACY_WORKTREE })
  if (manifestVersion(built) !== LEGACY_VERSION) {
    throw new Error(`expected a ${LEGACY_VERSION} manifest in ${built}, got ${manifestVersion(built)}`)
  }
  return built
}

// Swap the directory Chrome has loaded with two renames rather than an
// rm-then-cp window during which the path is half-written.
function stage(buildDir) {
  const next = `${EXT_DIR}.next`
  const old = `${EXT_DIR}.old`
  fs.rmSync(next, { recursive: true, force: true })
  fs.rmSync(old, { recursive: true, force: true })
  fs.cpSync(buildDir, next, { recursive: true })
  if (fs.existsSync(EXT_DIR)) fs.renameSync(EXT_DIR, old)
  fs.renameSync(next, EXT_DIR)
  fs.rmSync(old, { recursive: true, force: true })
  say(`staged ${manifestVersion(EXT_DIR)} at ${EXT_DIR}`)
}

// ---------------------------------------------------------------------------
// Probes, all evaluated in an extension context (same origin as OPFS)

let EXT_ID = null
let LEGACY_TREE = new Map()

const READ_STORAGE = `chrome.storage.local.get(null)`
const READ_SENTINEL = `(async()=>{try{const r=await navigator.storage.getDirectory();const d=await r.getDirectoryHandle('slop-hammer');return JSON.parse(await (await (await d.getFileHandle('.ready')).getFile()).text())}catch(e){return null}})()`
const READ_JOURNAL = `(async()=>{try{const r=await navigator.storage.getDirectory();return JSON.parse(await (await (await r.getFileHandle('.slophammer-v1-migration.json')).getFile()).text())}catch(e){return null}})()`
const OPFS_TREE = `(async()=>{const out=[];async function walk(dir,p){for await (const [name,h] of dir.entries()){const q=p+'/'+name;if(h.kind==='directory'){out.push({path:q+'/',size:0});await walk(h,q)}else out.push({path:q,size:(await h.getFile()).size})}}await walk(await navigator.storage.getDirectory(),'');return out.sort((a,b)=>a.path<b.path?-1:1)})()`
const READ_CONTRACT = (file) => `(async()=>{try{const r=await navigator.storage.getDirectory();const d=await (await r.getDirectoryHandle('slop-hammer')).getDirectoryHandle('model');return JSON.parse(await (await (await d.getFileHandle(${JSON.stringify(file)})).getFile()).text())}catch(e){return null}})()`

// The extension's own service worker, verified to be one: Chrome lists other
// service_worker targets too, and the first match is not necessarily ours. An
// attached session also keeps the worker from idling out while we poll it.
async function extensionContext() {
  for (let i = 0; i < 40; i++) {
    const list = await targets()
    // Chrome's own component extensions show up here too (a thunk.js worker
    // sat ahead of ours), so try every candidate and keep the one that is us.
    const candidates = list.filter(
      (t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://') && (!EXT_ID || new URL(t.url).host === EXT_ID),
    )
    for (const candidate of candidates) {
      const sw = await attach((t) => t.id === candidate.id, 'sw')
      if (!sw) continue
      const ok = await sw.eval(`typeof chrome !== 'undefined' && !!chrome.storage?.local`, 5000).catch(() => false)
      if (ok === true) {
        sw.extensionId = new URL(candidate.url).host
        return sw
      }
      sw.close()
    }
    // Rule 2: wake an idle worker through any extension page.
    const page = list.find((t) => t.type === 'page' && t.url.startsWith('chrome-extension://'))
    if (page) {
      const p = await attach((t) => t.id === page.id, 'ext-page')
      if (p) {
        await p.eval(`chrome.runtime.sendMessage({type:'sh-debug-wake'}).catch(()=>{})`, 5000).catch(() => {})
        p.close()
      }
    }
    await sleep(500)
  }
  const seen = (await targets()).map((t) => `${t.type} ${t.url}`)
  throw new Error(`no extension service worker with chrome.storage; targets: ${JSON.stringify(seen)}`)
}

async function probe(ctx, expr, ms = 15_000) {
  const value = await ctx.eval(expr, ms)
  if (value && value.__error) throw new Error(value.__error)
  return value
}

// Reload the unpacked extension in place, exactly as the Reload button on
// chrome://extensions does. chrome.developerPrivate exists only in that WebUI,
// and CDP can drive it like any other page.
async function reloadExtension() {
  const page = await openTab('chrome://extensions/')
  // --load-extension bypasses the developer-mode gate at launch, but a reload
  // through the extensions page does not: without Developer mode on in the
  // profile the reload leaves the extension DISABLED with
  // unsupportedDeveloperExtension=true and no worker ever comes back.
  const devMode = await page.eval(
    `new Promise((res) => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, () => res(chrome.runtime.lastError?.message ?? 'ok')))`,
    10_000,
  )
  if (devMode !== 'ok') throw new Error(`could not enable developer mode: ${devMode}`)
  const outcome = await page.eval(
    `new Promise((res) => { chrome.developerPrivate.reload(${JSON.stringify(EXT_ID)}, { failQuietly: false, populateErrorForUnpacked: true }).then(() => res('ok'), (e) => res('rejected: ' + String(e))); setTimeout(() => res('timeout'), 15000) })`,
    20_000,
  )
  say(`  developerPrivate.reload(${EXT_ID}) → ${outcome}`)
  await closeTab(page).catch(() => {})
  if (outcome !== 'ok') throw new Error(`reload: ${outcome}`)
  const want = manifestVersion(EXT_DIR)
  const start = Date.now()
  while (Date.now() - start < 30_000) {
    try {
      const sw = await extensionContext()
      const version = await probe(sw, `chrome.runtime.getManifest().version`, 5000)
      sw.close()
      if (version === want) {
        say(`  extension reloaded in place, now running ${version} (${elapsed(start)})`)
        return
      }
    } catch {
      /* worker mid-restart */
    }
    await sleep(500)
  }
  throw new Error(`extension did not come back as ${want} after the reload`)
}

// What Chrome told the extension on the reload. The worker logs the
// onInstalled details object; the console buffer is replayed to a fresh CDP
// session with the object still addressable, so read its properties rather
// than racing the migration's storage wipe for the persisted intent.
async function readOnInstalled() {
  const target = (await targets()).find(
    (t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${EXT_ID}/`),
  )
  if (!target) return null
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  let id = 0
  const pending = new Map()
  let objectId = null
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result)
      pending.delete(m.id)
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
      if (text.includes('onInstalled')) objectId = m.params.args.find((a) => a.type === 'object')?.objectId ?? objectId
    }
  })
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id
      pending.set(i, res)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  try {
    await send('Runtime.enable')
    await sleep(1000)
    if (!objectId) return null
    const r = await send('Runtime.getProperties', { objectId, ownProperties: true })
    return Object.fromEntries((r?.result ?? []).map((p) => [p.name, p.value?.value]))
  } finally {
    ws.close()
  }
}

// ---------------------------------------------------------------------------
// Steps

async function populateLegacyProfile() {
  fs.rmSync(PROFILE, { recursive: true, force: true })
  launchChrome()
  await waitForChrome()
  // 0.3.0 opens its options page on first install; give it a moment.
  await sleep(2000)
  const sw = await extensionContext()
  const extId = sw.extensionId
  EXT_ID = extId
  let options = await attach((t) => t.url.includes('options.html'), 'options')
  if (!options) options = await openTab(`chrome-extension://${extId}/options.html`)
  await probe(options, `new Promise(r=>{const t=()=>document.querySelector('[data-testid="install-hosted"]')?r():setTimeout(t,100);t()})`)

  await probe(
    sw,
    `chrome.storage.local.set({'qa-upgrade-marker':'legacy','slophammer-settings':{resultDetail:'advanced',theme:'dark'}})`,
  )
  await probe(options, `document.querySelector('[data-testid="install-hosted"]').click()`)
  say('legacy: hosted 0.8B install started through the 0.3.0 options page')

  const start = Date.now()
  let lastReport = 0
  let sentinel = null
  while (Date.now() - start < LEGACY_INSTALL_MS) {
    sentinel = await probe(sw, READ_SENTINEL)
    if (sentinel) break
    if (Date.now() - lastReport > 15_000) {
      const progress = await probe(
        options,
        `document.querySelector('[data-testid="progress-text"]')?.textContent ?? document.body.innerText.slice(0,80)`,
      ).catch(() => '?')
      say(`  legacy install … ${String(progress).replace(/\s+/g, ' ').trim()} (${elapsed(start)})`)
      lastReport = Date.now()
    }
    await sleep(1000)
  }
  if (!sentinel) throw new Error('the 0.8B install did not finish inside its budget')

  const storage = await probe(sw, READ_STORAGE)
  const tree = await probe(sw, OPFS_TREE)
  LEGACY_TREE = new Map(tree.map((f) => [f.path, f.size]))
  const legacyBytes = tree.reduce((n, f) => n + f.size, 0)
  record(
    'legacy profile populated',
    typeof sentinel.checkpointId === 'string' && sentinel.checkpointId !== SUPPORTED.checkpointId,
    `sentinel=${JSON.stringify(sentinel.checkpointId)} files=${tree.length} bytes=${legacyBytes} storageKeys=${Object.keys(storage).sort().join(',')} (${elapsed(start)})`,
  )
  options.close()
  sw.close()
  await stopChrome()
  fs.rmSync(PROFILE_SNAPSHOT, { recursive: true, force: true })
  fs.cpSync(PROFILE, PROFILE_SNAPSHOT, { recursive: true })
  say('legacy: profile snapshot taken')
}

async function restoreLegacyProfile() {
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.cpSync(PROFILE_SNAPSHOT, PROFILE, { recursive: true })
}

// Watch storage + journal until the migration settles. Returns the timeline
// of distinct (phase, progress-bucket) observations plus the final snapshot.
async function watchMigration({ until, budgetMs }) {
  const start = Date.now()
  const timeline = []
  let sw = await extensionContext()
  let intentSeen = null
  let last = ''
  while (Date.now() - start < budgetMs) {
    let storage, journal
    try {
      storage = await probe(sw, READ_STORAGE)
      journal = await probe(sw, READ_JOURNAL)
    } catch {
      sw.close()
      sw = await extensionContext()
      continue
    }
    if (storage['slophammer-v1-migration-intent']) intentSeen = storage['slophammer-v1-migration-intent']
    const state = storage['slophammer-v1-migration'] ?? journal
    const phase = state?.phase ?? 'none'
    const bucket = phase === 'downloading' || phase === 'installing' ? Math.floor((state.progress ?? 0) / 25) * 25 : ''
    const key = `${phase}${bucket === '' ? '' : ':' + bucket}`
    if (key !== last) {
      timeline.push({ t: elapsed(start), phase, progress: state?.progress, destructive: state?.destructive })
      say(`  migration ${key.padEnd(16)} ${elapsed(start)}`)
      last = key
    }
    if (until({ phase, state, storage })) {
      return { timeline, storage, journal, intentSeen, sw }
    }
    await sleep(500)
  }
  sw.close()
  throw new Error(`migration did not reach the expected state inside ${budgetMs / 1000}s`)
}

function assertUpgraded(label, { timeline, storage, journal, intentSeen, installed }, sentinel, tree, contract) {
  const phases = timeline.map((e) => e.phase)
  const order = ['downloading', 'installing', 'ready'].every((p, i, arr) => {
    const at = phases.indexOf(p)
    return at !== -1 && (i === 0 || at > phases.indexOf(arr[i - 1]))
  })
  record(`${label}: phases`, order, `${[...new Set(phases)].join(' → ')}`)
  record(
    `${label}: onInstalled`,
    installed?.reason === 'update' && installed?.previousVersion === LEGACY_VERSION,
    `${JSON.stringify(installed)}${intentSeen ? ` intent=${JSON.stringify(intentSeen)}` : ' (intent key already wiped when first polled)'}`,
  )
  record(
    `${label}: journal`,
    journal?.phase === 'ready' && journal?.destructive === true,
    `phase=${journal?.phase} destructive=${journal?.destructive} artifact=${journal?.artifact}`,
  )
  const settings = storage['slophammer-settings']
  const legacyGone =
    !('qa-upgrade-marker' in storage) &&
    settings?.theme !== 'dark' &&
    settings?.resultDetail !== 'advanced' &&
    (storage.checkpoint_id === undefined || storage.checkpoint_id === SUPPORTED.checkpointId)
  record(
    `${label}: legacy storage`,
    legacyGone,
    `keys=${Object.keys(storage).sort().join(',')} checkpoint_id=${JSON.stringify(storage.checkpoint_id)}`,
  )
  record(`${label}: generation`, storage['slophammer-data-generation'] === 1, `slophammer-data-generation=${storage['slophammer-data-generation']}`)
  record(
    `${label}: sentinel`,
    sentinel?.checkpointId === SUPPORTED.checkpointId &&
      sentinel?.hosted?.filename === SUPPORTED.filename &&
      sentinel?.hosted?.lfsOid === SUPPORTED.sha256,
    `checkpoint=${JSON.stringify(sentinel?.checkpointId)} hosted=${sentinel?.hosted?.filename} oid=${String(sentinel?.hosted?.lfsOid).slice(0, 12)}…`,
  )
  // The retired and the pinned model use the same file names under
  // slop-hammer/model/, so a name check cannot tell them apart. Compare
  // contents: the contract file must declare the pinned version, and no
  // weight file may still have the byte size it had in the legacy profile.
  const weights = tree.filter((f) => /\.onnx(\.data_\d+)?$/.test(f.path))
  const survivors = weights.filter((f) => LEGACY_TREE.get(f.path) === f.size)
  const bytes = tree.reduce((n, f) => n + f.size, 0)
  const legacyBytes = [...LEGACY_TREE.values()].reduce((n, v) => n + v, 0)
  record(
    `${label}: retired model gone`,
    contract?.version === SUPPORTED.checkpointId && survivors.length === 0 && weights.length > 0 && tree.some((f) => f.path.endsWith('/.ready')),
    `contract=${JSON.stringify(contract?.version)} weights=${weights.length} legacySizedWeights=${survivors.length} bytes ${legacyBytes} → ${bytes}`,
  )
}

async function classifyOnce(sw) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><meta charset="utf-8"><title>qa-upgrade</title><p>${TEXT}</p>`)
  })
  await new Promise((r, j) => {
    server.once('error', j)
    server.listen(PAGE_PORT, '127.0.0.1', r)
  })
  try {
    const page = await openTab(PAGE_URL)
    await sleep(1200)
    const tabId = await tabIdForHref(sw, PAGE_URL)
    const start = Date.now()
    await dispatchClassify(sw, tabId, TEXT, 'qa-upgrade')
    const card = await waitForCard(page, 180_000)
    record(
      'classifies after upgrade',
      card?.state === 'ready',
      `state=${card?.state} verdict=${card?.verdict ?? '-'} placement=${card?.placement ?? '-'} (${elapsed(start)})`,
    )
    await closeTab(page)
  } finally {
    server.close()
  }
}

// The profile holds a populated v0.3.0 and EXT_DIR still serves v0.3.0: bring
// that up, then swap the files and reload so Chrome sees an update.
async function upgradeInPlace() {
  launchChrome()
  await waitForChrome()
  await sleep(1500)
  stage(NEW_BUILD)
  await reloadExtension()
  const installed = await readOnInstalled()
  say(`  onInstalled ${JSON.stringify(installed)}`)
  return installed
}

async function snapshotInstall(sw, sentinel) {
  const tree = await probe(sw, OPFS_TREE)
  const contract = sentinel?.contractFile ? await probe(sw, READ_CONTRACT(sentinel.contractFile)) : null
  return { tree, contract }
}

async function upgradeAndVerify() {
  const installed = await upgradeInPlace()
  const watched = await watchMigration({
    until: ({ phase }) => phase === 'ready' || phase === 'error',
    budgetMs: MIGRATION_MS,
  })
  const sentinel = await probe(watched.sw, READ_SENTINEL)
  const { tree, contract } = await snapshotInstall(watched.sw, sentinel)
  assertUpgraded('upgrade', { ...watched, installed }, sentinel, tree, contract)
  await classifyOnce(watched.sw)
  watched.sw.close()
  await stopChrome()
}

async function interruptAndResume() {
  await restoreLegacyProfile()
  stage(resolve(LEGACY_WORKTREE, '.output/chrome-mv3'))
  const installed = await upgradeInPlace()
  // Kill at the first sight of the download. Progress may never report (a
  // response without content-length publishes 0 throughout) and a fast link
  // can finish between two polls, so a later phase is a distinct outcome,
  // not a twenty-minute wait.
  const mid = await watchMigration({
    until: ({ phase }) => phase === 'downloading' || phase === 'installing' || phase === 'ready' || phase === 'error',
    budgetMs: MIGRATION_MS,
  })
  mid.sw.close()
  const midPhase = mid.storage['slophammer-v1-migration']?.phase
  if (midPhase !== 'downloading') {
    throw new Error(`the download outran the kill window — first observed phase was ${midPhase}; rerun on a slower link or throttle the fetch`)
  }
  say(`  killing Chrome at downloading ${mid.storage['slophammer-v1-migration']?.progress}%`)
  await stopChrome('SIGKILL')

  launchChrome()
  await waitForChrome()
  const resumed = await watchMigration({
    until: ({ phase }) => phase === 'ready' || phase === 'error',
    budgetMs: MIGRATION_MS,
  })
  const firstAfterRestart = resumed.timeline[0]?.phase
  record(
    'resume: picks up',
    firstAfterRestart !== undefined && firstAfterRestart !== 'none' && firstAfterRestart !== 'ready',
    `first observed phase after restart=${firstAfterRestart}`,
  )
  const sentinel = await probe(resumed.sw, READ_SENTINEL)
  const { tree, contract } = await snapshotInstall(resumed.sw, sentinel)
  // onInstalled fired on the reload before the kill; the relaunch recovers
  // from the persisted intent and journal, which is the point of this pass.
  const merged = { ...resumed, intentSeen: resumed.intentSeen ?? mid.intentSeen, installed }
  assertUpgraded('resume', merged, sentinel, tree, contract)
  resumed.sw.close()
  await stopChrome()
}

async function teardown(keep) {
  await stopChrome().catch(() => {})
  if (keep) {
    say(`kept scratch state under ${SCRATCH} (legacy build, profile snapshot, staged extension)`)
    return
  }
  for (const dir of [PROFILE, PROFILE_SNAPSHOT, EXT_DIR]) fs.rmSync(dir, { recursive: true, force: true })
  try {
    sh(`git worktree remove --force "${LEGACY_WORKTREE}"`)
  } catch {
    fs.rmSync(LEGACY_WORKTREE, { recursive: true, force: true })
    try {
      sh('git worktree prune')
    } catch {
      /* nothing to prune */
    }
  }
  fs.rmSync(SCRATCH, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------

let failure = null
try {
  const newVersion = manifestVersion(NEW_BUILD)
  if (!newVersion) throw new Error(`no build at ${NEW_BUILD} — run pnpm build first`)
  if (newVersion === LEGACY_VERSION) throw new Error('the build under test is the legacy version')
  if (!fs.existsSync(BIN_PATH_FILE)) throw new Error('Chrome for Testing not installed — run pnpm setup:chrome')
  if (await cdpUp()) throw new Error(`something is already listening on :${CDP_PORT}`)
  say(`qa:upgrade  ${LEGACY_VERSION} (${LEGACY_COMMIT}) → ${newVersion}  scratch=${SCRATCH}`)

  stage(buildLegacy())
  await populateLegacyProfile()
  await upgradeAndVerify()
  await interruptAndResume()
} catch (error) {
  failure = error
  say(`\nRUN ABORTED: ${error?.stack ?? error}`)
} finally {
  // A failed run keeps its evidence (and the minutes-long legacy build);
  // a clean one removes everything unless asked not to.
  await teardown(KEEP || failure !== null || results.some((r) => !r.ok))
}

const failed = results.filter((r) => !r.ok)
say('')
say(`${results.length - failed.length}/${results.length} checks passed${failure ? ' (run aborted early)' : ''}`)
for (const f of failed) say(`  FAIL ${f.name}: ${f.detail}`)
// CDP websockets may still be open; exit explicitly so the run never hangs.
process.exit(failed.length || failure ? 1 : 0)
