import { describe, expect, it } from 'vitest'
import { resolveTheme } from '@/settings/resolve-theme'

describe('resolveTheme', () => {
  it('light preference always resolves light', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('dark preference always resolves dark', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it('system preference follows systemPrefersDark', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})
