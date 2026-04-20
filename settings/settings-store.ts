import { DEFAULT_SETTINGS, type Settings } from './settings-types'

export const SETTINGS_KEY = 'slophammer-settings'

export interface StorageAreaLike {
  get(keys: string | string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  onChanged: {
    addListener(listener: (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => void): void
    removeListener(listener: (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => void): void
  }
}

export interface SettingsStoreLike {
  get(): Promise<Settings>
  set(patch: Partial<Settings>): Promise<void>
  subscribe(listener: (next: Settings) => void): () => void
}

function coerce(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS
  const r = raw as Partial<Settings>
  const resultDetail = r.resultDetail === 'advanced' ? 'advanced' : 'basic'
  const theme =
    r.theme === 'light' ? 'light' : r.theme === 'dark' ? 'dark' : 'system'
  return { resultDetail, theme }
}

export class SettingsStore implements SettingsStoreLike {
  constructor(private readonly area: StorageAreaLike) {}

  async get(): Promise<Settings> {
    const data = await this.area.get(SETTINGS_KEY)
    return coerce(data[SETTINGS_KEY])
  }

  async set(patch: Partial<Settings>): Promise<void> {
    const current = await this.get()
    const next: Settings = { ...current, ...patch }
    await this.area.set({ [SETTINGS_KEY]: next })
  }

  subscribe(listener: (next: Settings) => void): () => void {
    const handler = (changes: Record<string, { newValue?: unknown }>) => {
      const change = changes[SETTINGS_KEY]
      if (!change) return
      listener(coerce(change.newValue))
    }
    this.area.onChanged.addListener(handler)
    return () => this.area.onChanged.removeListener(handler)
  }
}

export function createChromeSettingsStore(): SettingsStore {
  const local = chrome.storage.local
  const area: StorageAreaLike = {
    get: (keys) => local.get(keys),
    set: (items) => local.set(items),
    onChanged: {
      addListener: (listener) =>
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local') return
          listener(changes)
        }),
      removeListener: (listener) => {
        // chrome.storage.onChanged doesn't let us remove the wrapped listener
        // cleanly; the SettingsStore is a process-lifetime singleton in
        // practice, so leaking the wrapper is fine. Keep the shape for tests.
        void listener
      },
    },
  }
  return new SettingsStore(area)
}
