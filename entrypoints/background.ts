import {
  registerContextMenu,
  type ContextMenuLogger,
} from '@/background/context-menu'
import {
  attachRuntimeRouter,
  createMessageDispatcher,
  forwardToTab,
  type HandlerMap,
} from '@/background/message-router'
import { ensureOffscreenDocument } from '@/background/offscreen-manager'
import { createLogger, installErrorForwarding } from '@/messaging/logger'
import type {
  ClassifyErrorMessage,
  ClassifyResultMessage,
  ClassifyRunMessage,
  ModelStatusMessage,
  SelectionTooShortMessage,
  ClassifyStartedMessage,
} from '@/messaging/protocol'

export default defineBackground(() => {
  installErrorForwarding('background')
  const log = createLogger('background')
  log.info('service worker booted')

  const menuLogger: ContextMenuLogger = {
    info: (msg, data) => log.info(msg, data),
    warn: (msg, data) => log.warn(msg, data),
  }

  registerContextMenu({
    logger: menuLogger,
    sendToTab: (tabId, msg: SelectionTooShortMessage | ClassifyStartedMessage) => {
      chrome.tabs.sendMessage(tabId, msg).catch((err) => log.warn('sendToTab failed', String(err)))
    },
    sendToRuntime: (msg: ClassifyRunMessage) => {
      chrome.runtime.sendMessage(msg).catch((err) => log.warn('sendToRuntime failed', String(err)))
    },
    ensureOffscreen: ensureOffscreenDocument,
    newRequestId: () => crypto.randomUUID(),
  })

  const sendTab = (tabId: number, msg: ClassifyResultMessage | ClassifyErrorMessage | ModelStatusMessage) =>
    forwardToTab((id, m) => chrome.tabs.sendMessage(id, m), log, tabId, msg)

  const handlers: HandlerMap = {
    'classify:result': async (msg: ClassifyResultMessage) => {
      log.info('router: classify:result → tab', { requestId: msg.requestId, tabId: msg.tabId })
      sendTab(msg.tabId, msg)
    },
    'classify:error': async (msg: ClassifyErrorMessage) => {
      log.warn('router: classify:error → tab', { requestId: msg.requestId, error: msg.error })
      sendTab(msg.tabId, msg)
    },
    'model:status': async (msg: ModelStatusMessage) => {
      log.debug('router: model:status → broadcast', { status: msg.status })
      const tabs = await chrome.tabs.query({})
      for (const t of tabs) {
        if (t.id != null) sendTab(t.id, msg)
      }
    },
    'model:installed': async () => {
      log.info('router: model:installed → ensuring offscreen and triggering load')
      await ensureOffscreenDocument()
      chrome.runtime.sendMessage({ type: 'model:load' }).catch(() => {})
    },
  }

  attachRuntimeRouter({
    dispatch: createMessageDispatcher(handlers),
    logger: log,
  })

  chrome.runtime.onInstalled.addListener((details) => {
    log.info('onInstalled', { reason: details.reason })
    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }).catch(() => {})
    }
    ensureOffscreenDocument().catch((err) => log.error('ensureOffscreen failed', String(err)))
  })

  chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage().catch((err) => log.error('openOptionsPage failed', String(err)))
  })
})
