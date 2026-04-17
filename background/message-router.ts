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
  browser.runtime.onMessage.addListener((message) => {
    dispatch(message as ExtensionMessage).catch((err) => {
      logger.error('router handler failed', { type: (message as { type?: unknown }).type, err: String(err) })
    })
    return false
  })
}
