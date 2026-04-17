// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { buildCard } from '@/content/card-dom'
import { renderState } from '@/content/card-state'
import type { CardState } from '@/content/state'
import type { ClassifyResult } from '@/llm/classify-result'

const aiResult: ClassifyResult = {
  probs: [0.05, 0.1, 0.15, 0.7],
  rawPct: [5, 10, 15, 70],
  aiScore: 0.95,
  humanPct: 0,
  mixedPct: 0,
  aiPct: 100,
  verdict: 'ai',
  primaryPct: 100,
  primaryLabel: 'AI-Generated',
  headline: 'AI-Generated',
  tokenCount: 40,
  truncated: false,
}

function testId(root: ShadowRoot, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-testid="${id}"]`)
}

describe('buildCard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('creates a host element with a shadow root', () => {
    const card = buildCard()
    expect(card.host).toBeInstanceOf(HTMLElement)
    expect(card.shadow).toBeTruthy()
    expect(card.host.tagName.toLowerCase()).toBe('slop-hammer-card')
  })

  it('starts with the root data-state = "idle"', () => {
    const card = buildCard()
    const root = testId(card.shadow, 'card-root')
    expect(root?.dataset.state).toBe('idle')
  })
})

describe('renderState — loading', () => {
  it('shows preview and word count', () => {
    const card = buildCard()
    const state: CardState = {
      kind: 'loading',
      requestId: 'r1',
      preview: 'lorem ipsum dolor',
      wordCount: 3,
    }
    renderState(card, state)

    const root = testId(card.shadow, 'card-root')
    expect(root?.dataset.state).toBe('loading')
    expect(testId(card.shadow, 'preview')?.textContent).toContain('lorem ipsum dolor')
    expect(testId(card.shadow, 'word-count')?.textContent).toContain('3')
    expect(testId(card.shadow, 'spinner')).not.toBeNull()
  })
})

describe('renderState — ready', () => {
  it('shows primary label and percent', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'ready',
      requestId: 'r1',
      preview: 'abc',
      wordCount: 1,
      result: aiResult,
    })

    const root = testId(card.shadow, 'card-root')
    expect(root?.dataset.state).toBe('ready')
    expect(testId(card.shadow, 'primary-label')?.textContent).toBe('AI-Generated')
    expect(testId(card.shadow, 'primary-pct')?.textContent).toBe('100')
  })

  it('exposes per-class percents via data attributes', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'ready',
      requestId: 'r1',
      preview: 'abc',
      wordCount: 1,
      result: aiResult,
    })
    expect(testId(card.shadow, 'bar-human')?.dataset.pct).toBe('0')
    expect(testId(card.shadow, 'bar-mixed')?.dataset.pct).toBe('0')
    expect(testId(card.shadow, 'bar-ai')?.dataset.pct).toBe('100')
  })

  it('renders the full 4-class raw breakdown', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'ready',
      requestId: 'r1',
      preview: 'abc',
      wordCount: 1,
      result: aiResult,
    })
    const rawValue = (id: string) =>
      testId(card.shadow, id)?.querySelector<HTMLElement>('.raw-value')?.textContent
    expect(rawValue('raw-human')).toBe('5%')
    expect(rawValue('raw-lightly')).toBe('10%')
    expect(rawValue('raw-moderately')).toBe('15%')
    expect(rawValue('raw-heavily')).toBe('70%')
  })

  it('clears the raw breakdown in loading / error / idle states', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'ready', requestId: 'r1', preview: 'x', wordCount: 1, result: aiResult,
    })
    renderState(card, { kind: 'loading', requestId: 'r2', preview: 'x', wordCount: 1 })
    const rawValue = (id: string) =>
      testId(card.shadow, id)?.querySelector<HTMLElement>('.raw-value')?.textContent
    expect(rawValue('raw-human')).toBe('—')
    expect(rawValue('raw-heavily')).toBe('—')
  })
})

describe('renderState — error', () => {
  it('shows the error message', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'error',
      requestId: 'r1',
      preview: 'x',
      wordCount: 1,
      error: 'model blew up',
    })
    const root = testId(card.shadow, 'card-root')
    expect(root?.dataset.state).toBe('error')
    expect(testId(card.shadow, 'error-message')?.textContent).toContain('model blew up')
    expect(testId(card.shadow, 'dismiss-button')).not.toBeNull()
  })
})

describe('renderState — idle', () => {
  it('clears visible content and flags dataset', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'loading',
      requestId: 'r1',
      preview: 'x',
      wordCount: 1,
    })
    renderState(card, { kind: 'idle' })
    const root = testId(card.shadow, 'card-root')
    expect(root?.dataset.state).toBe('idle')
  })
})
