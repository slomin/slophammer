export type ResultDetail = 'basic' | 'advanced'
export type ThemePreference = 'system' | 'light' | 'dark'

export interface Settings {
  resultDetail: ResultDetail
  theme: ThemePreference
}

export const DEFAULT_SETTINGS: Settings = {
  resultDetail: 'basic',
  theme: 'system',
}
