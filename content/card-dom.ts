import { CARD_STYLES } from './styles'

export const CARD_HOST_ATTR = 'data-slop-hammer-card'
export const CARD_HOST_SELECTOR = `[${CARD_HOST_ATTR}]`

export interface RawBreakdownRefs {
  human: HTMLElement
  lightly: HTMLElement
  moderately: HTMLElement
  heavily: HTMLElement
}

export interface CardRefs {
  root: HTMLElement
  preview: HTMLElement
  wordCount: HTMLElement
  spinner: HTMLElement
  primaryLabel: HTMLElement
  primaryPct: HTMLElement
  barHuman: HTMLElement
  barMixed: HTMLElement
  barAi: HTMLElement
  raw: RawBreakdownRefs
  errorMessage: HTMLElement
  dismissButton: HTMLButtonElement
}

export interface CardElements {
  host: HTMLElement
  shadow: ShadowRoot
  refs: CardRefs
}

function applyHostReset(host: HTMLElement): void {
  host.setAttribute(CARD_HOST_ATTR, '')
  host.style.setProperty('all', 'initial', 'important')
  host.style.setProperty('visibility', 'visible', 'important')
  host.style.setProperty('display', 'block', 'important')
}

function el<T extends HTMLElement>(tag: string, testId?: string, attrs?: Record<string, string>): T {
  const node = document.createElement(tag) as T
  if (testId) node.dataset.testid = testId
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

function rawRow(testId: string, label: string): { root: HTMLElement; value: HTMLElement } {
  const row = el<HTMLDivElement>('div', testId)
  row.className = 'raw-row'
  const name = document.createElement('span')
  name.className = 'raw-name'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'raw-value'
  value.textContent = '—'
  row.appendChild(name)
  row.appendChild(value)
  return { root: row, value }
}

export function buildCard(): CardElements {
  const host = document.createElement('div')
  applyHostReset(host)
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = CARD_STYLES
  shadow.appendChild(style)

  const root = el<HTMLDivElement>('div', 'card-root')
  root.dataset.state = 'idle'

  const preview = el<HTMLDivElement>('div', 'preview')
  root.appendChild(preview)

  const statusRow = document.createElement('div')
  statusRow.className = 'row'
  const spinner = el<HTMLSpanElement>('span', 'spinner')
  const wordCount = el<HTMLSpanElement>('span', 'word-count')
  statusRow.appendChild(spinner)
  statusRow.appendChild(wordCount)
  root.appendChild(statusRow)

  const scoreRow = document.createElement('div')
  scoreRow.className = 'row'
  const primaryPct = el<HTMLSpanElement>('span', 'primary-pct')
  const primaryLabel = el<HTMLSpanElement>('span', 'primary-label')
  scoreRow.appendChild(primaryPct)
  scoreRow.appendChild(primaryLabel)
  root.appendChild(scoreRow)

  const bars = document.createElement('div')
  bars.className = 'bars'
  const barHuman = el<HTMLDivElement>('div', 'bar-human')
  barHuman.textContent = 'Human'
  const barMixed = el<HTMLDivElement>('div', 'bar-mixed')
  barMixed.textContent = 'Mixed'
  const barAi = el<HTMLDivElement>('div', 'bar-ai')
  barAi.textContent = 'AI'
  bars.appendChild(barHuman)
  bars.appendChild(barMixed)
  bars.appendChild(barAi)
  root.appendChild(bars)

  // Raw 4-class breakdown (matches the model contract's n_buckets=4).
  const rawGrid = el<HTMLDivElement>('div', 'raw-grid')
  rawGrid.className = 'raw-grid'
  const human = rawRow('raw-human', 'Human')
  const lightly = rawRow('raw-lightly', 'Lightly AI')
  const moderately = rawRow('raw-moderately', 'Moderately AI')
  const heavily = rawRow('raw-heavily', 'Heavily AI')
  rawGrid.appendChild(human.root)
  rawGrid.appendChild(lightly.root)
  rawGrid.appendChild(moderately.root)
  rawGrid.appendChild(heavily.root)
  root.appendChild(rawGrid)

  const errorMessage = el<HTMLDivElement>('div', 'error-message')
  root.appendChild(errorMessage)

  const dismissButton = el<HTMLButtonElement>('button', 'dismiss-button')
  dismissButton.textContent = 'Close'
  dismissButton.type = 'button'
  root.appendChild(dismissButton)

  shadow.appendChild(root)

  return {
    host,
    shadow,
    refs: {
      root,
      preview,
      wordCount,
      spinner,
      primaryLabel,
      primaryPct,
      barHuman,
      barMixed,
      barAi,
      raw: {
        human: human.value,
        lightly: lightly.value,
        moderately: moderately.value,
        heavily: heavily.value,
      },
      errorMessage,
      dismissButton,
    },
  }
}
