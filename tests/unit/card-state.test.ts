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

const humanResult: ClassifyResult = {
  ...aiResult,
  probs: [0.92, 0.05, 0.02, 0.01],
  rawPct: [92, 5, 2, 1],
  aiScore: 0.05,
  humanPct: 100,
  mixedPct: 0,
  aiPct: 0,
  verdict: 'human',
  primaryLabel: 'Human Written',
  headline: 'Human Written',
}

function testId(root: ShadowRoot, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-testid="${id}"]`)
}

function isHidden(el: HTMLElement | null): boolean {
  if (!el) return true
  return el.classList.contains('hide')
}

describe('buildCard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('creates a hardened host element with a shadow root', () => {
    const card = buildCard()
    expect(card.host).toBeInstanceOf(HTMLElement)
    expect(card.shadow).toBeTruthy()
    expect(card.host.tagName.toLowerCase()).toBe('div')
    expect(card.host.getAttribute('data-slop-hammer-card')).toBe('')
    expect(card.host.style.getPropertyValue('all')).toBe('initial')
    expect(card.host.style.getPropertyPriority('all')).toBe('important')
    expect(card.host.style.getPropertyValue('visibility')).toBe('visible')
    expect(card.host.style.getPropertyPriority('visibility')).toBe('important')
    expect(card.host.style.getPropertyValue('display')).toBe('block')
    expect(card.host.style.getPropertyPriority('display')).toBe('important')
  })

  it('starts with the root data-state = "idle" and data-view = "full"', () => {
    const card = buildCard()
    const root = testId(card.shadow, 'card-root')
    expect(root?.dataset.state).toBe('idle')
    expect(root?.dataset.view).toBe('full')
    expect(root?.dataset.mode).toBe('basic')
  })

  it('renders head with brand, version, minimise and close controls', () => {
    const card = buildCard()
    expect(testId(card.shadow, 'head-brand')?.textContent).toContain('Slop Hammer')
    expect(testId(card.shadow, 'head-version')).not.toBeNull()
    expect(testId(card.shadow, 'btn-minimise')).not.toBeNull()
    expect(testId(card.shadow, 'btn-close')).not.toBeNull()
  })

  it('exposes the head element as a drag handle', () => {
    const card = buildCard()
    expect(card.refs.head).toBeInstanceOf(HTMLElement)
    expect(card.refs.head.classList.contains('sh-head')).toBe(true)
  })

  it('renders all structural sections up front', () => {
    const card = buildCard()
    for (const id of [
      'preview',
      'word-count',
      'loading-row',
      'spinner',
      'loading-label',
      'verdict-box',
      'verdict-label',
      'verdict-confidence',
      'verdict-big',
      'verdict-text',
      'binary-bar-human',
      'binary-bar-ai',
      'binary-legend-human',
      'binary-legend-ai',
      'mode-row',
      'mode-toggle',
      'advanced',
      'raw-0',
      'raw-1',
      'raw-2',
      'raw-3',
      'error-box',
      'error-title',
      'error-message',
      'actions-row',
      'btn-copy',
      'btn-share',
      'dismiss-button',
    ]) {
      expect(testId(card.shadow, id), `missing ${id}`).not.toBeNull()
    }
  })
})

describe('renderState — loading', () => {
  it('shows preview, word count, spinner and "analysing" label', () => {
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
    expect(testId(card.shadow, 'word-count')?.textContent).toBe('3 words')
    expect(isHidden(testId(card.shadow, 'loading-row'))).toBe(false)
    expect(testId(card.shadow, 'loading-label')?.textContent).toBe('analysing')
  })

  it('hides verdict, mode, advanced, actions and error sections', () => {
    const card = buildCard()
    renderState(card, { kind: 'loading', requestId: 'r1', preview: 'x', wordCount: 1 })
    expect(isHidden(testId(card.shadow, 'verdict-box'))).toBe(true)
    expect(isHidden(testId(card.shadow, 'mode-row'))).toBe(true)
    expect(isHidden(testId(card.shadow, 'advanced'))).toBe(true)
    expect(isHidden(testId(card.shadow, 'actions-row'))).toBe(true)
    expect(isHidden(testId(card.shadow, 'error-box'))).toBe(true)
  })
})

describe('renderState — ready (AI verdict)', () => {
  it('fills hero with binary-collapsed winPct and AI vocabulary', () => {
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
    // rawPct=[5,10,15,70] → aiBinary = 15+70+5 = 90, humanBinary = 5+5 = 10
    expect(testId(card.shadow, 'verdict-box')?.dataset.verdict).toBe('ai')
    expect(testId(card.shadow, 'verdict-label')?.textContent).toBe('AI')
    expect(testId(card.shadow, 'verdict-confidence')?.textContent).toBe('HIGH CONFIDENCE')
    expect(testId(card.shadow, 'verdict-big')?.textContent).toBe('90')
    expect(testId(card.shadow, 'verdict-text')?.textContent).toBe('Likely AI-generated')
  })

  it('sizes the binary bar and legend to the human/ai split', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'ready', requestId: 'r1', preview: 'abc', wordCount: 1, result: aiResult,
    })
    expect(testId(card.shadow, 'binary-bar-human')?.dataset.pct).toBe('10')
    expect(testId(card.shadow, 'binary-bar-ai')?.dataset.pct).toBe('90')
    expect(testId(card.shadow, 'binary-legend-human')?.textContent).toContain('10%')
    expect(testId(card.shadow, 'binary-legend-ai')?.textContent).toContain('90%')
  })

  it('renders the 4-bucket advanced drawer with design labels and winner flag', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'ready', requestId: 'r1', preview: 'abc', wordCount: 1, result: aiResult,
    })
    const rows = [
      { id: 'raw-0', label: 'Human', pct: '5' },
      { id: 'raw-1', label: 'Light AI', pct: '10' },
      { id: 'raw-2', label: 'Heavy AI', pct: '15' },
      { id: 'raw-3', label: 'Full AI', pct: '70' },
    ] as const
    for (const r of rows) {
      const row = testId(card.shadow, r.id)
      expect(row, `${r.id} missing`).not.toBeNull()
      expect(row!.querySelector<HTMLElement>('.name')?.textContent).toBe(r.label)
      expect(row!.querySelector<HTMLElement>('.fill')?.dataset.pct).toBe(r.pct)
      expect(row!.querySelector<HTMLElement>('.val')?.textContent).toBe(r.pct + '%')
    }
    // argmax bucket is index 3
    expect(testId(card.shadow, 'raw-3')?.dataset.winner).toBe('true')
    expect(testId(card.shadow, 'raw-0')?.dataset.winner).toBeUndefined()
  })

  it('shows mode row and actions row (copy/share), hides loading and error', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'ready', requestId: 'r1', preview: 'abc', wordCount: 1, result: aiResult,
    })
    expect(isHidden(testId(card.shadow, 'mode-row'))).toBe(false)
    expect(isHidden(testId(card.shadow, 'actions-row'))).toBe(false)
    expect(isHidden(testId(card.shadow, 'btn-copy'))).toBe(false)
    expect(isHidden(testId(card.shadow, 'btn-share'))).toBe(false)
    expect(isHidden(testId(card.shadow, 'dismiss-button'))).toBe(true)
    expect(isHidden(testId(card.shadow, 'loading-row'))).toBe(true)
    expect(isHidden(testId(card.shadow, 'error-box'))).toBe(true)
  })
})

describe('renderState — ready (human verdict)', () => {
  it('uses the human vocabulary and marks human bucket as winner', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'ready', requestId: 'r1', preview: 'x', wordCount: 1, result: humanResult,
    })
    // rawPct=[92,5,2,1] → humanBinary=92+2.5=94.5, aiBinary=2+1+2.5=5.5
    expect(testId(card.shadow, 'verdict-box')?.dataset.verdict).toBe('human')
    expect(testId(card.shadow, 'verdict-label')?.textContent).toBe('HUMAN')
    expect(testId(card.shadow, 'verdict-text')?.textContent).toBe('Likely human-written')
    expect(testId(card.shadow, 'raw-0')?.dataset.winner).toBe('true')
  })
})

describe('renderState — error', () => {
  it('shows the error box with designer copy and a dismiss button', () => {
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
    expect(isHidden(testId(card.shadow, 'error-box'))).toBe(false)
    expect(testId(card.shadow, 'error-title')?.textContent).toBe("can't judge yet")
    expect(testId(card.shadow, 'error-message')?.textContent).toContain('model blew up')
    expect(isHidden(testId(card.shadow, 'dismiss-button'))).toBe(false)
    expect(isHidden(testId(card.shadow, 'btn-copy'))).toBe(true)
    expect(isHidden(testId(card.shadow, 'btn-share'))).toBe(true)
    expect(testId(card.shadow, 'actions-row')?.classList.contains('single')).toBe(true)
  })

  it('hides the verdict hero, mode row and advanced drawer', () => {
    const card = buildCard()
    renderState(card, {
      kind: 'error', requestId: 'r1', preview: 'x', wordCount: 1, error: 'oops',
    })
    expect(isHidden(testId(card.shadow, 'verdict-box'))).toBe(true)
    expect(isHidden(testId(card.shadow, 'mode-row'))).toBe(true)
    expect(isHidden(testId(card.shadow, 'advanced'))).toBe(true)
    expect(isHidden(testId(card.shadow, 'loading-row'))).toBe(true)
  })
})

describe('renderState — idle', () => {
  it('flips data-state to idle', () => {
    const card = buildCard()
    renderState(card, { kind: 'loading', requestId: 'r1', preview: 'x', wordCount: 1 })
    renderState(card, { kind: 'idle' })
    const root = testId(card.shadow, 'card-root')
    expect(root?.dataset.state).toBe('idle')
  })
})

describe('threshold + sum invariants', () => {
  it('HIGH CONFIDENCE when the displayed hero percent rounds to 85', () => {
    // rawPct summing to 100 with aiBinary = 84.5:
    //   ai-side = moderately + heavily + 0.5*lightly = 44 + 40 + 0.5 = 84.5
    //   human-side = human + 0.5*lightly = 15 + 0.5 = 15.5
    const boundary: ClassifyResult = { ...aiResult, rawPct: [15, 1, 44, 40] }
    const card = buildCard()
    renderState(card, {
      kind: 'ready', requestId: 'r', preview: 'x', wordCount: 1, result: boundary,
    })
    expect(testId(card.shadow, 'verdict-big')?.textContent).toBe('85')
    expect(testId(card.shadow, 'verdict-confidence')?.textContent).toBe('HIGH CONFIDENCE')
    expect(testId(card.shadow, 'verdict-label')?.textContent).toBe('AI')
  })

  it('binary legend and bars always sum to 100', () => {
    // humanResult rawPct=[92,5,2,1] → humanBinary=94.5, aiBinary=5.5
    const card = buildCard()
    renderState(card, {
      kind: 'ready', requestId: 'r', preview: 'x', wordCount: 1, result: humanResult,
    })
    const human = Number(testId(card.shadow, 'binary-bar-human')!.dataset.pct)
    const ai = Number(testId(card.shadow, 'binary-bar-ai')!.dataset.pct)
    expect(human + ai).toBe(100)
    expect(testId(card.shadow, 'binary-legend-human')?.textContent).toContain(`${human}%`)
    expect(testId(card.shadow, 'binary-legend-ai')?.textContent).toContain(`${ai}%`)
    // winner's legend pct matches the hero big number
    expect(testId(card.shadow, 'verdict-big')?.textContent).toBe(String(human))
  })
})

describe('view flag (minimised)', () => {
  it('preserves an externally-set data-view across re-renders', () => {
    const card = buildCard()
    const root = testId(card.shadow, 'card-root')!
    renderState(card, {
      kind: 'ready', requestId: 'r1', preview: 'x', wordCount: 1, result: aiResult,
    })
    root.dataset.view = 'minimised'
    renderState(card, {
      kind: 'error', requestId: 'r1', preview: 'x', wordCount: 1, error: 'oops',
    })
    expect(root.dataset.view).toBe('minimised')
  })
})
