import type { ResultDetail, Settings, ThemePreference } from '@/settings/settings-types'

export interface SettingsHandlers {
  onResultDetailChange(value: ResultDetail): void
  onThemeChange(value: ThemePreference): void
}

type ResultSwatch = 'h' | 'l' | 'hv' | 'a'

interface ResultDetailOption {
  value: ResultDetail
  label: string
  description: string
  swatches: ResultSwatch[]
}

interface ThemeOption {
  value: ThemePreference
  label: string
  description: string
}

const RESULT_DETAIL_OPTIONS: ResultDetailOption[] = [
  {
    value: 'basic',
    label: 'Basic',
    description: 'Show only the Human vs AI verdict. Advanced distribution stays collapsed by default.',
    swatches: ['h', 'a'],
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Expand the full 4-bucket breakdown (Human · Light · Heavy · Full AI) on every result.',
    swatches: ['h', 'l', 'hv', 'a'],
  },
]

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'system', label: 'System', description: 'Follow your OS appearance.' },
  { value: 'light', label: 'Light', description: 'Warm paper background with high-contrast ink.' },
  { value: 'dark', label: 'Dark', description: 'Near-black canvas with softened neutrals.' },
]

export function renderSettings(root: HTMLElement, settings: Settings, handlers: SettingsHandlers): void {
  root.innerHTML = ''
  root.appendChild(buildResultDetailGroup(settings.resultDetail, handlers.onResultDetailChange))
  root.appendChild(buildThemeGroup(settings.theme, handlers.onThemeChange))
}

function buildResultDetailGroup(selected: ResultDetail, onChange: (value: ResultDetail) => void): HTMLElement {
  const wrap = document.createElement('fieldset')
  wrap.className = 'settings-group'
  wrap.dataset.testid = 'group-result-detail'
  wrap.appendChild(legend('Result detail'))

  for (const option of RESULT_DETAIL_OPTIONS) {
    const row = buildRow({
      groupName: 'result-detail',
      value: option.value,
      selected: selected === option.value,
      onSelect: () => onChange(option.value),
    })

    const text = row.text
    const labelLine = document.createElement('span')
    labelLine.className = 'settings-row-label'
    labelLine.appendChild(document.createTextNode(option.label))
    labelLine.appendChild(buildSwatchRow(option.swatches))
    text.appendChild(labelLine)

    const desc = document.createElement('span')
    desc.className = 'settings-row-desc'
    desc.textContent = option.description
    text.appendChild(desc)

    wrap.appendChild(row.root)
  }
  return wrap
}

function buildThemeGroup(selected: ThemePreference, onChange: (value: ThemePreference) => void): HTMLElement {
  const wrap = document.createElement('fieldset')
  wrap.className = 'settings-group'
  wrap.dataset.testid = 'group-theme'
  wrap.appendChild(legend('Theme'))

  for (const option of THEME_OPTIONS) {
    const row = buildRow({
      groupName: 'theme',
      value: option.value,
      selected: selected === option.value,
      onSelect: () => onChange(option.value),
    })
    row.root.classList.add('theme-option')

    const labelLine = document.createElement('span')
    labelLine.className = 'settings-row-label'
    labelLine.textContent = option.label

    const desc = document.createElement('span')
    desc.className = 'settings-row-desc'
    desc.textContent = option.description

    row.text.appendChild(labelLine)
    row.text.appendChild(desc)

    const preview = document.createElement('span')
    preview.className = `theme-preview ${option.value}`
    preview.setAttribute('aria-hidden', 'true')
    row.root.appendChild(preview)

    wrap.appendChild(row.root)
  }
  return wrap
}

function legend(text: string): HTMLLegendElement {
  const legendEl = document.createElement('legend')
  legendEl.textContent = text
  return legendEl
}

interface RowOptions {
  groupName: string
  value: string
  selected: boolean
  onSelect: () => void
}

function buildRow(opts: RowOptions): { root: HTMLLabelElement; text: HTMLSpanElement } {
  const root = document.createElement('label')
  root.className = 'settings-row'
  root.dataset.testid = `option-${opts.groupName}-${opts.value}`

  const input = document.createElement('input')
  input.type = 'radio'
  input.name = opts.groupName
  input.value = opts.value
  input.checked = opts.selected
  input.addEventListener('change', () => {
    if (input.checked) opts.onSelect()
  })

  const text = document.createElement('span')
  text.className = 'settings-row-text'

  root.appendChild(input)
  root.appendChild(text)
  return { root, text }
}

function buildSwatchRow(swatches: ResultSwatch[]): HTMLSpanElement {
  const row = document.createElement('span')
  row.className = 'swatch-row'
  row.setAttribute('aria-hidden', 'true')
  for (const s of swatches) {
    const sw = document.createElement('span')
    sw.className = `sw ${s}`
    row.appendChild(sw)
  }
  return row
}
