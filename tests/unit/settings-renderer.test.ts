// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSettings, type SettingsHandlers } from '@/entrypoints/options/settings-renderer'
import { DEFAULT_SETTINGS } from '@/settings/settings-types'

function findInput(name: string, value: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)
}

function handlers(overrides: Partial<SettingsHandlers> = {}): SettingsHandlers {
  return {
    onResultDetailChange: vi.fn(),
    onThemeChange: vi.fn(),
    onCardPlacementChange: vi.fn(),
    ...overrides,
  }
}

describe('renderSettings', () => {
  let root: HTMLElement
  beforeEach(() => {
    document.body.innerHTML = '<section id="settings"></section>'
    root = document.getElementById('settings')!
  })

  it('renders all groups with defaults checked', () => {
    renderSettings(root, DEFAULT_SETTINGS, handlers())

    expect(findInput('result-detail', 'basic')?.checked).toBe(true)
    expect(findInput('result-detail', 'advanced')?.checked).toBe(false)
    expect(findInput('card-placement', 'anchored')?.checked).toBe(true)
    expect(findInput('card-placement', 'pinned')?.checked).toBe(false)
    expect(findInput('theme', 'system')?.checked).toBe(true)
    expect(findInput('theme', 'light')?.checked).toBe(false)
    expect(findInput('theme', 'dark')?.checked).toBe(false)
  })

  it('reflects non-default settings when re-rendered', () => {
    renderSettings(root, { resultDetail: 'advanced', theme: 'dark', cardPlacement: 'pinned' }, handlers())

    expect(findInput('result-detail', 'advanced')?.checked).toBe(true)
    expect(findInput('card-placement', 'pinned')?.checked).toBe(true)
    expect(findInput('theme', 'dark')?.checked).toBe(true)
  })

  it('fires onResultDetailChange with the new value when the user picks advanced', () => {
    const onResultDetailChange = vi.fn()
    renderSettings(root, DEFAULT_SETTINGS, handlers({ onResultDetailChange }))

    const input = findInput('result-detail', 'advanced')!
    input.checked = true
    input.dispatchEvent(new Event('change'))

    expect(onResultDetailChange).toHaveBeenCalledExactlyOnceWith('advanced')
  })

  it('fires onCardPlacementChange with the new value when the user picks pinned', () => {
    const onCardPlacementChange = vi.fn()
    renderSettings(root, DEFAULT_SETTINGS, handlers({ onCardPlacementChange }))

    const input = findInput('card-placement', 'pinned')!
    input.checked = true
    input.dispatchEvent(new Event('change'))

    expect(onCardPlacementChange).toHaveBeenCalledExactlyOnceWith('pinned')
  })

  it('fires onThemeChange with the new value when the user picks light', () => {
    const onThemeChange = vi.fn()
    renderSettings(root, DEFAULT_SETTINGS, handlers({ onThemeChange }))

    const input = findInput('theme', 'light')!
    input.checked = true
    input.dispatchEvent(new Event('change'))

    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('light')
  })

  it('lists the placement options in the order a reader expects', () => {
    renderSettings(root, DEFAULT_SETTINGS, handlers())
    const group = document.querySelector('[data-testid="group-card-placement"]')!
    const labels = [...group.querySelectorAll('.settings-row-label')].map((el) => el.textContent)
    expect(labels).toEqual(['Next to the selected text', 'Pinned to the bottom-right corner'])
  })
})
