import {
  registerContextMenu,
  type ContextMenuLogger,
} from '@/background/context-menu'
import {
  attachRuntimeRouter,
  createMessageDispatcher,
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

  const handlers: HandlerMap = {
    'classify:result': async (msg: ClassifyResultMessage) => {
      log.info('router: classify:result → tab', { requestId: msg.requestId, tabId: msg.tabId })
      // Await so the service worker stays alive until the tab actually receives it.
      await chrome.tabs.sendMessage(msg.tabId, msg).catch((err) =>
        log.warn('tabs.sendMessage(classify:result) failed', String(err)),
      )
    },
    'classify:error': async (msg: ClassifyErrorMessage) => {
      log.warn('router: classify:error → tab', { requestId: msg.requestId, error: msg.error })
      await chrome.tabs.sendMessage(msg.tabId, msg).catch((err) =>
        log.warn('tabs.sendMessage(classify:error) failed', String(err)),
      )
    },
    'model:status': async (msg: ModelStatusMessage) => {
      log.debug('router: model:status → broadcast', { status: msg.status })
      const tabs = await chrome.tabs.query({})
      await Promise.all(
        tabs.flatMap((t) => (t.id != null ? [chrome.tabs.sendMessage(t.id, msg).catch(() => {})] : [])),
      )
    },
    'model:installed': async () => {
      log.info('router: model:installed → ensuring offscreen and triggering load')
      await ensureOffscreenDocument()
      await chrome.runtime.sendMessage({ type: 'model:load' }).catch(() => {})
    },
  }

  attachRuntimeRouter({
    dispatch: createMessageDispatcher(handlers),
    logger: log,
  })

  chrome.runtime.onInstalled.addListener(async (details) => {
    log.info('onInstalled', { reason: details.reason })
    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }).catch(() => {})
    }
    ensureOffscreenDocument().catch((err) => log.error('ensureOffscreen failed', String(err)))
    // After install or reload, existing tabs still have the OLD (or no)
    // content script. Re-inject into every matching tab so the user doesn't
    // need to refresh pages after `chrome.runtime.reload()`.
    try {
      const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
      for (const tab of tabs) {
        if (tab.id == null) continue
        chrome.scripting
          .executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['content-scripts/content.js'],
          })
          .catch((err) => log.debug('re-inject content script failed', { tabId: tab.id, err: String(err) }))
      }
    } catch (err) {
      log.warn('content-script re-injection query failed', String(err))
    }
  })

  chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage().catch((err) => log.error('openOptionsPage failed', String(err)))
  })
})
