import { describe, expect, it } from 'vitest'
import { ORT_RUNTIME_FILES } from '@/shared/ort-runtime'

describe('ONNX runtime assets', () => {
  it('packages the matching asyncify pair used by both WebGPU and its WASM fallback', () => {
    expect(ORT_RUNTIME_FILES).toEqual([
      'ort-wasm-simd-threaded.asyncify.mjs',
      'ort-wasm-simd-threaded.asyncify.wasm',
    ])
    expect(ORT_RUNTIME_FILES.every((filename) => !filename.includes('jsep'))).toBe(true)
  })
})
