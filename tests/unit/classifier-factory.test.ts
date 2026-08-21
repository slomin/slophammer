import { describe, expect, it, vi } from 'vitest'
import {
  createClassifierRepository,
  ClassifierUnavailableError,
  MODEL_NOT_INSTALLED_MESSAGE,
} from '@/llm/classifier-factory'
import type { ClassifierRepository } from '@/llm/classifier-repository'
import type { ModelStatusMessage } from '@/messaging/protocol'

const onnxClassifier: ClassifierRepository = {
  runtimeDiagnostics: {
    executionProvider: 'wasm',
    wasmThreads: 2,
    crossOriginIsolated: true,
    fallbackReason: 'No compatible WebGPU adapter was found.',
  },
  classify: vi.fn(async () => ({
    probs: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
    rawPct: [10, 20, 30, 40] as [number, number, number, number],
    bucketLabels: ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'] as [string, string, string, string],
    extLlr: 4.2,
    threshold: 3.8088,
    verdict: 'flagged' as const,
    tokenCount: 4,
    analysedTokens: 4,
    truncated: false,
  })),
}

describe('createClassifierRepository', () => {
  it('returns the Onnx classifier when the model is installed', async () => {
    const status: ModelStatusMessage[] = []
    const repo = await createClassifierRepository({
      isModelInstalled: async () => true,
      createOnnxClassifier: async () => onnxClassifier,
      onStatus: (s) => status.push(s),
    })
    expect(repo).toBe(onnxClassifier)
    expect(status.map((s) => s.status)).toEqual(['loading', 'ready'])
    expect(status.at(-1)).toMatchObject({ status: 'ready', provider: 'wasm' })
  })

  // A detector that silently invents verdicts is worse than one that refuses to
  // answer, so no failure path may yield a working-looking classifier.
  it('throws instead of substituting a classifier when no model is installed', async () => {
    const status: ModelStatusMessage[] = []
    const onnxFactory = vi.fn(async () => onnxClassifier)

    await expect(
      createClassifierRepository({
        isModelInstalled: async () => false,
        createOnnxClassifier: onnxFactory,
        onStatus: (s) => status.push(s),
      }),
    ).rejects.toBeInstanceOf(ClassifierUnavailableError)

    expect(onnxFactory).not.toHaveBeenCalled()
    expect(status.map((s) => s.status)).toEqual(['not-installed'])
  })

  it('surfaces the not-installed message so the user is told what to do', async () => {
    await expect(
      createClassifierRepository({
        isModelInstalled: async () => false,
        createOnnxClassifier: async () => onnxClassifier,
        onStatus: () => {},
      }),
    ).rejects.toThrow(MODEL_NOT_INSTALLED_MESSAGE)
  })

  it('throws and reports error status when Onnx setup fails', async () => {
    const status: ModelStatusMessage[] = []

    await expect(
      createClassifierRepository({
        isModelInstalled: async () => true,
        createOnnxClassifier: async () => {
          throw new Error('webgpu unavailable')
        },
        onStatus: (s) => status.push(s),
      }),
    ).rejects.toThrow(/webgpu/i)

    const statuses = status.map((s) => s.status)
    expect(statuses).toEqual(['loading', 'error'])
    expect(status.find((s) => s.status === 'error')?.error).toMatch(/webgpu/i)
  })

  it('preserves the underlying failure message for the user', async () => {
    await expect(
      createClassifierRepository({
        isModelInstalled: async () => true,
        createOnnxClassifier: async () => {
          throw new Error('No WebGPU adapter found.')
        },
        onStatus: () => {},
      }),
    ).rejects.toThrow(/No WebGPU adapter found/)
  })
})
