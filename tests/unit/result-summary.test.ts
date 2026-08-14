import { describe, expect, it } from 'vitest'
import { formatResultSummary } from '@/content/result-summary'
import type { ClassifyResult } from '@/llm/classify-result'

const aiResult: ClassifyResult = {
  probs: [0.05, 0.1, 0.15, 0.7],
  rawPct: [5, 10, 15, 70],
  aiScore: 0.95,
  verdict: 'ai',
  tokenCount: 40,
  analysedTokens: 40,
  truncated: false,
}

describe('formatResultSummary', () => {
  it('leads with the verdict, percentage and confidence', () => {
    const lines = formatResultSummary(aiResult).split('\n')
    expect(lines[0]).toBe('Slop Hammer: AI 90% (HIGH CONFIDENCE)')
  })

  it('includes the plain-language sentence', () => {
    expect(formatResultSummary(aiResult)).toContain('Likely AI-generated')
  })

  it('includes the human/AI split', () => {
    expect(formatResultSummary(aiResult)).toContain('Human 10% · AI 90%')
  })

  it('includes the four-bucket distribution with its labels', () => {
    const summary = formatResultSummary(aiResult)
    expect(summary).toContain('Human 5%')
    expect(summary).toContain('Light AI 10%')
    expect(summary).toContain('Heavy AI 15%')
    expect(summary).toContain('Full AI 70%')
  })

  it('notes truncation when part of the selection was not analysed', () => {
    const summary = formatResultSummary({
      ...aiResult,
      truncated: true,
      tokenCount: 1141,
      analysedTokens: 512,
    })
    expect(summary).toContain('Analysed the last 512 of 1,141 tokens')
  })

  it('omits the truncation line when nothing was dropped', () => {
    expect(formatResultSummary(aiResult)).not.toMatch(/Analysed the last/)
  })

  it('describes a human-leaning result from the human side', () => {
    const human: ClassifyResult = {
      ...aiResult,
      probs: [0.92, 0.05, 0.02, 0.01],
      rawPct: [92, 5, 2, 1],
      aiScore: 0.08,
      verdict: 'human',
    }
    const summary = formatResultSummary(human)
    expect(summary.split('\n')[0]).toMatch(/^Slop Hammer: HUMAN 9\d% \(HIGH CONFIDENCE\)$/)
    expect(summary).toContain('Likely human-written')
  })

  it('rounds the split so the two halves add to 100', () => {
    const summary = formatResultSummary({
      ...aiResult,
      probs: [0.5, 0.0, 0.0, 0.5],
      rawPct: [50, 0, 0, 50],
    })
    const m = /Human (\d+)% · AI (\d+)%/.exec(summary)!
    expect(Number(m[1]) + Number(m[2])).toBe(100)
  })
})
