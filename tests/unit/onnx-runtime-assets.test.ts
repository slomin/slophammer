import { describe, expect, it } from 'vitest'
import { ORT_WEBGPU_RUNTIME_FILES } from '@/shared/ort-runtime'

describe('ONNX WebGPU runtime assets', () => {
  it('packages the asyncify bootstrap pair required by the WebGPU entrypoint', () => {
    expect(ORT_WEBGPU_RUNTIME_FILES).toEqual([
      'ort-wasm-simd-threaded.asyncify.mjs',
      'ort-wasm-simd-threaded.asyncify.wasm',
    ])
    expect(ORT_WEBGPU_RUNTIME_FILES.every((filename) => !filename.includes('jsep'))).toBe(true)
  })
})
