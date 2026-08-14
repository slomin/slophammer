import type { ExtensionMessage } from '@/messaging/protocol'

export type HandlerMap = {
  [T in ExtensionMessage['type']]?: (message: Extract<ExtensionMessage, { type: T }>) => Promise<void>
}

type MessageDispatcher = (message: ExtensionMessage) => Promise<void>

export function createMessageDispatcher(handlers: HandlerMap): MessageDispatcher {
  return async function dispatch(message: ExtensionMessage): Promise<void> {
    const handler = handlers[message.type] as
      | ((m: ExtensionMessage) => Promise<void>)
      | undefined
    if (!handler) return
    await handler(message)
  }
}

export interface MessageRouterLogger {
  debug(msg: string, data?: unknown): void
  info(msg: string, data?: unknown): void
  warn(msg: string, data?: unknown): void
  error(msg: string, data?: unknown): void
}

// Fire-and-forget a message to a tab from an SW onMessage handler. Awaiting
// chrome.tabs.sendMessage inside the handler races the SW idle window in
// stable Chrome and can drop the outbound send — reference implementation
// in references/ uses the same fire-and-forget pattern.
export function forwardToTab(
  sendMessage: (tabId: number, msg: ExtensionMessage) => Promise<unknown>,
  logger: MessageRouterLogger,
  tabId: number,
  msg: ExtensionMessage,
): void {
  try {
    sendMessage(tabId, msg).catch(() => {
      // Silent — broadcasts (e.g. model:status) target every tab, most of which
      // don't have our content script. Logging each failure floods the inspector.
      // Matches references/background/message-router.ts.
    })
  } catch (err) {
    // chrome.tabs.sendMessage throws *synchronously* for an invalid tabId, so
    // the .catch above never attaches and the error escapes the router handler
    // as "router handler failed". Observed with a malformed classify:result.
    logger.warn('forwardToTab: send rejected outright', { tabId, err: String(err) })
  }
}

export interface AttachOptions {
  dispatch: MessageDispatcher
  logger: MessageRouterLogger
}

export function attachRuntimeRouter({ dispatch, logger }: AttachOptions): void {
  // IMPORTANT: use native chrome.runtime.onMessage, not WXT's `browser.runtime`
  // polyfill wrapper. The polyfill's wrapped listener silently fails to fire on
  // MV3 service workers in our setup (raw chrome listeners do fire, polyfill
  // ones don't), which was the root cause of classify:result never being
  // forwarded from the offscreen doc back to the tab.
  //
  // Returning a Promise keeps the SW alive until dispatch resolves.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = (message as { type?: unknown }).type
    // LOG messages are logger output; dispatching them through the router
    // just floods the console since the router's own logs also emit LOGs.
    if (type === 'LOG') return false
    // Debug-level so the stream isn't flooded with every incoming message;
    // the handler-level logs (classify:result → tab, model:installed,
    // classify:error, …) stay at info/warn for visibility at default log
    // level. Enable Verbose in DevTools to re-surface this trace.
    logger.debug('router: received', { type })
    dispatch(message as ExtensionMessage)
      .catch((err) => {
        logger.error('router handler failed', { type, err: String(err) })
      })
      .finally(() => sendResponse())
    // Return true: tells Chrome to keep the worker alive until we call
    // sendResponse (which we do in the finally above, after dispatch settles).
    return true
  })
}
