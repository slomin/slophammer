// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSettings } from '@/entrypoints/options/settings-renderer'
import { DEFAULT_SETTINGS } from '@/settings/settings-types'

function findInput(name: string, value: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)
}

describe('renderSettings', () => {
  let root: HTMLElement
  beforeEach(() => {
    document.body.innerHTML = '<section id="settings"></section>'
    root = document.getElementById('settings')!
  })

  it('renders both groups with defaults checked', () => {
    renderSettings(root, DEFAULT_SETTINGS, {
      onResultDetailChange: vi.fn(),
      onThemeChange: vi.fn(),
    })

    expect(findInput('result-detail', 'basic')?.checked).toBe(true)
    expect(findInput('result-detail', 'advanced')?.checked).toBe(false)
    expect(findInput('theme', 'system')?.checked).toBe(true)
    expect(findInput('theme', 'light')?.checked).toBe(false)
    expect(findInput('theme', 'dark')?.checked).toBe(false)
  })

  it('reflects non-default settings when re-rendered', () => {
    renderSettings(root, { resultDetail: 'advanced', theme: 'dark' }, {
      onResultDetailChange: vi.fn(),
      onThemeChange: vi.fn(),
    })

    expect(findInput('result-detail', 'advanced')?.checked).toBe(true)
    expect(findInput('theme', 'dark')?.checked).toBe(true)
  })

  it('fires onResultDetailChange with the new value when the user picks advanced', () => {
    const onResultDetailChange = vi.fn()
    renderSettings(root, DEFAULT_SETTINGS, {
      onResultDetailChange,
      onThemeChange: vi.fn(),
    })

    const input = findInput('result-detail', 'advanced')!
    input.checked = true
    input.dispatchEvent(new Event('change'))

    expect(onResultDetailChange).toHaveBeenCalledExactlyOnceWith('advanced')
  })

  it('fires onThemeChange with the new value when the user picks light', () => {
    const onThemeChange = vi.fn()
    renderSettings(root, DEFAULT_SETTINGS, {
      onResultDetailChange: vi.fn(),
      onThemeChange,
    })

    const input = findInput('theme', 'light')!
    input.checked = true
    input.dispatchEvent(new Event('change'))

    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('light')
  })
})
