import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RELEASE_DIR = resolve('references/releases/current')
const PKG_VERSION = JSON.parse(execSync('cat package.json').toString()).version
const ZIP_NAME = `slophammer-${PKG_VERSION}-chrome.zip`

execSync('pnpm build', { stdio: 'inherit' })
execSync('pnpm exec wxt zip', { stdio: 'inherit' })

if (existsSync(RELEASE_DIR)) rmSync(RELEASE_DIR, { recursive: true, force: true })
mkdirSync(RELEASE_DIR, { recursive: true })
cpSync(resolve('.output/chrome-mv3'), resolve(RELEASE_DIR, 'unpacked'), { recursive: true })
cpSync(resolve(`.output/${ZIP_NAME}`), resolve(RELEASE_DIR, ZIP_NAME))

const sha = execSync('git rev-parse --short HEAD').toString().trim()
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
writeFileSync(
  resolve(RELEASE_DIR, 'README.txt'),
  `Slop Hammer — current release
Built from feat/scaffolding ${sha} at ${stamp}

Load this in Chrome:
  1. chrome://extensions/
  2. Enable "Developer mode" (top-right).
  3. If an older Slop Hammer is installed, REMOVE it first (not reload).
  4. Click "Load unpacked" and select the "unpacked/" folder in this directory.

First-run: the options page opens automatically. Drop any classifier zip
from ../../references/checkpoints-mine/ onto it. Then select ≥75 chars on
any http/https page → right-click → Check with Slop Hammer.

Toolbar icon opens the options page.

Paths:
  unpacked/                         → folder to "Load unpacked"
  ${ZIP_NAME}   → packed zip (for sharing / store upload)
`,
)
console.log('\nRelease ready at', RELEASE_DIR)
