import type { ResultDetail, Settings, ThemePreference } from '@/settings/settings-types'

export interface SettingsHandlers {
  onResultDetailChange(value: ResultDetail): void
  onThemeChange(value: ThemePreference): void
}

interface RadioOption<T extends string> {
  value: T
  label: string
  description?: string
}

const RESULT_DETAIL_OPTIONS: RadioOption<ResultDetail>[] = [
  { value: 'basic', label: 'Basic', description: 'Advanced distribution stays collapsed by default.' },
  { value: 'advanced', label: 'Advanced', description: 'Expanded 4-bucket breakdown on every result.' },
]

const THEME_OPTIONS: RadioOption<ThemePreference>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function renderSettings(root: HTMLElement, settings: Settings, handlers: SettingsHandlers): void {
  root.innerHTML = ''

  root.appendChild(
    buildGroup<ResultDetail>({
      groupName: 'result-detail',
      title: 'Result detail',
      options: RESULT_DETAIL_OPTIONS,
      selected: settings.resultDetail,
      onChange: handlers.onResultDetailChange,
    }),
  )

  root.appendChild(
    buildGroup<ThemePreference>({
      groupName: 'theme',
      title: 'Theme',
      options: THEME_OPTIONS,
      selected: settings.theme,
      onChange: handlers.onThemeChange,
    }),
  )
}

interface BuildGroupOptions<T extends string> {
  groupName: string
  title: string
  options: RadioOption<T>[]
  selected: T
  onChange: (value: T) => void
}

function buildGroup<T extends string>(opts: BuildGroupOptions<T>): HTMLElement {
  const wrap = document.createElement('fieldset')
  wrap.className = 'settings-group'
  wrap.dataset.testid = `group-${opts.groupName}`

  const legend = document.createElement('legend')
  legend.textContent = opts.title
  wrap.appendChild(legend)

  for (const option of opts.options) {
    const row = document.createElement('label')
    row.className = 'settings-row'
    row.dataset.testid = `option-${opts.groupName}-${option.value}`

    const input = document.createElement('input')
    input.type = 'radio'
    input.name = opts.groupName
    input.value = option.value
    input.checked = option.value === opts.selected
    input.addEventListener('change', () => {
      if (input.checked) opts.onChange(option.value)
    })

    const text = document.createElement('span')
    text.className = 'settings-row-text'
    const label = document.createElement('span')
    label.className = 'settings-row-label'
    label.textContent = option.label
    text.appendChild(label)
    if (option.description) {
      const desc = document.createElement('span')
      desc.className = 'settings-row-desc'
      desc.textContent = option.description
      text.appendChild(desc)
    }

    row.appendChild(input)
    row.appendChild(text)
    wrap.appendChild(row)
  }
  return wrap
}
