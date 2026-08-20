import type { ClassifyRunMessage, ClassifyStartedMessage, SelectionTooShortMessage } from '@/messaging/protocol'
export { MIN_SELECTION_WORDS, countWords, isSelectionLongEnough } from '@/llm/input-policy'
import { MIN_SELECTION_WORDS, countWords, isSelectionLongEnough } from '@/llm/input-policy'
import { PRODUCT_NAME } from '@/shared/product'

export const PREVIEW_MAX_CHARS = 200
const MENU_ID = 'slop-hammer:classify'
const MENU_TITLE = `Check with ${PRODUCT_NAME}`

export function buildStartedMessage(args: {
  requestId: string
  text: string
}): ClassifyStartedMessage {
  return {
    type: 'classify:started',
    requestId: args.requestId,
    preview: args.text.slice(0, PREVIEW_MAX_CHARS),
    wordCount: countWords(args.text),
    charCount: args.text.length,
  }
}

export interface ContextMenuLogger {
  info(msg: string, data?: unknown): void
  warn(msg: string, data?: unknown): void
}

export interface ContextMenuDeps {
  logger: ContextMenuLogger
  sendToTab: (tabId: number, message: SelectionTooShortMessage | ClassifyStartedMessage) => void
  sendToRuntime: (message: ClassifyRunMessage) => void
  ensureOffscreen: () => Promise<void>
  newRequestId: () => string
  /**
   * Resolves true when a content script in the tab can receive messages.
   * With `inject: false` it only probes, so a trivial rejection never pays for
   * injecting the whole bundle.
   */
  ensureContentScript: (tabId: number, options: { inject: boolean }) => Promise<boolean>
  /** Called when the tab cannot be reached, so the user gets some signal. */
  onUnreachable: (tabId: number) => void
}

export interface MenuClickInfo {
  menuItemId: unknown
  selectionText?: string
  tabId?: number
}

export const MENU_ITEM_ID = MENU_ID

/**
 * Everything the context-menu click does, minus the browser plumbing.
 *
 * The tab is checked for a live content script first. Without that check a
 * click on a page whose content script never loaded — a restricted page, or
 * any tab that was already open when the extension updated — sent messages
 * into the void and the user saw nothing at all.
 */
export async function handleMenuClick(deps: ContextMenuDeps, info: MenuClickInfo): Promise<void> {
  if (info.menuItemId !== MENU_ID || info.tabId == null) return
  const tabId = info.tabId
  const text = (info.selectionText ?? '').trim()
  const tooShort = !isSelectionLongEnough(text)

  // Reachability is checked before anything is sent. Even a short selection
  // needs on-demand injection: otherwise a tab that predates installation or
  // an extension reload cannot show the promised rejection card.
  if (!(await deps.ensureContentScript(tabId, { inject: true }))) {
    deps.logger.warn('no content script in tab', { tabId, tooShort })
    deps.onUnreachable(tabId)
    return
  }

  if (tooShort) {
    const wordCount = countWords(text)
    deps.logger.info('selection too short', { wordCount })
    deps.sendToTab(tabId, { type: 'selection:too-short', wordCount, minWords: MIN_SELECTION_WORDS })
    return
  }

  const requestId = deps.newRequestId()
  deps.logger.info('context-menu click', { requestId, length: text.length })

  deps.sendToTab(tabId, buildStartedMessage({ requestId, text }))

  await deps.ensureOffscreen()
  deps.sendToRuntime({ type: 'classify:run', requestId, tabId, text })
}

export function registerContextMenu(deps: ContextMenuDeps): void {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: MENU_ID,
      title: MENU_TITLE,
      contexts: ['selection'],
      // Restricted to schemes a content script can actually run on. file://
      // is included because Chrome does inject there once the user enables
      // "Allow access to file URLs"; chrome://, devtools:// and the Web Store
      // are the ones that only ever produced a no-op.
      documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*'],
    })
  })

  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleMenuClick(deps, {
      menuItemId: info.menuItemId,
      selectionText: info.selectionText,
      tabId: tab?.id,
    })
  })
}
