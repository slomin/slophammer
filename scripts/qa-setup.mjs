#!/usr/bin/env node
// One-shot QA bootstrap. Idempotent and safe to re-run.
//
//   1. Build the extension if .output/chrome-mv3 is missing or stale.
//   2. Kill anything bound to :8765 (test-page) and the configured Chrome CDP port.
//   3. Spawn the test-page server (detached).
//   4. Spawn Chrome for Testing with http://localhost:8765/ as the startup URL.
//   5. Wait for both to be up.
//   6. Print a ready banner.
//
// On first run you still have to drop the model zip onto the options page once
// — the persistent profile at ~/.slophammer-chrome-profile preserves the
// install across restarts and rebuilds. Override the browser isolation with
// SLOPHAMMER_CHROME_PROFILE and SLOPHAMMER_CDP_PORT when running parallel QA.
//
// Pass --no-webgpu to bring the browser up with WebGPU genuinely unavailable,
// which is how the CPU/WASM fallback is exercised. It uses --disable-gpu:
// --disable-features=WebGPU does NOT work, requestAdapter() still resolves
// under it. Verify with `pnpm qa:runtime --expect wasm`, which cross-checks
// chrome://gpu rather than trusting the flag.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
process.chdir(repoRoot)

const TEST_PAGE_PORT = 8765
const CDP_PORT = readPort('SLOPHAMMER_CDP_PORT', 9222)
const CHROME_PROFILE = resolve(
  process.env.SLOPHAMMER_CHROME_PROFILE ??
    resolve(process.env.HOME ?? '', '.slophammer-chrome-profile'),
)
const BUILD_OUT = resolve(repoRoot, '.output/chrome-mv3')
const BUILD_INPUTS = [
  'public',
  'background',
  'content',
  'entrypoints',
  'install',
  'llm',
  'messaging',
  'migration',
  'settings',
  'shared',
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'wxt.config.ts',
].map((entry) => resolve(repoRoot, entry))

const NO_WEBGPU = process.argv.includes('--no-webgpu')

const log = (m) => console.log(`[qa] ${m}`)

function readPort(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535 (received ${JSON.stringify(raw)}).`)
  }
  return value
}

// wxt.config.ts deletes and re-copies public/ort at module load without
// preserving timestamps, so every `wxt prepare` restamps it and the staleness
// check would rebuild on every run. Skip that one directory rather than all of
// `public`, which also holds the hand-authored icons a rebuild must notice.
const STALENESS_EXCLUDES = [resolve(repoRoot, 'public/ort')]

function latestMtime(path) {
  if (STALENESS_EXCLUDES.includes(path)) return 0
  if (!existsSync(path)) return 0
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.mtimeMs

  let latest = stat.mtimeMs
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name)
    if (entry.isDirectory()) {
      latest = Math.max(latest, latestMtime(child))
    } else {
      latest = Math.max(latest, statSync(child).mtimeMs)
    }
  }
  return latest
}

function ensureBuilt() {
  const out = resolve(BUILD_OUT, 'content-scripts/content.js')
  if (!existsSync(out)) {
    log('no build output — running pnpm build')
    const r = spawnSync('pnpm', ['build'], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error('pnpm build failed')
    return
  }
  const outMtime = statSync(out).mtimeMs
  const srcMtime = Math.max(...BUILD_INPUTS.map(latestMtime))
  if (srcMtime > outMtime) {
    log('sources newer than build — running pnpm build')
    const r = spawnSync('pnpm', ['build'], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error('pnpm build failed')
  } else {
    log('build output is current — skipping pnpm build')
  }
}

function killPort(port) {
  const r = spawnSync('bash', ['-c', `lsof -ti :${port} | xargs -r kill -9`])
  if (r.status === 0) log(`cleared port :${port}`)
}

function waitForPort(port, path = '/', timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get({ host: '127.0.0.1', port, path, timeout: 500 }, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`:${port} not up after ${timeoutMs}ms`))
        else setTimeout(probe, 250)
      })
    }
    probe()
  })
}

function suppressSessionRestore() {
  // Kill any lingering session snapshots so Chrome has nothing to restore,
  // and mark the profile as cleanly exited so it doesn't flag a crash.
  // (These two together are more reliable than either alone — Chrome rewrites
  // exit_type to "Crashed" on startup, but an empty Sessions/ dir still
  // guarantees no tabs get reopened.)
  const profile = CHROME_PROFILE
  if (!existsSync(profile)) return
  const sessionsDir = resolve(profile, 'Default/Sessions')
  try {
    rmSync(sessionsDir, { recursive: true, force: true })
  } catch {}
  const prefs = resolve(profile, 'Default/Preferences')
  if (existsSync(prefs)) {
    try {
      const data = JSON.parse(readFileSync(prefs, 'utf8'))
      data.profile = data.profile || {}
      data.profile.exit_type = 'Normal'
      data.profile.exited_cleanly = true
      writeFileSync(prefs, JSON.stringify(data))
    } catch {}
  }
  log('cleared prior session snapshots')
}

function spawnDetached(command, args, logName) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  child.unref()
  log(`spawned ${logName} (pid ${child.pid})`)
}

async function main() {
  ensureBuilt()

  killPort(TEST_PAGE_PORT)
  killPort(CDP_PORT)
  suppressSessionRestore()

  spawnDetached('node', ['scripts/serve-test-page.mjs'], 'test-page server')
  const chromeArgs = ['scripts/launch-chrome.sh', `http://localhost:${TEST_PAGE_PORT}/`]
  if (NO_WEBGPU) chromeArgs.push('--disable-gpu')
  spawnDetached('bash', chromeArgs, `Chrome for Testing${NO_WEBGPU ? ' (WebGPU disabled)' : ''}`)

  log(`waiting for test-page on :${TEST_PAGE_PORT}`)
  await waitForPort(TEST_PAGE_PORT, '/', 30000)
  log(`waiting for CDP on :${CDP_PORT}`)
  await waitForPort(CDP_PORT, '/json/version', 45000)

  console.log('')
  console.log('================================================================')
  console.log('  SlopHammer — manual QA ready')
  console.log('================================================================')
  console.log(`  test page : http://localhost:${TEST_PAGE_PORT}/`)
  console.log(`  CDP       : http://localhost:${CDP_PORT}`)
  console.log(`  profile   : ${CHROME_PROFILE}`)
  console.log('')
  console.log(`  WebGPU    : ${NO_WEBGPU ? 'DISABLED (--disable-gpu) — exercises the CPU/WASM fallback' : 'available'}`)
  console.log('')
  console.log('  Select a paragraph on the test page → right-click → Check with')
  console.log('  SlopHammer. First run: install the verified 350M model from the options page.')
  console.log('')
  console.log(`  Runtime QA: pnpm qa:runtime${NO_WEBGPU ? ' --expect wasm' : ' --expect webgpu'}`)
  console.log('================================================================')
}

main().catch((err) => {
  console.error('[qa] FAILED:', err.message)
  process.exit(1)
})
