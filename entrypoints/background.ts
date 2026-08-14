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

  const DEFAULT_ACTION_TITLE = 'Slop Hammer — click to open options'
  const CONTENT_SCRIPT_FILE = 'content-scripts/content.js'

  // A tab can lack a live content script for two everyday reasons: the page
  // is one Chrome refuses to inject into, or the tab was already open when
  // the extension updated, which orphans the old script. Both used to fail
  // silently. Probe first, inject on demand (a user gesture makes this safe —
  // see WORKFLOW.md on why onInstalled injection is not), and report failure.
  async function ensureContentScript(
    tabId: number,
    options: { inject: boolean } = { inject: true },
  ): Promise<boolean> {
    // Scoped to the tab: a warning raised for one tab must not follow the user
    // to another, and a success here must not clear another tab's warning.
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {})
    chrome.action.setTitle({ title: DEFAULT_ACTION_TITLE, tabId }).catch(() => {})
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'ping' })
      return true
    } catch {
      // No live listener — fall through and inject one.
    }
    if (!options.inject) return false
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] })
      log.info('injected content script on demand', { tabId })
      return true
    } catch (err) {
      log.warn('cannot inject content script', { tabId, err: String(err) })
      return false
    }
  }

  function signalUnreachable(tabId: number): void {
    log.warn('tab unreachable, signalling on the toolbar icon', { tabId })
    chrome.action.setBadgeText({ text: '!', tabId }).catch(() => {})
    chrome.action.setBadgeBackgroundColor({ color: '#c0392b', tabId }).catch(() => {})
    chrome.action
      .setTitle({ title: 'Slop Hammer cannot run on this page. Try reloading it first.', tabId })
      .catch(() => {})
  }

  registerContextMenu({
    logger: menuLogger,
    ensureContentScript,
    onUnreachable: signalUnreachable,
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
