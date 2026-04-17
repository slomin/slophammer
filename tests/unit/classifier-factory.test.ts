import { describe, expect, it, vi } from 'vitest'
import { createClassifierRepository } from '@/llm/classifier-factory'
import { FakeClassifierRepository } from '@/llm/fake-classifier-repository'
import type { ClassifierRepository } from '@/llm/classifier-repository'
import type { ModelStatusMessage } from '@/messaging/protocol'

const onnxClassifier: ClassifierRepository = {
  classify: vi.fn(async () => ({
    probs: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
    rawPct: [10, 20, 30, 40] as [number, number, number, number],
    aiScore: 0.9,
    humanPct: 0,
    mixedPct: 0,
    aiPct: 100,
    verdict: 'ai' as const,
    primaryPct: 100,
    primaryLabel: 'AI-Generated' as const,
    headline: 'AI-Generated',
    tokenCount: 4,
    truncated: false,
  })),
}

describe('createClassifierRepository', () => {
  it('returns the Onnx classifier when the model is installed', async () => {
    const status: ModelStatusMessage[] = []
    const repo = await createClassifierRepository({
      isModelInstalled: async () => true,
      createOnnxClassifier: async () => onnxClassifier,
      createFakeClassifier: () => new FakeClassifierRepository(),
      onStatus: (s) => status.push(s),
    })
    expect(repo).toBe(onnxClassifier)
    expect(status.map((s) => s.status)).toEqual(['loading', 'ready'])
  })

  it('falls back to Fake when the model is not installed', async () => {
    const status: ModelStatusMessage[] = []
    const onnxFactory = vi.fn(async () => onnxClassifier)
    const fakeFactory = vi.fn(() => new FakeClassifierRepository())

    const repo = await createClassifierRepository({
      isModelInstalled: async () => false,
      createOnnxClassifier: onnxFactory,
      createFakeClassifier: fakeFactory,
      onStatus: (s) => status.push(s),
    })

    expect(repo).toBeInstanceOf(FakeClassifierRepository)
    expect(onnxFactory).not.toHaveBeenCalled()
    expect(fakeFactory).toHaveBeenCalledOnce()
    expect(status.map((s) => s.status)).toEqual(['ready'])
  })

  it('falls back to Fake when Onnx setup throws, emitting error status', async () => {
    const status: ModelStatusMessage[] = []
    const fakeFactory = vi.fn(() => new FakeClassifierRepository())

    const repo = await createClassifierRepository({
      isModelInstalled: async () => true,
      createOnnxClassifier: async () => {
        throw new Error('webgpu unavailable')
      },
      createFakeClassifier: fakeFactory,
      onStatus: (s) => status.push(s),
    })

    expect(repo).toBeInstanceOf(FakeClassifierRepository)
    expect(fakeFactory).toHaveBeenCalledOnce()
    const statuses = status.map((s) => s.status)
    expect(statuses).toContain('loading')
    expect(statuses).toContain('error')
    const err = status.find((s) => s.status === 'error')
    expect(err?.error).toMatch(/webgpu/i)
  })
})
