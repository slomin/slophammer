import { describe, expect, it, vi } from 'vitest'
import { applyMigrationActionSignal } from '@/background/migration-action'
import { migrationState } from '@/migration/state'

function harness(tabIds = [4, 9]) {
  const calls: Array<{ method: string; details: unknown }> = []
  return {
    calls,
    deps: {
      queryTabIds: vi.fn().mockResolvedValue(tabIds),
      setBadgeText: vi.fn(async (details) => { calls.push({ method: 'text', details }) }),
      setBadgeBackgroundColor: vi.fn(async (details) => { calls.push({ method: 'color', details }) }),
      setTitle: vi.fn(async (details) => { calls.push({ method: 'title', details }) }),
    },
  }
}

describe('applyMigrationActionSignal', () => {
  it('applies the updating signal globally and to every existing tab override', async () => {
    const h = harness()
    await applyMigrationActionSignal(h.deps, migrationState('downloading'), 'Default title')

    expect(h.deps.setBadgeText).toHaveBeenCalledWith({ text: '…' })
    expect(h.deps.setBadgeText).toHaveBeenCalledWith({ text: '…', tabId: 4 })
    expect(h.deps.setBadgeText).toHaveBeenCalledWith({ text: '…', tabId: 9 })
    expect(h.deps.setTitle).toHaveBeenCalledWith({ title: 'SlopHammer is updating its model…', tabId: 4 })
  })

  it('applies the failure signal to global and tab-specific action state', async () => {
    const h = harness([7])
    await applyMigrationActionSignal(h.deps, migrationState('error', { error: 'network' }), 'Default title')

    expect(h.deps.setBadgeText).toHaveBeenCalledWith({ text: '!' })
    expect(h.deps.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 7 })
    expect(h.deps.setTitle).toHaveBeenCalledWith({
      title: 'SlopHammer model update failed — open options to retry.',
      tabId: 7,
    })
  })

  it('clears tab badge overrides on ready so they inherit the global default', async () => {
    const h = harness([3])
    await applyMigrationActionSignal(h.deps, migrationState('ready'), 'Default title')

    expect(h.deps.setBadgeText).toHaveBeenCalledWith({ text: '' })
    expect(h.deps.setBadgeText).toHaveBeenCalledWith({ text: null, tabId: 3 })
    expect(h.deps.setTitle).toHaveBeenCalledWith({ title: 'Default title', tabId: 3 })
  })
})
