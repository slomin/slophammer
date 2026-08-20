import { describe, expect, it } from 'vitest'
import { computeBinary, verdictDescriptor } from '@/content/verdict'

describe('verdictDescriptor', () => {
  it.each([
    [90, 'ai', 'AI', 'Likely AI-generated', 'HIGH CONFIDENCE'],
    [75, 'human', 'HUMAN-LEANING', 'Probably human-written', 'MED CONFIDENCE'],
    [55, 'ai', 'AI-LEANING', 'Ambiguous — model is unsure', 'LOW CONFIDENCE'],
  ] as const)('maps %s%% %s to the original result copy', (pct, side, label, sentence, confidenceText) => {
    expect(verdictDescriptor(pct, side)).toMatchObject({ label, sentence, confidenceText })
  })

  it('restores the original Human/AI bucket collapse', () => {
    const binary = computeBinary([1.4, 2, 3.2, 93.4])
    expect(binary.humanBinary).toBeCloseTo(2.4)
    expect(binary.aiBinary).toBeCloseTo(97.6)
    expect(binary.winner).toBe('ai')
    expect(binary.winPct).toBeCloseTo(97.6)
  })
})
