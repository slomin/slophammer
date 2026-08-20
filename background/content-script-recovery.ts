export interface ContentScriptRecoveryDeps {
  ping(tabId: number): Promise<unknown>
  inject(tabId: number): Promise<unknown>
  onInjected?(tabId: number): void
  onFailure?(tabId: number, error: unknown): void
}

function isLivePing(response: unknown): boolean {
  return Boolean(
    response &&
      typeof response === 'object' &&
      'alive' in response &&
      (response as { alive?: unknown }).alive === true,
  )
}

/**
 * Ensure a tab has a verified SlopHammer receiver.
 *
 * Tabs that predate an install or extension reload do not receive a static
 * content script. Script execution resolving is not sufficient proof that the
 * listener registered, so probe again before callers send user-visible work.
 */
export async function ensureTabContentScript(
  deps: ContentScriptRecoveryDeps,
  tabId: number,
  options: { inject: boolean } = { inject: true },
): Promise<boolean> {
  try {
    if (isLivePing(await deps.ping(tabId))) return true
  } catch {
    // No live listener — fall through to on-demand injection.
  }

  if (!options.inject) return false

  try {
    await deps.inject(tabId)
    if (!isLivePing(await deps.ping(tabId))) {
      throw new Error('Injected content script did not register a live listener.')
    }
    deps.onInjected?.(tabId)
    return true
  } catch (error) {
    deps.onFailure?.(tabId, error)
    return false
  }
}
