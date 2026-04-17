import type { ClassifyRunMessage, ClassifyStartedMessage, SelectionTooShortMessage } from '@/messaging/protocol'

export const MIN_SELECTION_CHARS = 75
export const PREVIEW_MAX_CHARS = 200
const MENU_ID = 'slop-hammer:classify'
const MENU_TITLE = 'Check with Slop Hammer'

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (trimmed.length === 0) return 0
  return trimmed.split(/\s+/).length
}

export function isSelectionLongEnough(text: string): boolean {
  return text.trim().length >= MIN_SELECTION_CHARS
}

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
}

export function registerContextMenu(deps: ContextMenuDeps): void {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: MENU_ID,
      title: MENU_TITLE,
      contexts: ['selection'],
    })
  })

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID || tab?.id == null) return
    const text = (info.selectionText ?? '').trim()

    if (!isSelectionLongEnough(text)) {
      deps.logger.warn('selection too short', { length: text.length })
      deps.sendToTab(tab.id, { type: 'selection:too-short', length: text.length })
      return
    }

    const requestId = deps.newRequestId()
    deps.logger.info('context-menu click', { requestId, length: text.length })

    deps.sendToTab(tab.id, buildStartedMessage({ requestId, text }))

    await deps.ensureOffscreen()
    deps.sendToRuntime({ type: 'classify:run', requestId, tabId: tab.id, text })
  })
}
