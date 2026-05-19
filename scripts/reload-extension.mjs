// Refresh the release folder and cleanly restart Chrome for Testing so the
// new SW + manifest are loaded from disk. `chrome.runtime.reload()` is not
// reliable in MV3 — it sometimes leaves the extension disabled. A kill +
// relaunch of CfT (with the same --user-data-dir so the OPFS model stays)
// is the only way to guarantee the next SW boot picks up the built files.

import { execSync, spawn } from 'node:child_process'

const CDP_URL = process.env.CDP_URL ?? 'http://127.0.0.1:9222'

execSync('pnpm release', { stdio: 'inherit' })

try {
  // pnpm chrome launches via bash; grep for the exact Chrome process.
  execSync(
    "ps aux | grep 'remote-debugging-port=9222' | grep -v grep | awk '{print $2}' | xargs -r kill",
    { stdio: 'inherit', shell: '/bin/bash' },
  )
} catch {
  // ok if nothing was running
}

// Give the OS a moment to release the port.
await new Promise((r) => setTimeout(r, 500))

const child = spawn('pnpm', ['chrome'], {
  stdio: 'ignore',
  detached: true,
})
child.unref()

// Wait until CDP is ready
const deadline = Date.now() + 10_000
while (Date.now() < deadline) {
  try {
    const r = await fetch(CDP_URL + '/json/version')
    if (r.ok) {
      console.log('CfT is up.')
      process.exit(0)
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 200))
}
console.error('Timed out waiting for CfT.')
process.exit(1)
