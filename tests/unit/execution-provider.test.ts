import { describe, expect, it, vi } from 'vitest'
import {
  RuntimeInitializationError,
  selectExecutionProvider,
} from '@/llm/execution-provider'

describe('execution-provider selection', () => {
  it('prefers WebGPU and does not create a WASM session when WebGPU is healthy', async () => {
    const createWebGpu = vi.fn(async () => 'gpu-session')
    const createWasm = vi.fn(async () => 'wasm-session')

    await expect(
      selectExecutionProvider({
        probeWebGpu: async () => ({ available: true, adapter: { name: 'test-adapter' } }),
        createWebGpu,
        createWasm,
      }),
    ).resolves.toEqual({
      value: 'gpu-session',
      provider: 'webgpu',
    })

    expect(createWebGpu).toHaveBeenCalledOnce()
    expect(createWasm).not.toHaveBeenCalled()
  })

  it.each([
    'WebGPU is not exposed by this Chrome build.',
    'No compatible WebGPU adapter was found.',
  ])('uses WASM directly when WebGPU is unavailable: %s', async (reason) => {
    const createWebGpu = vi.fn(async () => 'gpu-session')
    const createWasm = vi.fn(async () => 'wasm-session')

    await expect(
      selectExecutionProvider({
        probeWebGpu: async () => ({ available: false, reason }),
        createWebGpu,
        createWasm,
      }),
    ).resolves.toEqual({
      value: 'wasm-session',
      provider: 'wasm',
      fallbackReason: reason,
    })

    expect(createWebGpu).not.toHaveBeenCalled()
    expect(createWasm).toHaveBeenCalledWith(reason)
  })

  it('retries with WASM after WebGPU session creation fails', async () => {
    const attempts: string[] = []
    const createWasm = vi.fn(async () => 'wasm-session')

    await expect(
      selectExecutionProvider({
        probeWebGpu: async () => ({ available: true, adapter: {} }),
        createWebGpu: async () => {
          throw new Error('GPUDevice was lost while allocating weights')
        },
        createWasm,
        onAttempt: (attempt) => attempts.push(attempt.provider),
      }),
    ).resolves.toMatchObject({
      value: 'wasm-session',
      provider: 'wasm',
      fallbackReason: 'GPUDevice was lost while allocating weights',
    })

    expect(attempts).toEqual(['webgpu', 'wasm'])
    expect(createWasm).toHaveBeenCalledWith('GPUDevice was lost while allocating weights')
  })

  it('falls back when the WebGPU probe itself fails', async () => {
    await expect(
      selectExecutionProvider({
        probeWebGpu: async () => {
          throw new Error('GPU process unavailable')
        },
        createWebGpu: async () => 'gpu-session',
        createWasm: async () => 'wasm-session',
      }),
    ).resolves.toMatchObject({
      value: 'wasm-session',
      provider: 'wasm',
      fallbackReason: 'GPU process unavailable',
    })
  })

  it.each([
    {
      wasmError: 'failed to allocate a buffer of size 900000000',
      code: 'allocation-failure',
      message: /enough available memory/i,
    },
    {
      wasmError: 'Load model from bytes failed: invalid protobuf',
      code: 'corrupt-model',
      message: /reinstall the verified model/i,
    },
    {
      wasmError: 'WebAssembly SIMD is not supported in the current environment',
      code: 'unsupported-runtime',
      message: /update Chrome/i,
    },
    {
      wasmError: 'backend initialization exploded',
      code: 'provider-initialization',
      message: /neither WebGPU nor local CPU\/WASM/i,
    },
  ] as const)(
    'reports actionable $code when both providers fail',
    async ({ wasmError, code, message }) => {
      const failure = selectExecutionProvider({
        probeWebGpu: async () => ({ available: true, adapter: {} }),
        createWebGpu: async () => {
          throw new Error('GPU device creation failed')
        },
        createWasm: async () => {
          throw new Error(wasmError)
        },
      })

      await expect(failure).rejects.toMatchObject({
        name: 'RuntimeInitializationError',
        code,
        webGpuError: 'GPU device creation failed',
        wasmError,
      })
      await expect(failure).rejects.toThrow(message)
    },
  )

  it('uses a typed runtime error for dual failure', async () => {
    try {
      await selectExecutionProvider({
        probeWebGpu: async () => ({
          available: false,
          reason: 'No compatible WebGPU adapter was found.',
        }),
        createWebGpu: async () => 'unused',
        createWasm: async () => {
          throw new Error('WASM backend failed')
        },
      })
      throw new Error('expected selection to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeInitializationError)
      expect((error as RuntimeInitializationError).diagnosticMessage()).toContain(
        'No compatible WebGPU adapter was found.',
      )
      expect((error as RuntimeInitializationError).diagnosticMessage()).toContain(
        'WASM backend failed',
      )
    }
  })
})
