#!/usr/bin/env node
// Audits an existing build. Build first:
//
//   pnpm build && pnpm check:package
//
// The rules live in package-audit.mjs; this file is only ever executed, never
// imported, so it runs unconditionally. See that module for why it carries no
// entry-module guard.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditPackage, formatBytes, listFiles } from './package-audit.mjs'

/** Local time with an explicit offset, so it can be read against a wall clock. */
function stamp(ms) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -d.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ` +
    `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  )
}

const root = resolve(process.argv[2] ?? '.output/chrome-mv3')

let files
try {
  files = listFiles(root)
} catch (error) {
  // Only an absent build earns the build advice. A permission error or a
  // dangling symlink found deep in the walk raises ENOENT too, and used to
  // arrive as the same confidently wrong instruction.
  const hint = existsSync(root) ? '' : ' — run `pnpm build` first'
  console.error(`[check-package] cannot read ${root}: ${error?.message ?? error}${hint}`)
  process.exit(1)
}

const result = auditPackage(files)
// Newest file rather than the directory's own mtime, which only moves when
// top-level entries are added or removed and so goes stale on an in-place build.
const mtimes = files.map((file) => file.mtimeMs).filter(Boolean)

// This audits whatever is on disk; the timestamp is how you tell whether it is
// the build you think it is.
console.log(mtimes.length > 0 ? `  ${root} built ${stamp(Math.max(...mtimes))}` : `  ${root}`)
for (const file of result.wasm) console.log(`  ${file.path}  ${formatBytes(file.bytes)}`)
console.log(`  javascript  ${formatBytes(result.jsBytes)}`)
console.log(`  unpacked  ${formatBytes(result.totalBytes)}  (${files.length} files)`)

if (!result.ok) {
  console.error(`FAIL  ${result.reason}`)
  process.exit(1)
}
console.log('PASS  one ONNX Runtime WASM binary, runtime files present, budget clear')
