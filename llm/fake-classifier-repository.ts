import type { ClassifierRepository } from './classifier-repository'
import {
  argmax4,
  bucketFromArgmax,
  softmax,
  VERDICT_HEADLINE,
  VERDICT_PRIMARY_LABEL,
  type ClassifyResult,
  type RawProbs,
} from './classify-result'

const HASH_SEED = 2166136261 >>> 0
const FNV_PRIME = 16777619

function hash32(text: string): number {
  let h = HASH_SEED
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, FNV_PRIME) >>> 0
  }
  return h
}

function logitsFromText(text: string): [number, number, number, number] {
  const base = hash32(text)
  return [0, 1, 2, 3].map((i) => {
    const slice = (base >>> (i * 4)) & 0xff
    return (slice / 255) * 5 - 2.5
  }) as [number, number, number, number]
}

function toRawProbs(logits: [number, number, number, number]): RawProbs {
  const [a, b, c, d] = softmax(logits)
  return [a!, b!, c!, d!]
}

function tokenEstimate(text: string): number {
  if (text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

export class FakeClassifierRepository implements ClassifierRepository {
  async classify(text: string): Promise<ClassifyResult> {
    const probs = toRawProbs(logitsFromText(text))
    const rawPct: [number, number, number, number] = [
      probs[0] * 100,
      probs[1] * 100,
      probs[2] * 100,
      probs[3] * 100,
    ]
    const verdict = bucketFromArgmax(argmax4(probs))
    return {
      probs,
      rawPct,
      aiScore: 1 - probs[0],

      humanPct: verdict === 'human' ? 100 : 0,
      mixedPct: verdict === 'mixed' ? 100 : 0,
      aiPct: verdict === 'ai' ? 100 : 0,

      verdict,
      primaryPct: 100,
      primaryLabel: VERDICT_PRIMARY_LABEL[verdict],
      headline: VERDICT_HEADLINE[verdict],

      tokenCount: tokenEstimate(text),
      truncated: false,
    }
  }
}
