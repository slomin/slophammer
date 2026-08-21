import { describe, expect, it } from 'vitest'
import { ORT_RUNTIME_FILES } from '@/shared/ort-runtime'
import {
  JS_BUDGET_BYTES,
  ORT_WASM_PATH,
  REQUIRED_ORT_FILES,
  auditPackage,
  formatBytes,
} from '../../scripts/package-audit.mjs'

const ort = { path: ORT_WASM_PATH, bytes: 27_190_919 }
const factory = { path: 'ort/ort-wasm-simd-threaded.asyncify.mjs', bytes: 48_533 }
// Sized to the real build: 229,419 B of JavaScript across worker, content
// script, background and chunks, so the fixture documents the actual headroom.
const js = [
  { path: 'assets/classifier-worker-BnY1RmVt.js', bytes: 107_976 },
  { path: 'content-scripts/content.js', bytes: 33_696 },
  { path: 'background.js', bytes: 24_467 },
  { path: 'chunks/offscreen-DRmPP53p.js', bytes: 63_280 },
]
const icons = [{ path: 'manifest.json', bytes: 914 }, { path: 'icon/128.png', bytes: 4_750 }]
const good = [...icons, ...js, factory, ort]

describe('package audit', () => {
  it('passes a package with one binary, the runtime files, and weight to spare', () => {
    const result = auditPackage(good)

    expect(result.ok).toBe(true)
    expect(result.reason).toBeNull()
    expect(result.wasm).toEqual([ort])
    expect(result.jsBytes).toBe(229_419)
    expect(result.totalBytes).toBe(27_474_535)
  })

  // The regression this guards: the bundled ONNX Runtime entry carries
  // `new URL('…asyncify.wasm', import.meta.url)`, so Vite emits a second
  // 27 MB copy that is downloaded, stored, and never executed (#34).
  it('fails when a second binary is emitted, returning and naming both', () => {
    const duplicate = { path: 'assets/ort-wasm-simd-threaded.asyncify-9GUf3Unn.wasm', bytes: 27_190_919 }

    const result = auditPackage([...good, duplicate])

    expect(result.ok).toBe(false)
    // main() prints this list; without it a failure names nothing.
    expect(result.wasm).toEqual([ort, duplicate])
    expect(result.reason).toContain(ORT_WASM_PATH)
    expect(result.reason).toContain(duplicate.path)
  })

  it('fails when the single binary is not where the runtime loads it from', () => {
    const misplaced = { path: 'assets/ort-wasm-simd-threaded.asyncify-9GUf3Unn.wasm', bytes: 27_190_919 }

    const result = auditPackage([...icons, ...js, factory, misplaced])

    expect(result.ok).toBe(false)
    expect(result.reason).toContain(ORT_WASM_PATH)
  })

  it('fails when no binary is packaged at all', () => {
    const result = auditPackage([...icons, ...js, factory])

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('no WASM binary')
  })

  // Selecting the extern-wasm entry made the emscripten factory load-bearing:
  // it is imported at runtime from `ort.env.wasm.wasmPaths` rather than inlined,
  // so a package without it builds cleanly and then cannot start ORT at all.
  it('fails when a file the runtime fetches at startup is missing', () => {
    const result = auditPackage([...icons, ...js, ort])

    expect(result.ok).toBe(false)
    expect(result.reason).toContain(factory.path)
  })

  // A symlinked directory hid a second binary from the walk entirely, and the
  // audit reported PASS on a package containing two.
  it('rejects symlinks rather than trusting a walk that cannot see past them', () => {
    const result = auditPackage([...good, { path: 'vendor', bytes: 0, symlink: true }])

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('symlink')
    expect(result.reason).toContain('vendor')
  })
})

// A second onnxruntime-web resolves to the extern entry too, so it emits no
// extra `.wasm` — JavaScript weight is the only signal that one is back.
describe('the JavaScript budget', () => {
  const withJs = (bytes) => [...icons, factory, ort, { path: 'assets/only.js', bytes }]

  it('is set where these tests expect it', () => {
    expect(JS_BUDGET_BYTES).toBe(260_000)
  })

  it('passes at exactly the budget', () => {
    expect(auditPackage(withJs(260_000)).ok).toBe(true)
  })

  it('fails one byte over, and says what to look at', () => {
    const result = auditPackage(withJs(260_001))

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('260.00 kB budget')
    expect(result.reason).toContain('duplicate ONNX Runtime')
  })

  it('leaves the current build room to grow without being slack', () => {
    expect(auditPackage(good).jsBytes).toBeLessThan(JS_BUDGET_BYTES)
    // A duplicate extern-wasm ONNX Runtime bundle is ~67 kB; the budget has to
    // be tight enough that adding one trips it.
    expect(auditPackage(good).jsBytes + 67_000).toBeGreaterThan(JS_BUDGET_BYTES)
  })

  it('ignores non-JavaScript weight, which is not what it is measuring', () => {
    const result = auditPackage([...good, { path: 'icon/512.png', bytes: 400_000 }])

    expect(result.ok).toBe(true)
  })
})

// package-audit.mjs is plain Node and cannot import the TypeScript module the
// build copies from, so the two lists are kept honest here.
describe('required runtime files', () => {
  it('are exactly what wxt.config.ts copies into ort/', () => {
    expect(REQUIRED_ORT_FILES).toEqual(ORT_RUNTIME_FILES.map((file) => `ort/${file}`))
  })
})

describe('formatBytes', () => {
  it('reports sizes the way the build log does', () => {
    expect(formatBytes(914)).toBe('914 B')
    expect(formatBytes(48_533)).toBe('48.53 kB')
    expect(formatBytes(27_190_919)).toBe('27.19 MB')
  })

  it('rolls over to MB after rounding, not before', () => {
    expect(formatBytes(999_499)).toBe('999.50 kB')
    expect(formatBytes(999_999)).toBe('1.00 MB')
  })
})
