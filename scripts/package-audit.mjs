// The rules a built extension must satisfy, as pure functions.
//
// This exists because the package silently grew to 78 MB, ~50 MB of it
// WebAssembly that was downloaded, stored, and never executed (#34). Two
// separate causes produced it, and both are the kind that come back quietly
// during a dependency bump. Neither shows up in a test run or a typecheck; only
// the build output tells the truth.
//
// Four assertions, one per way the package can rot:
//
//   1. No symlinks. Nothing we build emits one, and a symlinked directory would
//      hide whatever it points at from a walk whose whole premise is seeing
//      every file.
//   2. Exactly one WASM binary, at the path the runtime loads it from. Catches
//      Vite emitting its own copy of a binary we already ship at `ort/`.
//   3. Every runtime file is present. Since we select ONNX Runtime's
//      extern-wasm entry, the emscripten factory `.mjs` is imported at runtime
//      from `ort.env.wasm.wasmPaths` — it used to be inlined and its absence
//      was survivable; now it breaks both providers while the build stays green.
//   4. JavaScript stays under a tight budget. A second `onnxruntime-web`
//      arriving transitively no longer shows up as an extra `.wasm` — the
//      extern-wasm condition applies to it too — so weight is the only signal
//      left that a duplicate runtime has crept back in.
//
// Deliberately free of `main()` and of any "am I the entry module?" test. Two
// review rounds killed two spellings of that check — a path containing a space
// broke one, a symlinked path broke the next — and each time the whole guard
// became a silent no-op that exited 0. The CLI lives in check-package.mjs and
// simply runs; there is no longer a condition that can be wrong.
import { readdirSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

/** Where `ort.env.wasm.wasmPaths` points, via `chrome.runtime.getURL('ort/')`. */
export const ORT_WASM_PATH = 'ort/ort-wasm-simd-threaded.asyncify.wasm'

/**
 * `ORT_RUNTIME_FILES` from shared/ort-runtime.ts, prefixed with the directory
 * `wxt.config.ts` copies them into. Restated rather than imported because this
 * is plain Node and that module is TypeScript; a unit test asserts the two stay
 * equal.
 */
export const REQUIRED_ORT_FILES = ['ort/ort-wasm-simd-threaded.asyncify.mjs', ORT_WASM_PATH]

/**
 * Ceiling on packaged JavaScript, measured at 229.42 kB. Scoped to `.js` alone
 * so icons, HTML and other product weight cannot trip an assertion whose
 * subject is duplicated runtime code. Raise it deliberately, with the reason,
 * rather than to make a build pass.
 */
export const JS_BUDGET_BYTES = 260_000

// Decimal units, matching the sizes WXT prints at the end of a build so the two
// outputs can be compared without conversion.
export function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`
  const kb = bytes / 1000
  // Roll over after rounding: 999_999 B is "1000.00 kB" otherwise.
  if (Number(kb.toFixed(2)) < 1000) return `${kb.toFixed(2)} kB`
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}

const bytesOf = (files) => files.reduce((sum, file) => sum + file.bytes, 0)

/**
 * @param {Array<{path: string, bytes: number, symlink?: boolean}>} files every entry in the package
 * @returns {{ok: boolean, wasm: Array<{path: string, bytes: number}>, jsBytes: number, totalBytes: number, reason: string|null}}
 */
export function auditPackage(files) {
  const wasm = files.filter((file) => file.path.endsWith('.wasm'))
  const jsBytes = bytesOf(files.filter((file) => file.path.endsWith('.js')))
  const totalBytes = bytesOf(files)
  const fail = (reason) => ({ ok: false, wasm, jsBytes, totalBytes, reason })
  const list = (entries) => entries.map((f) => `  ${f.path}  ${formatBytes(f.bytes)}`).join('\n')

  const links = files.filter((file) => file.symlink)
  if (links.length > 0) {
    return fail(
      `the package contains symlinks, which nothing we build emits and which can ` +
        `hide files from this audit:\n${links.map((f) => `  ${f.path}`).join('\n')}`,
    )
  }

  if (wasm.length === 0) {
    return fail(`no WASM binary in the package; expected ${ORT_WASM_PATH}`)
  }
  if (wasm.length > 1) {
    return fail(
      `${wasm.length} WASM binaries in the package; expected only ${ORT_WASM_PATH}:\n${list(wasm)}`,
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

  if (jsBytes > JS_BUDGET_BYTES) {
    return fail(
      `packaged JavaScript weighs ${formatBytes(jsBytes)}, over the ` +
        `${formatBytes(JS_BUDGET_BYTES)} budget — look at what grew before raising it; ` +
        `a duplicate ONNX Runtime is the case this budget exists to catch`,
    )
  }

  return { ok: true, wasm, jsBytes, totalBytes, reason: null }
}

/**
 * Every entry under `root`, with POSIX-shaped paths so they can be compared
 * against literals on any host. Symlinks are reported rather than followed:
 * following one risks a loop, and `auditPackage` rejects them outright.
 */
export function listFiles(root) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      const path = relative(root, full).split(sep).join('/')
      if (entry.isSymbolicLink()) {
        // Never stat a symlink here: a dangling one throws, and the audit is
        // going to reject it by name anyway.
        files.push({ path, bytes: 0, mtimeMs: 0, symlink: true })
      } else if (entry.isDirectory()) {
        walk(full)
      } else {
        const { size, mtimeMs } = statSync(full)
        files.push({ path, bytes: size, mtimeMs })
      }
    }
  }
  walk(root)
  return files
}
