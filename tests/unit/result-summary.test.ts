import { describe, expect, it } from 'vitest'
import { formatResultSummary } from '@/content/result-summary'
import type { ClassifyResult } from '@/llm/classify-result'

const result: ClassifyResult = {
  probs: [0.1, 0.2, 0.3, 0.4],
  rawPct: [10, 20, 30, 40],
  bucketLabels: ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'],
  extLlr: 1.94591,
  threshold: 3.8088,
  verdict: 'near-threshold',
  tokenCount: 600,
  analysedTokens: 512,
  truncated: true,
}

describe('formatResultSummary', () => {
  it('exports only the detector heading and raw distribution', () => {
    const summary = formatResultSummary(result)
    expect(summary).toBe([
      'SlopHammer: AI Content Detector',
      'Distribution: Human 10% · Lightly AI 20% · Moderately AI 30% · Fully AI 40%',
    ].join('\n'))
  })

  it('preserves fractional bucket percentages without appending verdict metadata', () => {
    const summary = formatResultSummary({
      ...result,
      probs: [0.014, 0.0196, 0.032, 0.9344],
      rawPct: [1.4, 1.96, 3.2, 93.44],
      extLlr: 4.2054,
      verdict: 'flagged',
    })
    expect(summary).toBe([
      'SlopHammer: AI Content Detector',
      'Distribution: Human 1.4% · Lightly AI 2.0% · Moderately AI 3.2% · Fully AI 93.4%',
    ].join('\n'))
    expect(summary).not.toMatch(/AI SIGNAL|Model estimate|Decision score|Threshold/)
  })
})
