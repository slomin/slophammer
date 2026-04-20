import { CARD_STYLES } from './styles'
import { ADVANCED_DRAWER_LABELS } from './verdict'

export const CARD_HOST_ATTR = 'data-slop-hammer-card'
export const CARD_HOST_SELECTOR = `[${CARD_HOST_ATTR}]`
export const CARD_VERSION = 'v0.3'

export interface AdvancedRowRefs {
  root: HTMLElement
  name: HTMLElement
  fill: HTMLElement
  pct: HTMLElement
}

export interface CardRefs {
  root: HTMLElement
  head: HTMLElement
  headBrand: HTMLElement
  headVersion: HTMLElement
  btnMinimise: HTMLButtonElement
  btnClose: HTMLButtonElement
  preview: HTMLElement
  wordCount: HTMLElement
  loadingRow: HTMLElement
  spinner: HTMLElement
  loadingLabel: HTMLElement
  verdictBox: HTMLElement
  verdictLabel: HTMLElement
  verdictConfidence: HTMLElement
  verdictBig: HTMLElement
  verdictText: HTMLElement
  binaryBarHuman: HTMLElement
  binaryBarAi: HTMLElement
  binaryLegendHuman: HTMLElement
  binaryLegendAi: HTMLElement
  modeRow: HTMLElement
  modeToggle: HTMLButtonElement
  advanced: HTMLElement
  advancedRows: [AdvancedRowRefs, AdvancedRowRefs, AdvancedRowRefs, AdvancedRowRefs]
  errorBox: HTMLElement
  errorTitle: HTMLElement
  errorMessage: HTMLElement
  actionsRow: HTMLElement
  btnCopy: HTMLButtonElement
  btnShare: HTMLButtonElement
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

function el<T extends HTMLElement>(
  tag: string,
  opts?: { testId?: string; className?: string; text?: string; attrs?: Record<string, string> },
): T {
  const node = document.createElement(tag) as T
  if (opts?.testId) node.dataset.testid = opts.testId
  if (opts?.className) node.className = opts.className
  if (opts?.text !== undefined) node.textContent = opts.text
  if (opts?.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v)
  return node
}

function buildHead(): { head: HTMLElement; brand: HTMLElement; version: HTMLElement; minimise: HTMLButtonElement; close: HTMLButtonElement } {
  const head = el<HTMLDivElement>('div', { className: 'sh-head' })

  const brand = el<HTMLSpanElement>('span', { className: 'sh-brand', testId: 'head-brand' })
  brand.appendChild(el<HTMLSpanElement>('span', { className: 'sh-mark' }))
  brand.appendChild(document.createTextNode('slop/hammer '))
  const version = el<HTMLSpanElement>('span', { className: 'ver', testId: 'head-version', text: CARD_VERSION })
  brand.appendChild(version)

  const actions = el<HTMLSpanElement>('span', { className: 'sh-head-actions' })
  const minimise = el<HTMLButtonElement>('button', {
    className: 'sh-icon-btn',
    testId: 'btn-minimise',
    text: '—',
    attrs: { type: 'button', title: 'minimise', 'aria-label': 'minimise' },
  })
  const close = el<HTMLButtonElement>('button', {
    className: 'sh-icon-btn',
    testId: 'btn-close',
    text: '×',
    attrs: { type: 'button', title: 'close', 'aria-label': 'close' },
  })
  actions.appendChild(minimise)
  actions.appendChild(close)

  head.appendChild(brand)
  head.appendChild(actions)
  return { head, brand, version, minimise, close }
}

function buildPreview(): { row: HTMLElement; preview: HTMLElement; wordCount: HTMLElement } {
  const row = el<HTMLDivElement>('div', { className: 'sh-preview' })
  const preview = el<HTMLSpanElement>('span', { className: 'prev', testId: 'preview' })
  const wordCount = el<HTMLSpanElement>('span', { className: 'wc', testId: 'word-count' })
  row.appendChild(preview)
  row.appendChild(wordCount)
  return { row, preview, wordCount }
}

function buildLoading(): { row: HTMLElement; spinner: HTMLElement; label: HTMLElement } {
  const row = el<HTMLDivElement>('div', { className: 'loading-row hide', testId: 'loading-row' })
  const spinner = el<HTMLSpanElement>('span', { className: 'spinner', testId: 'spinner' })
  const label = el<HTMLSpanElement>('span', { testId: 'loading-label', text: 'analysing' })
  row.appendChild(spinner)
  row.appendChild(label)
  return { row, spinner, label }
}

function buildVerdict(): {
  box: HTMLElement
  label: HTMLElement
  confidence: HTMLElement
  big: HTMLElement
  text: HTMLElement
  barHuman: HTMLElement
  barAi: HTMLElement
  legendHuman: HTMLElement
  legendAi: HTMLElement
} {
  const box = el<HTMLDivElement>('div', { className: 'sh-verdict hide', testId: 'verdict-box' })

  const head = el<HTMLDivElement>('div', { className: 'v-head' })
  const label = el<HTMLSpanElement>('span', { className: 'v-label', testId: 'verdict-label' })
  const confidence = el<HTMLSpanElement>('span', { className: 'conf-chip', testId: 'verdict-confidence' })
  head.appendChild(label)
  head.appendChild(confidence)

  const bigWrap = el<HTMLDivElement>('div', { className: 'big' })
  const big = el<HTMLSpanElement>('span', { testId: 'verdict-big' })
  const unit = el<HTMLSpanElement>('span', { className: 'unit', text: '%' })
  bigWrap.appendChild(big)
  bigWrap.appendChild(unit)

  const text = el<HTMLDivElement>('div', { className: 'verdict-text', testId: 'verdict-text' })

  const bar = el<HTMLDivElement>('div', { className: 'sh-binary-bar' })
  const barHuman = el<HTMLSpanElement>('span', { className: 'human-part', testId: 'binary-bar-human' })
  const barAi = el<HTMLSpanElement>('span', { className: 'ai-part', testId: 'binary-bar-ai' })
  bar.appendChild(barHuman)
  bar.appendChild(barAi)

  const legend = el<HTMLDivElement>('div', { className: 'sh-binary-legend' })
  const legendHuman = el<HTMLSpanElement>('span', { className: 'side', testId: 'binary-legend-human' })
  const legendAi = el<HTMLSpanElement>('span', { className: 'side', testId: 'binary-legend-ai' })
  legend.appendChild(legendHuman)
  legend.appendChild(legendAi)

  box.appendChild(head)
  box.appendChild(bigWrap)
  box.appendChild(text)
  box.appendChild(bar)
  box.appendChild(legend)
  return { box, label, confidence, big, text, barHuman, barAi, legendHuman, legendAi }
}

function buildMode(): { row: HTMLElement; toggle: HTMLButtonElement } {
  const row = el<HTMLDivElement>('div', { className: 'sh-mode hide', testId: 'mode-row' })
  const modeLabel = el<HTMLSpanElement>('span', { text: 'mode' })
  const toggle = el<HTMLButtonElement>('button', {
    className: 'toggle',
    testId: 'mode-toggle',
    attrs: { type: 'button', 'aria-pressed': 'false' },
  })
  toggle.appendChild(document.createTextNode('Advanced '))
  const chev = el<HTMLSpanElement>('span', { className: 'chev', text: '▾' })
  toggle.appendChild(chev)
  row.appendChild(modeLabel)
  row.appendChild(toggle)
  return { row, toggle }
}

function buildAdvancedRow(index: 0 | 1 | 2 | 3, label: string): AdvancedRowRefs {
  const root = el<HTMLDivElement>('div', { className: 'row', testId: `raw-${index}` })
  const name = el<HTMLSpanElement>('span', { className: 'name', text: label })
  const track = el<HTMLSpanElement>('span', { className: 'track' })
  const fill = el<HTMLSpanElement>('span', { className: 'fill' })
  fill.dataset.bucket = String(index)
  track.appendChild(fill)
  const pct = el<HTMLSpanElement>('span', { className: 'val', text: '—' })
  root.appendChild(name)
  root.appendChild(track)
  root.appendChild(pct)
  return { root, name, fill, pct }
}

function buildAdvanced(): { drawer: HTMLElement; rows: [AdvancedRowRefs, AdvancedRowRefs, AdvancedRowRefs, AdvancedRowRefs] } {
  const drawer = el<HTMLDivElement>('div', { className: 'sh-advanced hide', testId: 'advanced' })
  const head = el<HTMLDivElement>('div', { className: 'adv-head' })
  head.appendChild(el<HTMLSpanElement>('span', { text: 'distribution' }))
  head.appendChild(el<HTMLSpanElement>('span', { text: '4 buckets' }))
  const stack = el<HTMLDivElement>('div', { className: 'stack' })
  const rows: [AdvancedRowRefs, AdvancedRowRefs, AdvancedRowRefs, AdvancedRowRefs] = [
    buildAdvancedRow(0, ADVANCED_DRAWER_LABELS[0]),
    buildAdvancedRow(1, ADVANCED_DRAWER_LABELS[1]),
    buildAdvancedRow(2, ADVANCED_DRAWER_LABELS[2]),
    buildAdvancedRow(3, ADVANCED_DRAWER_LABELS[3]),
  ]
  for (const r of rows) stack.appendChild(r.root)
  drawer.appendChild(head)
  drawer.appendChild(stack)
  return { drawer, rows }
}

function buildError(): { box: HTMLElement; title: HTMLElement; message: HTMLElement } {
  const box = el<HTMLDivElement>('div', { className: 'error-box hide', testId: 'error-box' })
  const title = el<HTMLDivElement>('div', { className: 'big', testId: 'error-title', text: "can't judge yet" })
  const message = el<HTMLDivElement>('div', { className: 'msg', testId: 'error-message' })
  box.appendChild(title)
  box.appendChild(message)
  return { box, title, message }
}

function buildActions(): {
  row: HTMLElement
  copy: HTMLButtonElement
  share: HTMLButtonElement
  dismiss: HTMLButtonElement
} {
  const row = el<HTMLDivElement>('div', { className: 'sh-actions hide', testId: 'actions-row' })
  const copy = el<HTMLButtonElement>('button', {
    className: 'sh-btn',
    testId: 'btn-copy',
    text: '⎘ Copy',
    attrs: { type: 'button' },
  })
  const share = el<HTMLButtonElement>('button', {
    className: 'sh-btn',
    testId: 'btn-share',
    text: '↗ Share',
    attrs: { type: 'button' },
  })
  const dismiss = el<HTMLButtonElement>('button', {
    className: 'sh-btn hide',
    testId: 'dismiss-button',
    text: 'dismiss',
    attrs: { type: 'button' },
  })
  row.appendChild(copy)
  row.appendChild(share)
  row.appendChild(dismiss)
  return { row, copy, share, dismiss }
}

export function buildCard(): CardElements {
  const host = document.createElement('div')
  applyHostReset(host)
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = CARD_STYLES
  shadow.appendChild(style)

  const root = el<HTMLDivElement>('div', { className: 'sh-card dark', testId: 'card-root' })
  root.dataset.state = 'idle'
  root.dataset.view = 'full'
  root.dataset.mode = 'basic'

  const head = buildHead()
  const preview = buildPreview()
  const loading = buildLoading()
  const verdict = buildVerdict()
  const mode = buildMode()
  const advanced = buildAdvanced()
  const error = buildError()
  const actions = buildActions()

  root.appendChild(head.head)
  root.appendChild(preview.row)
  root.appendChild(loading.row)
  root.appendChild(verdict.box)
  root.appendChild(mode.row)
  root.appendChild(advanced.drawer)
  root.appendChild(error.box)
  root.appendChild(actions.row)

  shadow.appendChild(root)

  return {
    host,
    shadow,
    refs: {
      root,
      head: head.head,
      headBrand: head.brand,
      headVersion: head.version,
      btnMinimise: head.minimise,
      btnClose: head.close,
      preview: preview.preview,
      wordCount: preview.wordCount,
      loadingRow: loading.row,
      spinner: loading.spinner,
      loadingLabel: loading.label,
      verdictBox: verdict.box,
      verdictLabel: verdict.label,
      verdictConfidence: verdict.confidence,
      verdictBig: verdict.big,
      verdictText: verdict.text,
      binaryBarHuman: verdict.barHuman,
      binaryBarAi: verdict.barAi,
      binaryLegendHuman: verdict.legendHuman,
      binaryLegendAi: verdict.legendAi,
      modeRow: mode.row,
      modeToggle: mode.toggle,
      advanced: advanced.drawer,
      advancedRows: advanced.rows,
      errorBox: error.box,
      errorTitle: error.title,
      errorMessage: error.message,
      actionsRow: actions.row,
      btnCopy: actions.copy,
      btnShare: actions.share,
      dismissButton: actions.dismiss,
    },
  }
}
