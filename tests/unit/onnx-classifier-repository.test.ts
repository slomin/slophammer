import { describe, expect, it, vi } from 'vitest'
import { OnnxClassifierRepository } from '@/llm/onnx-classifier-repository'
import type {
  InferenceSessionLike,
  TensorLike,
  TokenizerLike,
} from '@/llm/onnx-deps'
import type { SlopHammerContract } from '@/llm/contract'

const contract: SlopHammerContract = {
  n_buckets: 4,
  max_seq_length: 8,
  lo_threshold: 0.1,
  hi_threshold: 0.9,
  pad_token_id: 0,
  padding_side: 'left',
  output_name: 'logits',
}

function makeTokenizer(ids: number[]): TokenizerLike {
  const fn = vi.fn((_text: string) => ({
    input_ids: { data: BigInt64Array.from(ids.map(BigInt)) },
  })) as unknown as TokenizerLike
  ;(fn as unknown as { pad_token_id: number }).pad_token_id = 0
  return fn
}

function makeSession(output: ArrayBufferView): InferenceSessionLike {
  const outputTensor: TensorLike = { data: output, type: 'float32' }
  return {
    run: vi.fn(async () => ({ logits: outputTensor })),
  }
}

const createTensor = (_kind: 'int64', data: BigInt64Array, dims: [number, number]) => ({
  data,
  dims,
})

// Resolved up front by resolveRuntimeContract in production; supplied directly
// here so these tests stay focused on inference rather than resolution.
const runtime = { padId: 0n, padSide: 'left' as const, outputName: 'logits' }

describe('OnnxClassifierRepository.classify', () => {
  it('produces a ClassifyResult from float32 logits', async () => {
    const repo = new OnnxClassifierRepository({
      tokenizer: makeTokenizer([11, 12, 13]),
      session: makeSession(new Float32Array([0.5, -1, -1, -1])),
      contract,
      createTensor,
      runtime,
    })
    const result = await repo.classify('hello')
    const sum = result.probs.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1)
    expect(result.probs[0]).toBeGreaterThan(result.probs[3]!)
    expect(result.verdict).toBe('human')
    expect(result.tokenCount).toBe(3)
    expect(result.truncated).toBe(false)
  })

  it('maps largest logit on class 3 to verdict="ai"', async () => {
    const repo = new OnnxClassifierRepository({
      tokenizer: makeTokenizer([1, 2]),
      session: makeSession(new Float32Array([-1, -1, -1, 0.5])),
      contract,
      createTensor,
      runtime,
    })
    const result = await repo.classify('some long ai text')
    expect(result.verdict).toBe('ai')
  })

  it('marks truncated when tokens exceed max_seq_length', async () => {
    const repo = new OnnxClassifierRepository({
      tokenizer: makeTokenizer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), // 10 > maxSeq=8
      session: makeSession(new Float32Array([0, 0, 0, 0])),
      contract,
      createTensor,
      runtime,
    })
    const result = await repo.classify('long')
    expect(result.truncated).toBe(true)
    expect(result.tokenCount).toBe(10)
  })

  it('reads output via getData (WebGPU path) when .data is absent', async () => {
    const outputTensor: TensorLike = {
      getData: vi.fn(async () => new Uint16Array([0x3c00, 0x0000, 0x0000, 0x0000])), // ~[1, 0, 0, 0] fp16
      type: 'float16',
      dispose: vi.fn(),
    }
    const session: InferenceSessionLike = { run: vi.fn(async () => ({ logits: outputTensor })) }
    const repo = new OnnxClassifierRepository({
      tokenizer: makeTokenizer([1]),
      session,
      contract,
      createTensor,
      runtime,
    })
    const result = await repo.classify('x')
    expect(outputTensor.getData).toHaveBeenCalledOnce()
    expect(outputTensor.dispose).toHaveBeenCalledOnce()
    expect(result.verdict).toBe('human')
  })

  it('throws a descriptive error when the named output is missing', async () => {
    const session: InferenceSessionLike = {
      run: vi.fn(async () => ({ not_logits: { data: new Float32Array([0, 0, 0, 0]) } })),
    }
    const repo = new OnnxClassifierRepository({
      tokenizer: makeTokenizer([1]),
      session,
      contract,
      createTensor,
      runtime,
    })
    await expect(repo.classify('x')).rejects.toThrow(/logits/i)
  })

  it('reads the output named by the resolved runtime contract', async () => {
    const outputTensor: TensorLike = { data: new Float32Array([0, 0, 0, 0.5]), type: 'float32' }
    const session: InferenceSessionLike = { run: vi.fn(async () => ({ my_out: outputTensor })) }
    const repo = new OnnxClassifierRepository({
      tokenizer: makeTokenizer([1]),
      session,
      contract,
      createTensor,
      runtime: { ...runtime, outputName: 'my_out' },
    })
    const r = await repo.classify('x')
    expect(r.verdict).toBe('ai')
  })

  it('passes correctly padded inputs to session.run', async () => {
    const capturedFeeds: Record<string, { data: BigInt64Array }>[] = []
    const session: InferenceSessionLike = {
      run: async (feeds) => {
        capturedFeeds.push(feeds as Record<string, { data: BigInt64Array }>)
        return { logits: { data: new Float32Array([0, 0, 0, 0]) } }
      },
    }
    const repo = new OnnxClassifierRepository({
      tokenizer: makeTokenizer([11, 12, 13]),
      session,
      contract, // maxSeq=8
      createTensor,
      runtime, // padSide=left, padId=0
    })
    await repo.classify('x')
    expect(capturedFeeds).toHaveLength(1)
    const feeds = capturedFeeds[0]!
    const ids = Array.from(feeds.input_ids!.data, (b) => Number(b))
    expect(ids).toEqual([0, 0, 0, 0, 0, 11, 12, 13])
    const mask = Array.from(feeds.attention_mask!.data, (b) => Number(b))
    expect(mask).toEqual([0, 0, 0, 0, 0, 1, 1, 1])
  })
})

describe('OnnxClassifierRepository.dispose', () => {
  it('releases the underlying session', async () => {
    const release = vi.fn(async () => {})
    const repo = new OnnxClassifierRepository({
      tokenizer: makeTokenizer([1]),
      session: { run: vi.fn(async () => ({ logits: { data: new Float32Array([0, 0, 0, 0]) } })), release },
      contract,
      createTensor,
      runtime,
    })
    await repo.dispose()
    expect(release).toHaveBeenCalledOnce()
  })

  it('is a no-op when the session cannot be released', async () => {
    const repo = new OnnxClassifierRepository({
      tokenizer: makeTokenizer([1]),
      session: makeSession(new Float32Array([0, 0, 0, 0])),
      contract,
      createTensor,
      runtime,
    })
    await expect(repo.dispose()).resolves.toBeUndefined()
  })
})
