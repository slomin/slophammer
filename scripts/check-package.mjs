#!/usr/bin/env node
// Packaging guard, run against a build that already exists:
//
//   pnpm build && pnpm check:package
//
// This exists because the package silently grew to 78 MB, ~50 MB of it
// WebAssembly that was downloaded, stored, and never executed (#34). Two
// separate causes produced it, and both are the kind that come back quietly
// during a dependency bump. Neither shows up in a test run or a typecheck; only
// the build output tells the truth. `pnpm release` runs this so a release
// cannot regress unnoticed.
//
// Three assertions, one per way the package can rot:
//
//   1. Exactly one WASM binary, at the path the runtime loads it from. Catches
//      Vite emitting its own copy of a binary we already ship at `ort/`.
//   2. Every file in ORT_RUNTIME_FILES is present. Since we select ONNX
//      Runtime's extern-wasm entry, the emscripten factory `.mjs` is loaded at
//      runtime from `ort.env.wasm.wasmPaths` — it used to be inlined and its
//      absence was survivable; now it is not.
//   3. Everything that is not the binary stays under a tight ceiling. A second
//      `onnxruntime-web` arriving transitively no longer shows up as an extra
//      `.wasm` — the extern-wasm condition applies to it too — so weight is the
//      only signal left that a duplicate runtime has crept back in.
import { readdirSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where `ort.env.wasm.wasmPaths` points, via `chrome.runtime.getURL('ort/')`. */
export const ORT_WASM_PATH = 'ort/ort-wasm-simd-threaded.asyncify.wasm'

/**
 * Everything the runtime fetches from `ort/`. Kept in step with
 * `shared/ort-runtime.ts` by a unit test — this file is plain Node and cannot
 * import the TypeScript module the build copies from.
 */
export const REQUIRED_ORT_FILES = [
  'ort/ort-wasm-simd-threaded.asyncify.mjs',
  ORT_WASM_PATH,
]

/**
 * Ceiling on everything except the WASM binary. Measured at 306.81 kB; raise it
 * deliberately, with the reason, rather than to make a build pass.
 */
export const NON_WASM_BUDGET_BYTES = 340_000

// Decimal units, matching the sizes WXT prints at the end of a build so the two
// outputs can be compared without conversion.
export function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`
  const kb = bytes / 1000
  // Roll over after rounding: 999_999 B is "1000.00 kB" otherwise.
  if (Number(kb.toFixed(2)) < 1000) return `${kb.toFixed(2)} kB`
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}

/**
 * @param {Array<{path: string, bytes: number}>} files every file in the package
 * @returns {{ok: boolean, wasm: Array<{path: string, bytes: number}>, nonWasmBytes: number, reason: string|null}}
 */
export function auditPackage(files) {
  const wasm = files.filter((file) => file.path.endsWith('.wasm'))
  const nonWasmBytes = files
    .filter((file) => !file.path.endsWith('.wasm'))
    .reduce((sum, file) => sum + file.bytes, 0)
  const fail = (reason) => ({ ok: false, wasm, nonWasmBytes, reason })

  if (wasm.length === 0) {
    return fail(`no WASM binary in the package; expected ${ORT_WASM_PATH}`)
  }
  if (wasm.length > 1) {
    const listed = wasm.map((f) => `  ${f.path}  ${formatBytes(f.bytes)}`).join('\n')
    return fail(
      `${wasm.length} WASM binaries in the package; expected only ${ORT_WASM_PATH}:\n${listed}`,
    )
  }
  if (wasm[0].path !== ORT_WASM_PATH) {
    return fail(`WASM binary is at ${wasm[0].path}, but the runtime loads ${ORT_WASM_PATH}`)
  }

  const present = new Set(files.map((file) => file.path))
  const missing = REQUIRED_ORT_FILES.filter((path) => !present.has(path))
  if (missing.length > 0) {
    return fail(
      `the runtime loads these from ort/ at startup and they are not packaged:\n${missing
        .map((path) => `  ${path}`)
        .join('\n')}`,
    )
  }

  if (nonWasmBytes > NON_WASM_BUDGET_BYTES) {
    return fail(
      `everything but the WASM binary weighs ${formatBytes(nonWasmBytes)}, over the ` +
        `${formatBytes(NON_WASM_BUDGET_BYTES)} budget — check for a duplicate runtime`,
    )
  }

  return { ok: true, wasm, nonWasmBytes, reason: null }
}

export function listFiles(root) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      // Package paths are compared against literals, so they are always
      // POSIX-shaped regardless of what the host separator is.
      else files.push({ path: relative(root, full).split(sep).join('/'), bytes: statSync(full).size })
    }
  }
  walk(root)
  return files
}

function main() {
  const root = resolve(process.argv[2] ?? '.output/chrome-mv3')
  let files
  let built
  try {
    files = listFiles(root)
    built = statSync(root).mtime.toISOString().replace('T', ' ').slice(0, 19)
  } catch (error) {
    // Distinguish "never built" from a permission error or a dangling symlink
    // deep in the walk; both used to arrive as the same misleading advice.
    const hint = error?.code === 'ENOENT' ? ' — run `pnpm build` first' : ''
    console.error(`[check-package] cannot read ${root}: ${error?.message ?? error}${hint}`)
    process.exit(1)
  }

  const result = auditPackage(files)
  const total = files.reduce((sum, file) => sum + file.bytes, 0)

  // This audits whatever is on disk; the timestamp is how you tell whether it
  // is the build you think it is.
  console.log(`  ${root} built ${built}`)
  for (const file of result.wasm) console.log(`  ${file.path}  ${formatBytes(file.bytes)}`)
  console.log(`  everything else  ${formatBytes(result.nonWasmBytes)}`)
  console.log(`  unpacked  ${formatBytes(total)}  (${files.length} files)`)

  if (!result.ok) {
    console.error(`FAIL  ${result.reason}`)
    process.exit(1)
  }
  console.log('PASS  one ONNX Runtime WASM binary, runtime files present, budget clear')
}

// Importable for tests; only the CLI invocation walks the filesystem. Compare
// resolved paths rather than building a `file://` string by hand — a repository
// checked out under a path with a space percent-encodes in `import.meta.url`,
// the comparison silently fails, and the guard becomes a no-op that exits 0.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
