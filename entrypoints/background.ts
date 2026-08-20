import {
  registerContextMenu,
  type ContextMenuLogger,
} from '@/background/context-menu'
import { ensureTabContentScript } from '@/background/content-script-recovery'
import {
  applyMigrationActionSignal,
  migrationActionKind,
  type MigrationActionKind,
} from '@/background/migration-action'
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
import { PRODUCT_NAME } from '@/shared/product'
import { handleV1InstalledLifecycle } from '@/migration/background-lifecycle'
import { applyMigrationStorageWrite, migrationStorageAck } from '@/migration/storage-write'
import { MIGRATION_STORAGE_PORT, type MigrationStorageRequest } from '@/migration/storage-rpc'
import {
  V1_DATA_GENERATION_KEY,
  V1_MIGRATION_INTENT_KEY,
  V1_MIGRATION_STATE_KEY,
  isMigrationBlocking,
  migrationState,
  shouldRecoverV1Migration,
  type MigrationState,
} from '@/migration/state'

export default defineBackground(() => {
  installErrorForwarding('background')
  const log = createLogger('background')
  log.info('service worker booted')

  const menuLogger: ContextMenuLogger = {
    info: (msg, data) => log.info(msg, data),
    warn: (msg, data) => log.warn(msg, data),
  }

  const DEFAULT_ACTION_TITLE = `${PRODUCT_NAME} — click to open options`
  const CONTENT_SCRIPT_FILE = 'content-scripts/content.js'
  let currentMigrationSignal: MigrationState | null = null
  let appliedMigrationActionKind: MigrationActionKind | null = null

  async function setMigrationSignal(state: MigrationState): Promise<void> {
    currentMigrationSignal = state
    const kind = migrationActionKind(state)
    if (kind === appliedMigrationActionKind) return
    await applyMigrationActionSignal({
      queryTabIds: async () => (await chrome.tabs.query({}))
        .flatMap((tab) => tab.id == null ? [] : [tab.id]),
      setBadgeText: (details) => chrome.action.setBadgeText(
        details as chrome.action.BadgeTextDetails,
      ),
      setBadgeBackgroundColor: (details) => chrome.action.setBadgeBackgroundColor(details),
      setTitle: (details) => chrome.action.setTitle(details),
    }, state, DEFAULT_ACTION_TITLE)
    appliedMigrationActionKind = kind
  }

  async function resumeMigration(): Promise<void> {
    const stored = await chrome.storage.local.get([
      V1_MIGRATION_STATE_KEY,
      V1_MIGRATION_INTENT_KEY,
      V1_DATA_GENERATION_KEY,
    ])
    const state = stored[V1_MIGRATION_STATE_KEY] as MigrationState | undefined
    if (state) await setMigrationSignal(state)
    if (!isMigrationBlocking(state) && shouldRecoverV1Migration({
      intent: stored[V1_MIGRATION_INTENT_KEY],
      currentVersion: chrome.runtime.getManifest().version,
      completedGeneration: stored[V1_DATA_GENERATION_KEY] as number | undefined,
    })) {
      await startMigration()
      return
    }
    await ensureOffscreenDocument()
    chrome.runtime.sendMessage({
      type: isMigrationBlocking(state) ? 'migration:start' : 'migration:resume',
    }).catch(() => {})
  }

  async function startMigration(): Promise<void> {
    const pending = migrationState('pending')
    await chrome.storage.local.set({ [V1_MIGRATION_STATE_KEY]: pending })
    await setMigrationSignal(pending)
    await ensureOffscreenDocument()
    chrome.runtime.sendMessage({ type: 'migration:start' }).catch(() => {})
  }

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
    if (!isMigrationBlocking(currentMigrationSignal)) {
      chrome.action.setBadgeText({ text: '', tabId }).catch(() => {})
      chrome.action.setTitle({ title: DEFAULT_ACTION_TITLE, tabId }).catch(() => {})
    }
    return ensureTabContentScript({
      ping: (id) => chrome.tabs.sendMessage(id, { type: 'ping' }),
      inject: (id) => chrome.scripting.executeScript({
        target: { tabId: id },
        files: [CONTENT_SCRIPT_FILE],
      }),
      onInjected: (id) => log.info('injected content script on demand', { tabId: id }),
      onFailure: (id, err) => log.warn('cannot inject content script', {
        tabId: id,
        err: String(err),
      }),
    }, tabId, options)
  }

  function signalUnreachable(tabId: number): void {
    if (isMigrationBlocking(currentMigrationSignal)) {
      log.info('tab unreachable while migration signal is active', { tabId })
      return
    }
    log.warn('tab unreachable, signalling on the toolbar icon', { tabId })
    chrome.action.setBadgeText({ text: '!', tabId }).catch(() => {})
    chrome.action.setBadgeBackgroundColor({ color: '#c0392b', tabId }).catch(() => {})
    chrome.action
      .setTitle({ title: `${PRODUCT_NAME} cannot run on this page. Try reloading it first.`, tabId })
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
    ensureOffscreen: resumeMigration,
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
    'migration:status': async (msg) => {
      await chrome.storage.local.set({ [V1_MIGRATION_STATE_KEY]: msg.state })
      await setMigrationSignal(msg.state)
    },
    'migration:request-resume': async () => {
      await resumeMigration()
    },
  }

  attachRuntimeRouter({
    dispatch: createMessageDispatcher(handlers),
    logger: log,
  })

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== MIGRATION_STORAGE_PORT) return
    const respond = (response: unknown) => {
      try { port.postMessage(response) } catch { /* requester disconnected */ }
    }
    port.onMessage.addListener((raw: unknown) => {
      const request = raw as MigrationStorageRequest
      void (async () => {
        if (request.type === 'migration:storage-clear-request') {
          log.info('migration: clearing extension storage')
          await chrome.storage.local.clear()
          await chrome.storage.session?.clear?.()
          const wiping = migrationState('wiping')
          await chrome.storage.local.set({ [V1_MIGRATION_STATE_KEY]: wiping })
          await setMigrationSignal(wiping)
          return migrationStorageAck('cleared')
        }
        if (request.type === 'migration:storage-write-request') {
          const operation = await applyMigrationStorageWrite(request, {
            set: (values) => chrome.storage.local.set(values),
            remove: (key) => chrome.storage.local.remove(key),
          })
          return migrationStorageAck(operation)
        }
        throw new Error('Unsupported migration storage request.')
      })().then(
        respond,
        (error) => respond({
          migrationStorageError: error instanceof Error ? error.message : String(error),
        }),
      )
    })
  })

  chrome.runtime.onInstalled.addListener((details) => {
    const currentVersion = chrome.runtime.getManifest().version
    log.info('onInstalled', { reason: details.reason, previousVersion: details.previousVersion })
    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }).catch(() => {})
    }
    void handleV1InstalledLifecycle(details, currentVersion, {
      persistIntent: (intent) => chrome.storage.local.set({ [V1_MIGRATION_INTENT_KEY]: intent }),
      async readCompletedGeneration() {
        const stored = await chrome.storage.local.get(V1_DATA_GENERATION_KEY)
        return stored[V1_DATA_GENERATION_KEY] as number | undefined
      },
      clearIntent: () => chrome.storage.local.remove(V1_MIGRATION_INTENT_KEY),
      startMigration,
      resumeMigration,
    }).catch((err) => log.error('onInstalled lifecycle failed', String(err)))
  })

  chrome.runtime.onStartup.addListener(() => {
    resumeMigration().catch((err) => log.error('migration startup resume failed', String(err)))
  })

  chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage().catch((err) => log.error('openOptionsPage failed', String(err)))
  })
})
