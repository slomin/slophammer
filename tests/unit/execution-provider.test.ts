import { ModelIntegrityError } from '@/llm/execution-provider'
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


// The actionable message must come from whichever attempt actually explains the
// failure. Deriving it from the WASM error alone tells a user who ran out of
// memory on WebGPU to restart Chrome instead of freeing memory.
describe('RuntimeInitializationError — choosing the actionable cause', () => {
  it('uses the WebGPU cause when only it is specific', async () => {
    const error = await selectExecutionProvider({
      probeWebGpu: async () => ({ available: true, adapter: {} }),
      createWebGpu: async () => {
        throw new Error('Out of memory allocating buffer of 900000000 bytes')
      },
      createWasm: async () => {
        throw new Error('backend initialization exploded')
      },
    }).then(
      () => null,
      (e: unknown) => e as RuntimeInitializationError,
    )

    expect(error).toBeInstanceOf(RuntimeInitializationError)
    if (!(error instanceof RuntimeInitializationError)) throw new Error('expected a runtime error')
    expect(error.code).toBe('allocation-failure')
    expect(error.message).toMatch(/memory/i)
    expect(error.diagnosticMessage()).toMatch(/900000000/)
    expect(error.diagnosticMessage()).toMatch(/exploded/)
  })

  it('still prefers the WASM cause when it is the specific one', async () => {
    const error = await selectExecutionProvider({
      probeWebGpu: async () => ({ available: false, reason: 'no adapter' }),
      createWasm: async () => {
        throw new Error('invalid protobuf: model is corrupt')
      },
      createWebGpu: async () => {
        throw new Error('unused')
      },
    }).then(
      () => null,
      (e: unknown) => e as RuntimeInitializationError,
    )

    if (!(error instanceof RuntimeInitializationError)) throw new Error('expected a runtime error')
    expect(error.code).toBe('corrupt-model')
    expect(error.message).toMatch(/reinstall/i)
  })

  it('falls back to the generic message when neither cause is specific', async () => {
    const error = await selectExecutionProvider({
      probeWebGpu: async () => ({ available: false, reason: 'no adapter' }),
      createWasm: async () => {
        throw new Error('something odd')
      },
      createWebGpu: async () => {
        throw new Error('unused')
      },
    }).then(
      () => null,
      (e: unknown) => e as RuntimeInitializationError,
    )

    if (!(error instanceof RuntimeInitializationError)) throw new Error('expected a runtime error')
    expect(error.code).toBe('provider-initialization')
  })
})


// A model that cannot be read, parsed or reconciled with the session is not a
// provider problem. Retrying it on the fallback burns a second full session
// build and then reports "restart Chrome" for something only a reinstall fixes.
describe('provider-independent failures', () => {
  it('does not try the fallback when the model itself is the problem', async () => {
    const createWasm = vi.fn()
    const error = await selectExecutionProvider({
      probeWebGpu: async () => ({ available: true, adapter: {} }),
      createWebGpu: async () => {
        throw new ModelIntegrityError('contract does not match the session outputs')
      },
      createWasm,
    }).then(
      () => null,
      (e: unknown) => e as ModelIntegrityError,
    )

    expect(createWasm).not.toHaveBeenCalled()
    expect(error).toBeInstanceOf(ModelIntegrityError)
    if (!(error instanceof ModelIntegrityError)) throw new Error('expected a model error')
    expect(error.message).toMatch(/reinstall/i)
    expect(error.cause).toMatch(/contract does not match/)
  })

  it('still reports a genuine provider failure through the dual-failure path', async () => {
    const createWasm = vi.fn(async () => {
      throw new Error('wasm backend failed')
    })
    await expect(
      selectExecutionProvider({
        probeWebGpu: async () => ({ available: true, adapter: {} }),
        createWebGpu: async () => {
          throw new Error('device lost')
        },
        createWasm,
      }),
    ).rejects.toBeInstanceOf(RuntimeInitializationError)
    expect(createWasm).toHaveBeenCalled()
  })
})
