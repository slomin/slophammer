import { describe, expect, it } from 'vitest'
import {
  ADVANCED_DRAWER_LABELS,
  computeBinary,
  verdictDescriptor,
} from '@/content/verdict'

describe('computeBinary', () => {
  it('splits the "lightly AI" bucket 50/50 between the human and AI sides', () => {
    const b = computeBinary([60, 20, 10, 10])
    expect(b.humanBinary).toBeCloseTo(70, 6)
    expect(b.aiBinary).toBeCloseTo(30, 6)
    expect(b.humanBinary + b.aiBinary).toBeCloseTo(100, 6)
  })

  it('selects the AI side as winner when aiBinary > humanBinary', () => {
    const b = computeBinary([5, 10, 15, 70])
    expect(b.humanBinary).toBeCloseTo(10, 6)
    expect(b.aiBinary).toBeCloseTo(90, 6)
    expect(b.winner).toBe('ai')
    expect(b.winPct).toBeCloseTo(90, 6)
  })

  it('selects the human side as winner when humanBinary >= aiBinary', () => {
    const b = computeBinary([92, 5, 2, 1])
    expect(b.humanBinary).toBeCloseTo(94.5, 6)
    expect(b.aiBinary).toBeCloseTo(5.5, 6)
    expect(b.winner).toBe('human')
    expect(b.winPct).toBeCloseTo(94.5, 6)
  })

  it('treats a 50/50 tie as a human-side win', () => {
    const b = computeBinary([50, 0, 0, 50])
    expect(b.winner).toBe('human')
  })
})

describe('verdictDescriptor — confidence thresholds', () => {
  it('HIGH confidence at exactly 85', () => {
    const d = verdictDescriptor(85, 'human')
    expect(d.confidence).toBe('HIGH')
    expect(d.confidenceText).toBe('HIGH CONFIDENCE')
    expect(d.label).toBe('HUMAN')
    expect(d.sentence).toBe('Likely human-written')
  })

  it('MED confidence at 84.99', () => {
    const d = verdictDescriptor(84.99, 'ai')
    expect(d.confidence).toBe('MED')
    expect(d.confidenceText).toBe('MED CONFIDENCE')
    expect(d.label).toBe('AI-LEANING')
    expect(d.sentence).toBe('Probably AI-assisted')
  })

  it('MED confidence at exactly 65', () => {
    const d = verdictDescriptor(65, 'human')
    expect(d.confidence).toBe('MED')
    expect(d.label).toBe('HUMAN-LEANING')
    expect(d.sentence).toBe('Probably human-written')
  })

  it('LOW confidence at 64.99', () => {
    const d = verdictDescriptor(64.99, 'ai')
    expect(d.confidence).toBe('LOW')
    expect(d.confidenceText).toBe('LOW CONFIDENCE')
    expect(d.label).toBe('AI-LEANING')
    expect(d.sentence).toBe('Ambiguous — model is unsure')
  })

  it('high-confidence AI uses the AI vocabulary', () => {
    const d = verdictDescriptor(97, 'ai')
    expect(d.label).toBe('AI')
    expect(d.sentence).toBe('Likely AI-generated')
    expect(d.side).toBe('ai')
  })

  it('reports the side field matching the winner argument', () => {
    expect(verdictDescriptor(70, 'human').side).toBe('human')
    expect(verdictDescriptor(70, 'ai').side).toBe('ai')
  })
})

describe('ADVANCED_DRAWER_LABELS', () => {
  it('renames code buckets to the v1 design vocabulary', () => {
    expect(ADVANCED_DRAWER_LABELS).toEqual(['Human', 'Light AI', 'Heavy AI', 'Full AI'])
  })
})
