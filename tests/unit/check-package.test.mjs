import { describe, expect, it } from 'vitest'
import { ORT_RUNTIME_FILES } from '@/shared/ort-runtime'
import {
  NON_WASM_BUDGET_BYTES,
  ORT_WASM_PATH,
  REQUIRED_ORT_FILES,
  auditPackage,
  formatBytes,
} from '../../scripts/check-package.mjs'

const ort = { path: ORT_WASM_PATH, bytes: 27_190_919 }
const factory = { path: 'ort/ort-wasm-simd-threaded.asyncify.mjs', bytes: 48_533 }
const rest = [
  { path: 'manifest.json', bytes: 914 },
  { path: 'assets/classifier-worker-C9ZINb35.js', bytes: 107_870 },
]
const good = [...rest, factory, ort]

describe('package audit', () => {
  it('passes a package with one binary, the runtime files, and weight to spare', () => {
    const result = auditPackage(good)

    expect(result.ok).toBe(true)
    expect(result.reason).toBeNull()
    expect(result.wasm).toEqual([ort])
  })

  // The regression this guards: the bundled ONNX Runtime entry carries
  // `new URL('…asyncify.wasm', import.meta.url)`, so Vite emits a second
  // 27 MB copy that is downloaded, stored, and never executed (#34).
  it('fails when a second binary is emitted, naming both', () => {
    const duplicate = { path: 'assets/ort-wasm-simd-threaded.asyncify-9GUf3Unn.wasm', bytes: 27_190_919 }

    const result = auditPackage([...good, duplicate])

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('2')
    expect(result.reason).toContain(ORT_WASM_PATH)
    expect(result.reason).toContain(duplicate.path)
  })

  it('fails when the single binary is not where the runtime loads it from', () => {
    const misplaced = { path: 'assets/ort-wasm-simd-threaded.asyncify-9GUf3Unn.wasm', bytes: 27_190_919 }

    const result = auditPackage([...rest, factory, misplaced])

    expect(result.ok).toBe(false)
    expect(result.reason).toContain(ORT_WASM_PATH)
  })

  it('fails when no binary is packaged at all', () => {
    const result = auditPackage([...rest, factory])

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('no WASM binary')
  })

  // Selecting the extern-wasm entry made the emscripten factory load-bearing:
  // it is imported at runtime from `ort.env.wasm.wasmPaths` rather than inlined,
  // so a package without it builds cleanly and then cannot start ORT at all.
  it('fails when a file the runtime fetches at startup is missing', () => {
    const result = auditPackage([...rest, ort])

    expect(result.ok).toBe(false)
    expect(result.reason).toContain(factory.path)
  })

  // A second onnxruntime-web resolves to the extern entry too, so it emits no
  // extra `.wasm` — weight is the only signal that a duplicate runtime is back.
  it('fails when everything but the binary outgrows its budget', () => {
    const duplicateRuntime = { path: 'assets/ort.webgpu-DupL1c8t.js', bytes: NON_WASM_BUDGET_BYTES }

    const result = auditPackage([...good, duplicateRuntime])

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('duplicate runtime')
  })

  it('reports the non-WASM weight so the budget can be judged against it', () => {
    expect(auditPackage(good).nonWasmBytes).toBe(914 + 107_870 + 48_533)
  })

  it('is not fooled by a filename that merely contains .wasm', () => {
    const result = auditPackage([...good, { path: 'ort/ort-wasm-simd-threaded.asyncify.mjs.map', bytes: 10 }])

    expect(result.ok).toBe(true)
  })

  // check-package.mjs is plain Node and cannot import the TypeScript module the
  // build copies from, so the two lists are kept honest here.
  it('requires exactly what wxt.config.ts copies into ort/', () => {
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
