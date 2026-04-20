import type { ThemePreference } from './settings-types'

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): 'dark' | 'light' {
  if (pref === 'dark') return 'dark'
  if (pref === 'light') return 'light'
  return systemPrefersDark ? 'dark' : 'light'
}
