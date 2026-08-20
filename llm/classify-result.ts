export type CanonicalVerdict = 'flagged' | 'near-threshold' | 'not-flagged'

export type RawProbs = [number, number, number, number]

export interface ClassifyResult {
  probs: RawProbs
  rawPct: [number, number, number, number]
  bucketLabels: [string, string, string, string]
  extLlr: number
  threshold: number
  verdict: CanonicalVerdict

  /** Tokens in the whole selection. */
  tokenCount: number
  /** Tokens the model actually saw — max_seq_length when truncated. */
  analysedTokens: number
  truncated: boolean
}

export const RAW_CLASS_LABEL = ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'] as const

export function softmax(logits: readonly number[]): number[] {
  if (logits.length === 0) return []
  const max = Math.max(...logits)
  const exps = logits.map((l) => Math.exp(l - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}

export function argmax4(probs: RawProbs): 0 | 1 | 2 | 3 {
  let best: 0 | 1 | 2 | 3 = 0
  for (let i = 1 as 1 | 2 | 3; i < 4; i++) {
    if (probs[i]! > probs[best]!) best = i
  }
  return best
}

const LOG_FLOOR = Number.MIN_VALUE

export function computeExtLlr(probs: RawProbs): number {
  const aiLike = Math.max(LOG_FLOOR, probs[2] + probs[3])
  const humanBucket = Math.max(LOG_FLOOR, probs[0])
  return Math.log(aiLike) - Math.log(humanBucket)
}

export function decideVerdict(
  extLlr: number,
  tau: number,
  abstainBand: number,
): CanonicalVerdict {
  if (extLlr > tau) return 'flagged'
  if (extLlr > tau - abstainBand) return 'near-threshold'
  return 'not-flagged'
}

export function formatPct(value: number): string {
  if (value >= 99.95) return '100'
  if (value > 0 && value < 0.1) return '0.1'
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)
}
