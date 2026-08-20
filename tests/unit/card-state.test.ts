import { describe, expect, it } from 'vitest'
import { buildCard } from '@/content/card-dom'
import { renderState } from '@/content/card-state'
import type { ClassifyResult } from '@/llm/classify-result'

const result: ClassifyResult = {
  probs: [0.1, 0.2, 0.3, 0.4],
  rawPct: [10, 20, 30, 40],
  bucketLabels: ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'],
  extLlr: 3.1,
  threshold: 3.8088,
  verdict: 'near-threshold',
  tokenCount: 600,
  analysedTokens: 512,
  truncated: true,
}

describe('renderState', () => {
  it('uses canonical SlopHammer branding and accessibility name', () => {
    const card = buildCard()
    expect(card.refs.headBrand.textContent).toContain('SlopHammer')
    expect(card.refs.root.getAttribute('aria-label')).toBe('SlopHammer result')
  })

  it('renders the original result presentation with Advanced analysis time', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'ready', requestId: 'r1', preview: 'text', wordCount: 40, result, durationMs: 340,
    })
    expect(card.refs.verdictLabel.textContent).toBe('AI-LEANING')
    expect(card.refs.verdictConfidence.textContent).toBe('MED CONFIDENCE')
    expect(card.refs.verdictBig.textContent).toBe('80')
    expect(card.refs.verdictText.textContent).toBe('Probably AI-assisted')
    expect(card.refs.binaryLegendHuman.textContent).toBe('HUMAN 20%')
    expect(card.refs.binaryLegendAi.textContent).toBe('80% AI')
    expect(card.refs.binaryBarHuman.dataset.pct).toBe('20')
    expect(card.refs.binaryBarAi.dataset.pct).toBe('80')
    expect(card.refs.advancedRows.map((row) => row.name.textContent)).toEqual(result.bucketLabels)
    expect(card.refs.advancedRows.map((row) => row.pct.textContent)).toEqual(['10%', '20%', '30%', '40%'])
    expect(card.refs.analysisTime.textContent).toBe('Analysis time 0.34s')
    expect(card.refs.advanced.textContent).toContain('distribution')
    expect(card.refs.advanced.textContent).toContain('Analysis time 0.34s')
    expect(card.shadow.textContent).not.toMatch(/Model estimate|not proof|AI SIGNAL|NEAR THRESHOLD|Decision score|Threshold/)
  })

  it('keeps verdict content hidden outside successful results and in the minimised view', () => {
    const card = buildCard()
    renderState(card, { kind: 'loading', requestId: 'r1', preview: 'x', wordCount: 40, startedAtMs: 0 })
    expect(card.refs.verdictBox.classList.contains('hide')).toBe(true)
    renderState(card, { kind: 'error', requestId: 'r1', preview: 'x', wordCount: 40, error: 'failed' })
    expect(card.refs.verdictBox.classList.contains('hide')).toBe(true)
    expect(card.shadow.querySelector('style')?.textContent).toContain('.sh-card[data-view="minimised"] .sh-verdict')
  })
})
