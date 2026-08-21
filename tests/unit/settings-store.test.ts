import { describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY, SettingsStore, type StorageAreaLike } from '@/settings/settings-store'
import { DEFAULT_SETTINGS } from '@/settings/settings-types'

type OnChangedListener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => void

function makeFakeArea() {
  const state: Record<string, unknown> = {}
  const listeners = new Set<OnChangedListener>()
  const area: StorageAreaLike = {
    get: async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys]
      const out: Record<string, unknown> = {}
      for (const k of list) if (k in state) out[k] = state[k]
      return out
    },
    set: async (items) => {
      const changes: Record<string, { newValue?: unknown; oldValue?: unknown }> = {}
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { newValue: v, oldValue: state[k] }
        state[k] = v
      }
      for (const l of listeners) l(changes)
    },
    onChanged: {
      addListener: (l) => listeners.add(l),
      removeListener: (l) => listeners.delete(l),
    },
  }
  return { area, state }
}

describe('SettingsStore.get', () => {
  it('returns defaults when nothing is stored', async () => {
    const { area } = makeFakeArea()
    const store = new SettingsStore(area)
    expect(await store.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('returns stored values verbatim when valid', async () => {
    const { area } = makeFakeArea()
    await area.set({
      [SETTINGS_KEY]: { resultDetail: 'advanced', theme: 'dark', cardPlacement: 'pinned' },
    })
    const store = new SettingsStore(area)
    expect(await store.get()).toEqual({ resultDetail: 'advanced', theme: 'dark', cardPlacement: 'pinned' })
  })

  it('coerces invalid values back to defaults', async () => {
    const { area } = makeFakeArea()
    await area.set({ [SETTINGS_KEY]: { resultDetail: 'bogus', theme: 42, cardPlacement: 'corner' } })
    const store = new SettingsStore(area)
    expect(await store.get()).toEqual(DEFAULT_SETTINGS)
  })

  // Settings written before the placement option existed have no such key.
  // They must read as the default rather than as something invalid.
  it('fills in anchored placement for settings saved before the key existed', async () => {
    const { area } = makeFakeArea()
    await area.set({ [SETTINGS_KEY]: { resultDetail: 'advanced', theme: 'light' } })
    const store = new SettingsStore(area)
    expect(await store.get()).toEqual({ resultDetail: 'advanced', theme: 'light', cardPlacement: 'anchored' })
  })
})

describe('SettingsStore.set', () => {
  it('persists a partial patch without losing other fields', async () => {
    const { area, state } = makeFakeArea()
    await area.set({
      [SETTINGS_KEY]: { resultDetail: 'advanced', theme: 'light', cardPlacement: 'pinned' },
    })
    const store = new SettingsStore(area)
    await store.set({ theme: 'dark' })
    expect(state[SETTINGS_KEY]).toEqual({ resultDetail: 'advanced', theme: 'dark', cardPlacement: 'pinned' })
  })

  it('writes defaults before patching when storage is empty', async () => {
    const { area, state } = makeFakeArea()
    const store = new SettingsStore(area)
    await store.set({ resultDetail: 'advanced' })
    expect(state[SETTINGS_KEY]).toEqual({ resultDetail: 'advanced', theme: 'system', cardPlacement: 'anchored' })
  })

  it('persists the card placement', async () => {
    const { area, state } = makeFakeArea()
    const store = new SettingsStore(area)
    await store.set({ cardPlacement: 'pinned' })
    expect(state[SETTINGS_KEY]).toEqual({ resultDetail: 'basic', theme: 'system', cardPlacement: 'pinned' })
  })
})

describe('SettingsStore.subscribe', () => {
  it('fires the listener on change with coerced settings', async () => {
    const { area } = makeFakeArea()
    const store = new SettingsStore(area)
    const listener = vi.fn()
    store.subscribe(listener)
    await store.set({ theme: 'dark' })
    expect(listener).toHaveBeenCalledWith({ resultDetail: 'basic', theme: 'dark', cardPlacement: 'anchored' })
  })

  it('returned unsubscribe stops notifications', async () => {
    const { area } = makeFakeArea()
    const store = new SettingsStore(area)
    const listener = vi.fn()
    const unsub = store.subscribe(listener)
    unsub()
    await store.set({ theme: 'dark' })
    expect(listener).not.toHaveBeenCalled()
  })
})
