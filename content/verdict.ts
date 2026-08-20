import type { RawProbs } from '@/llm/classify-result'

export type BinarySide = 'human' | 'ai'
export type Confidence = 'HIGH' | 'MED' | 'LOW'

export interface BinaryCollapse {
  humanBinary: number
  aiBinary: number
  winner: BinarySide
  winPct: number
}

export interface VerdictDescriptor {
  side: BinarySide
  label: 'HUMAN' | 'AI' | 'HUMAN-LEANING' | 'AI-LEANING'
  sentence: string
  confidence: Confidence
  confidenceText: 'HIGH CONFIDENCE' | 'MED CONFIDENCE' | 'LOW CONFIDENCE'
}

export const ADVANCED_DRAWER_LABELS = [
  'Human',
  'Lightly AI',
  'Moderately AI',
  'Fully AI',
] as const

export function computeBinary(rawPct: RawProbs): BinaryCollapse {
  const [human, lightly, moderately, fully] = rawPct
  const humanBinary = human + lightly * 0.5
  const aiBinary = moderately + fully + lightly * 0.5
  const winner: BinarySide = aiBinary > humanBinary ? 'ai' : 'human'
  const winPct = Math.max(humanBinary, aiBinary)
  return { humanBinary, aiBinary, winner, winPct }
}

export const HIGH_CONFIDENCE_PCT = 85
export const MED_CONFIDENCE_PCT = 65

export function verdictDescriptor(winPct: number, side: BinarySide): VerdictDescriptor {
  if (winPct >= HIGH_CONFIDENCE_PCT) {
    return {
      side,
      label: side === 'human' ? 'HUMAN' : 'AI',
      sentence: side === 'human' ? 'Likely human-written' : 'Likely AI-generated',
      confidence: 'HIGH',
      confidenceText: 'HIGH CONFIDENCE',
    }
  }
  if (winPct >= MED_CONFIDENCE_PCT) {
    return {
      side,
      label: side === 'human' ? 'HUMAN-LEANING' : 'AI-LEANING',
      sentence: side === 'human' ? 'Probably human-written' : 'Probably AI-assisted',
      confidence: 'MED',
      confidenceText: 'MED CONFIDENCE',
    }
  }
  return {
    side,
    label: side === 'human' ? 'HUMAN-LEANING' : 'AI-LEANING',
    sentence: 'Ambiguous — model is unsure',
    confidence: 'LOW',
    confidenceText: 'LOW CONFIDENCE',
  }
}
