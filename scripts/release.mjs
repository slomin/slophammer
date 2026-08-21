import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RELEASE_DIR = resolve('references/releases/current')
const PKG_VERSION = JSON.parse(execSync('cat package.json').toString()).version
const ZIP_NAME = `slophammer-${PKG_VERSION}-chrome.zip`

// `wxt zip` runs a full build of its own first, so this both builds and packs.
// A separate `pnpm build` here would be a second identical build, and — worse —
// anything checked between the two would be auditing a tree that `wxt zip` then
// throws away and replaces.
execSync('pnpm exec wxt zip', { stdio: 'inherit' })

// Exits non-zero if the package grew a second ONNX Runtime WASM binary, lost a
// file the runtime loads from ort/, or outgrew its budget (#34). Because the
// audit now runs after packing, a failure leaves a finished zip on disk that is
// indistinguishable by name from a good one — and that is exactly the file
// somebody would reach for to upload. Delete it.
try {
  execSync('pnpm check:package', { stdio: 'inherit' })
} catch (error) {
  rmSync(resolve(`.output/${ZIP_NAME}`), { force: true })
  console.error(`\nRemoved .output/${ZIP_NAME} — it did not pass the package audit.`)
  process.exit(typeof error.status === 'number' ? error.status : 1)
}

if (existsSync(RELEASE_DIR)) rmSync(RELEASE_DIR, { recursive: true, force: true })
mkdirSync(RELEASE_DIR, { recursive: true })
cpSync(resolve('.output/chrome-mv3'), resolve(RELEASE_DIR, 'unpacked'), { recursive: true })
cpSync(resolve(`.output/${ZIP_NAME}`), resolve(RELEASE_DIR, ZIP_NAME))

const sha = execSync('git rev-parse --short HEAD').toString().trim()
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
writeFileSync(
  resolve(RELEASE_DIR, 'README.txt'),
  `SlopHammer — current release
Built from ${sha} at ${stamp}

Load this in Chrome:
  1. chrome://extensions/
  2. Enable "Developer mode" (top-right).
  3. Pre-v1 profiles migrate automatically; do not restore the retired model.
  4. Click "Load unpacked" and select the "unpacked/" folder in this directory.

First-run: the options page opens automatically. Install the official model
from Hugging Face, or use the manual .zip fallback if needed. Then select
40+ words on any http/https page → right-click → Check with SlopHammer.

Toolbar icon opens the options page.

Paths:
  unpacked/                         → folder to "Load unpacked"
  ${ZIP_NAME}   → packed zip (for sharing / store upload)
`,
)
console.log('\nRelease ready at', RELEASE_DIR)
