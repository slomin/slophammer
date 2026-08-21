import { describe, expect, it } from 'vitest'
import { ORT_WASM_PATH, auditWasmAssets, formatBytes } from '../../scripts/check-package.mjs'

const MB = 1_000_000
const ort = { path: ORT_WASM_PATH, bytes: 27 * MB }
const noise = [
  { path: 'manifest.json', bytes: 914 },
  { path: 'assets/classifier-worker-BGHZF3Kt.js', bytes: 200_000 },
  { path: 'ort/ort-wasm-simd-threaded.asyncify.mjs', bytes: 48_533 },
]

describe('package WASM audit', () => {
  it('passes when the only WASM binary is the one we serve by path', () => {
    const result = auditWasmAssets([...noise, ort])

    expect(result.ok).toBe(true)
    expect(result.reason).toBeNull()
    expect(result.wasm).toEqual([ort])
  })

  // The regression this guards: the bundled ONNX Runtime entry carries
  // `new URL('…asyncify.wasm', import.meta.url)`, so Vite emits a second
  // 27 MB copy that is downloaded, stored, and never executed (#34).
  it('fails when a second binary is emitted, naming both', () => {
    const duplicate = { path: 'assets/ort-wasm-simd-threaded.asyncify-9GUf3Unn.wasm', bytes: 27 * MB }

    const result = auditWasmAssets([...noise, ort, duplicate])

    expect(result.ok).toBe(false)
    expect(result.wasm).toEqual([ort, duplicate])
    expect(result.reason).toContain('2')
    expect(result.reason).toContain(ORT_WASM_PATH)
    expect(result.reason).toContain(duplicate.path)
  })

  it('fails when the single binary is not where the runtime loads it from', () => {
    const misplaced = { path: 'assets/ort-wasm-simd-threaded.asyncify-9GUf3Unn.wasm', bytes: 27 * MB }

    const result = auditWasmAssets([...noise, misplaced])

    expect(result.ok).toBe(false)
    expect(result.reason).toContain(ORT_WASM_PATH)
  })

  it('fails when no binary is packaged at all', () => {
    const result = auditWasmAssets(noise)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('no')
  })

  it('is not fooled by a filename that merely contains .wasm', () => {
    const result = auditWasmAssets([...noise, ort, { path: 'ort/ort-wasm-simd-threaded.asyncify.mjs.map', bytes: 10 }])

    expect(result.ok).toBe(true)
  })
})

describe('formatBytes', () => {
  it('reports sizes the way the build log does', () => {
    expect(formatBytes(914)).toBe('914 B')
    expect(formatBytes(48_533)).toBe('48.53 kB')
    expect(formatBytes(27_190_919)).toBe('27.19 MB')
  })
})
