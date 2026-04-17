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
  error(msg: string, data?: unknown): void
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
