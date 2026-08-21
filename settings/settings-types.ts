export type ResultDetail = 'basic' | 'advanced'
export type ThemePreference = 'system' | 'light' | 'dark'
// Where the result card goes: next to the selected text, or parked in the
// bottom-right corner regardless of the selection.
export type CardPlacement = 'anchored' | 'pinned'

export interface Settings {
  resultDetail: ResultDetail
  theme: ThemePreference
  cardPlacement: CardPlacement
}

export const DEFAULT_SETTINGS: Settings = {
  resultDetail: 'basic',
  theme: 'system',
  cardPlacement: 'anchored',
}
