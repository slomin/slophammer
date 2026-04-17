import { CARD_STYLES } from './styles'

export const CARD_TAG = 'slop-hammer-card'

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
  errorMessage: HTMLElement
  dismissButton: HTMLButtonElement
}

export interface CardElements {
  host: HTMLElement
  shadow: ShadowRoot
  refs: CardRefs
}

function el<T extends HTMLElement>(tag: string, testId?: string, attrs?: Record<string, string>): T {
  const node = document.createElement(tag) as T
  if (testId) node.dataset.testid = testId
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

export function buildCard(): CardElements {
  const host = document.createElement(CARD_TAG)
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
      errorMessage,
      dismissButton,
    },
  }
}
