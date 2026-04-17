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
  // Returning a Promise keeps the service worker alive until dispatch resolves.
  // A plain `return false` lets Chrome terminate the SW mid-flight, which drops
  // the classify:result → tab forward when the SW was idle.
  browser.runtime.onMessage.addListener((message) => {
    const type = (message as { type?: unknown }).type
    logger.debug('router: received', { type })
    return dispatch(message as ExtensionMessage).catch((err) => {
      logger.error('router handler failed', { type, err: String(err) })
    })
  })
}
