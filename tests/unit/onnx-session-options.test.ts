import { describe, expect, it } from 'vitest'
import { webGpuSessionOptions } from '@/llm/onnx-session-options'

describe('ONNX session options', () => {
  it('uses only WebGPU and keeps known provider-assignment chatter out of the console', () => {
    const externalData = [{ path: 'model.onnx_data', data: new Uint8Array([1, 2, 3]) }]

    expect(webGpuSessionOptions(externalData)).toEqual({
      executionProviders: ['webgpu'],
      logSeverityLevel: 3,
      externalData,
    })
  })
})
