import { FflateZipReader } from '@/install/fflate-zip-reader'
import { runInstall } from '@/install/install-orchestrator'
import { renderInstall } from '@/install/install-renderer'
import {
  initialInstallState,
  reduceInstallState,
  type InstallAction,
  type InstallState,
} from '@/install/install-ui-state'
import { ChromeStorageMarker, OpfsWriter, wipeModel } from '@/install/opfs-writer'
import { parseSentinel } from '@/install/sentinel'
import { MODEL_ROOT_DIR, SENTINEL_NAME } from '@/llm/opfs-model-reader'
import { createLogger, installErrorForwarding } from '@/messaging/logger'
import { resolveTheme } from '@/settings/resolve-theme'
import { createChromeSettingsStore } from '@/settings/settings-store'
import type { Settings } from '@/settings/settings-types'
import { renderSettings } from './settings-renderer'

installErrorForwarding('options')
const log = createLogger('options')

const root = document.getElementById('install')!
const settingsRoot = document.getElementById('settings')!
const settingsStore = createChromeSettingsStore()
const systemDarkMql = window.matchMedia('(prefers-color-scheme: dark)')
let currentSettings: Settings | null = null
let state: InstallState = initialInstallState

function applyTheme(settings: Settings) {
  const resolved = resolveTheme(settings.theme, systemDarkMql.matches)
  document.documentElement.dataset.theme = resolved
}

function rerenderSettings(settings: Settings) {
  renderSettings(settingsRoot, settings, {
    onResultDetailChange: (value) => {
      settingsStore.set({ resultDetail: value }).catch((err) => log.error('set resultDetail failed', err))
    },
    onThemeChange: (value) => {
      settingsStore.set({ theme: value }).catch((err) => log.error('set theme failed', err))
    },
  })
}

function dispatch(action: InstallAction) {
  const next = reduceInstallState(state, action)
  if (next === state) return
  state = next
  renderInstall(root, state, handlers)
}

const handlers = {
  onFile: (file: File) => installFromFile(file),
  onWipe: async () => {
    await wipeModel()
    log.info('model wiped')
    dispatch({ type: 'wipe' })
  },
  onRetry: () => dispatch({ type: 'retry' }),
}

async function readSentinelFile(): Promise<{ checkpointId: string; installedAt: number } | null> {
  try {
    const rootDir = await navigator.storage.getDirectory()
    const shDir = await rootDir.getDirectoryHandle(MODEL_ROOT_DIR, { create: false })
    const handle = await shDir.getFileHandle(SENTINEL_NAME, { create: false })
    const text = await (await handle.getFile()).text()
    const parsed = parseSentinel(text)
    if (!parsed) return null
    return { checkpointId: parsed.checkpointId, installedAt: parsed.installedAt }
  } catch {
    return null
  }
}

async function installFromFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    dispatch({ type: 'install-failed', message: 'Please pick a .zip file.' })
    return
  }
  log.info('install start', { name: file.name, size: file.size })
  dispatch({ type: 'file-picked' })

  try {
    const contract = await runInstall({
      reader: new FflateZipReader(file),
      opfs: new OpfsWriter(),
      marks: new ChromeStorageMarker(),
      onProgress: (p) =>
        dispatch({
          type: 'progress',
          progress: p.fraction * 100,
          currentFile: p.currentFile,
          completed: p.completedFiles,
          total: p.totalFiles,
        }),
    })
    const checkpointId = contract.version ?? contract.base_model ?? 'unknown'
    dispatch({ type: 'install-success', checkpointId, installedAt: Date.now() })
    log.info('install succeeded', { checkpointId })
    browser.runtime.sendMessage({ type: 'model:installed' }).catch(() => {})
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('install failed', message)
    dispatch({ type: 'install-failed', message })
  }
}

async function bootstrap() {
  currentSettings = await settingsStore.get()
  applyTheme(currentSettings)
  rerenderSettings(currentSettings)

  settingsStore.subscribe((next) => {
    currentSettings = next
    applyTheme(next)
    rerenderSettings(next)
  })
  systemDarkMql.addEventListener('change', () => {
    if (currentSettings) applyTheme(currentSettings)
  })

  const sentinel = await readSentinelFile()
  if (sentinel) {
    dispatch({ type: 'detected-installed', ...sentinel })
  } else {
    dispatch({ type: 'detected-empty' })
  }
  log.info('options page opened', { initial: state.kind, settings: currentSettings })
}

renderInstall(root, state, handlers)
bootstrap()
