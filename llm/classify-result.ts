export type Verdict = 'ai' | 'mixed' | 'human'

export type RawProbs = [number, number, number, number]

export interface ClassifyResult {
  probs: RawProbs
  rawPct: [number, number, number, number]
  aiScore: number

  verdict: Verdict

  /** Tokens in the whole selection. */
  tokenCount: number
  /** Tokens the model actually saw — max_seq_length when truncated. */
  analysedTokens: number
  truncated: boolean
}

export const RAW_CLASS_LABEL = ['Human', 'Lightly AI', 'Moderately AI', 'Heavily AI'] as const

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

export function bucketFromArgmax(argmax: 0 | 1 | 2 | 3): Verdict {
  if (argmax === 0) return 'human'
  if (argmax === 3) return 'ai'
  return 'mixed'
}

export function formatPct(value: number): string {
  if (value >= 99.95) return '100'
  if (value > 0 && value < 0.1) return '0.1'
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)
}
