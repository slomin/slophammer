#!/usr/bin/env node
// Packaging guard: the built extension must contain exactly one ONNX Runtime
// WASM binary, at the path the runtime actually loads it from.
//
//   pnpm build && pnpm check:package
//
// This exists because the package silently grew to 78 MB, ~50 MB of it
// WebAssembly that was downloaded, stored, and never executed (#34). Two
// separate causes produced it, and both are the kind that come back quietly
// during a dependency bump:
//
//   1. A second `onnxruntime-web` arriving transitively through a library we
//      only wanted a tokenizer from.
//   2. ONNX Runtime's *bundled* entry, which inlines the emscripten factory and
//      so carries `new URL('…asyncify.wasm', import.meta.url)` — enough for Vite
//      to emit its own copy of a binary we already ship at `ort/` and load by
//      path. `wxt.config.ts` selects the extern-wasm entry to avoid that.
//
// Neither shows up in a test run or a typecheck; only the build output tells
// the truth. `pnpm release` runs this so a release cannot regress unnoticed.
import { readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

/** Where `ort.env.wasm.wasmPaths` points, via `chrome.runtime.getURL('ort/')`. */
export const ORT_WASM_PATH = 'ort/ort-wasm-simd-threaded.asyncify.wasm'

// Decimal units, matching the sizes WXT prints at the end of a build so the two
// outputs can be compared without conversion.
export function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(2)} kB`
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}

/**
 * @param {Array<{path: string, bytes: number}>} files every file in the package
 * @returns {{ok: boolean, wasm: Array<{path: string, bytes: number}>, reason: string|null}}
 */
export function auditWasmAssets(files) {
  const wasm = files.filter((file) => file.path.endsWith('.wasm'))

  if (wasm.length === 0) {
    return { ok: false, wasm, reason: `no WASM binary in the package; expected ${ORT_WASM_PATH}` }
  }
  if (wasm.length > 1) {
    const listed = wasm.map((f) => `  ${f.path}  ${formatBytes(f.bytes)}`).join('\n')
    return {
      ok: false,
      wasm,
      reason: `${wasm.length} WASM binaries in the package; expected only ${ORT_WASM_PATH}:\n${listed}`,
    }
  }
  if (wasm[0].path !== ORT_WASM_PATH) {
    return {
      ok: false,
      wasm,
      reason: `WASM binary is at ${wasm[0].path}, but the runtime loads ${ORT_WASM_PATH}`,
    }
  }

  return { ok: true, wasm, reason: null }
}

export function listFiles(root) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push({ path: relative(root, full), bytes: statSync(full).size })
    }
  }
  walk(root)
  return files
}

function main() {
  const root = resolve(process.argv[2] ?? '.output/chrome-mv3')
  let files
  try {
    files = listFiles(root)
  } catch {
    console.error(`[check-package] cannot read ${root} — run \`pnpm build\` first.`)
    process.exit(1)
  }

  const result = auditWasmAssets(files)
  const total = files.reduce((sum, file) => sum + file.bytes, 0)

  for (const file of result.wasm) console.log(`  ${file.path}  ${formatBytes(file.bytes)}`)
  console.log(`  unpacked  ${formatBytes(total)}  (${files.length} files)`)

  if (!result.ok) {
    console.error(`FAIL  ${result.reason}`)
    process.exit(1)
  }
  console.log('PASS  exactly one ONNX Runtime WASM binary')
}

// Importable for tests; only the CLI invocation walks the filesystem.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main()
