import { PRODUCT_NAME } from '@/shared/product'
import type { MigrationState } from '@/migration/state'

export type MigrationActionKind = 'ready' | 'updating' | 'error'

export interface MigrationActionDeps {
  queryTabIds(): Promise<number[]>
  setBadgeText(details: { text: string | null; tabId?: number }): Promise<void>
  setBadgeBackgroundColor(details: { color: string; tabId?: number }): Promise<void>
  setTitle(details: { title: string; tabId?: number }): Promise<void>
}

export function migrationActionKind(state: MigrationState): MigrationActionKind {
  if (state.phase === 'ready') return 'ready'
  if (state.phase === 'error') return 'error'
  return 'updating'
}

export async function applyMigrationActionSignal(
  deps: MigrationActionDeps,
  state: MigrationState,
  defaultTitle: string,
): Promise<void> {
  const kind = migrationActionKind(state)
  const text = kind === 'ready' ? '' : kind === 'error' ? '!' : '…'
  const title = kind === 'ready'
    ? defaultTitle
    : kind === 'error'
      ? `${PRODUCT_NAME} model update failed — open options to retry.`
      : `${PRODUCT_NAME} is updating its model…`
  const color = kind === 'error' ? '#c0392b' : '#b36b00'

  if (kind !== 'ready') await deps.setBadgeBackgroundColor({ color })
  await deps.setBadgeText({ text })
  await deps.setTitle({ title })

  const tabIds = await deps.queryTabIds()
  await Promise.all(tabIds.flatMap((tabId) => {
    const writes: Promise<void>[] = [
      // Chrome documents null as clearing a tab-specific badge override so it
      // inherits the global value. The @types/chrome declaration omits null.
      deps.setBadgeText({ text: kind === 'ready' ? null : text, tabId }),
      deps.setTitle({ title, tabId }),
    ]
    if (kind !== 'ready') writes.push(deps.setBadgeBackgroundColor({ color, tabId }))
    return writes
  }))
}
