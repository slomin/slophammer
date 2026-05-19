import { FflateZipReader } from '@/install/fflate-zip-reader'
import { checkHostedForUpdate } from '@/install/hf-update-checker'
import { HOSTED_MODEL, resolveHostedZipUrl } from '@/install/hosted-model-config'
import { fetchZipWithProgress } from '@/install/hosted-model-fetcher'
import {
  runInstall,
  type RunInstallArgs,
} from '@/install/install-orchestrator'
import { renderInstall } from '@/install/install-renderer'
import {
  initialInstallState,
  reduceInstallState,
  type InstallAction,
  type InstallState,
  type PendingUpdate,
} from '@/install/install-ui-state'
import { ChromeStorageMarker, OpfsWriter, wipeModel } from '@/install/opfs-writer'
import { parseSentinel, type HostedSentinelMeta, type SentinelPayload } from '@/install/sentinel'
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
const versionEl = document.querySelector<HTMLElement>('[data-testid="page-version"]')
if (versionEl) {
  const v = browser.runtime.getManifest().version
  versionEl.textContent = `v${v}`
}
const settingsStore = createChromeSettingsStore()
const systemDarkMql = window.matchMedia('(prefers-color-scheme: dark)')
let currentSettings: Settings | null = null
let state: InstallState = initialInstallState
let currentSentinel: SentinelPayload | null = null

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
  onInstallHosted: () => {
    installFromHosted().catch((err) => {
      log.error('hosted install crashed', err instanceof Error ? err.message : String(err))
    })
  },
  onFile: (file: File) => installFromFile(file),
  onWipe: async () => {
    await wipeModel()
    currentSentinel = null
    log.info('model wiped')
    dispatch({ type: 'wipe' })
  },
  onRetry: () => dispatch({ type: 'retry' }),
  onCheckForUpdates: () => {
    runUpdateCheck().catch((err) => {
      log.error('update check crashed', err instanceof Error ? err.message : String(err))
    })
  },
  onInstallUpdate: (pending: PendingUpdate) => {
    installFromHosted(pending).catch((err) => {
      log.error('update install crashed', err instanceof Error ? err.message : String(err))
    })
  },
}

async function readSentinelFile(): Promise<SentinelPayload | null> {
  try {
    const rootDir = await navigator.storage.getDirectory()
    const shDir = await rootDir.getDirectoryHandle(MODEL_ROOT_DIR, { create: false })
    const handle = await shDir.getFileHandle(SENTINEL_NAME, { create: false })
    const text = await (await handle.getFile()).text()
    return parseSentinel(text)
  } catch {
    return null
  }
}

async function runPostInstall(sentinel: SentinelPayload) {
  currentSentinel = sentinel
  dispatch({
    type: 'install-success',
    checkpointId: sentinel.checkpointId,
    installedAt: sentinel.installedAt,
  })
  log.info('install succeeded', { checkpointId: sentinel.checkpointId, source: sentinel.source })
  browser.runtime.sendMessage({ type: 'model:installed' }).catch(() => {})
}

async function installFromFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    dispatch({ type: 'install-failed', message: 'Please pick a .zip file.' })
    return
  }
  log.info('install start (manual)', { name: file.name, size: file.size })
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
    await runPostInstall({
      checkpointId,
      installedAt: Date.now(),
      contractFile: 'slop_hammer_contract.json',
      source: 'manual',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('install failed', message)
    dispatch({ type: 'install-failed', message })
  }
}

async function installFromHosted(explicit?: PendingUpdate) {
  try {
    const target = explicit ?? (await resolveHostedTarget())
    if (!target) {
      dispatch({
        type: 'install-failed',
        message: `Couldn't find a valid model file in ${HOSTED_MODEL.repoId}.`,
      })
      return
    }

    log.info('install start (hosted)', { filename: target.filename })
    dispatch({ type: 'hosted-download-started' })

    const { blob } = await fetchZipWithProgress({
      url: target.url,
      expectedSha256: target.lfsOid,
      onProgress: (p) =>
        dispatch({
          type: 'hosted-download-progress',
          downloadedBytes: p.downloadedBytes,
          totalBytes: p.totalBytes,
        }),
    })

    dispatch({ type: 'hosted-download-done' })

    const hostedMeta: HostedSentinelMeta = {
      filename: target.filename,
      lfsOid: target.lfsOid,
      url: target.url,
    }

    const args: RunInstallArgs = {
      reader: new FflateZipReader(new File([blob], target.filename, { type: 'application/zip' })),
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
      hostedMeta,
    }

    const contract = await runInstall(args)
    const checkpointId = contract.version ?? contract.base_model ?? 'unknown'

    await runPostInstall({
      checkpointId,
      installedAt: Date.now(),
      contractFile: 'slop_hammer_contract.json',
      source: 'hosted',
      hosted: hostedMeta,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('hosted install failed', message)
    dispatch({ type: 'install-failed', message: friendlyHostedError(message) })
  }
}

async function resolveHostedTarget(): Promise<PendingUpdate | null> {
  try {
    const result = await checkHostedForUpdate({ current: null })
    if (result.latest) {
      return { filename: result.latest.filename, lfsOid: result.latest.lfsOid, url: result.latest.url }
    }
  } catch (err) {
    log.warn('tree lookup failed, falling back to pinned filename', err instanceof Error ? err.message : String(err))
  }
  return {
    filename: HOSTED_MODEL.currentFilename,
    lfsOid: '',
    url: resolveHostedZipUrl(HOSTED_MODEL.currentFilename),
  }
}

function friendlyHostedError(message: string): string {
  if (/Failed to fetch|NetworkError|ERR_|ECONN|ENOTFOUND/i.test(message)) {
    return `Couldn't reach Hugging Face (${message}). Check your connection and retry, or install from a .zip file.`
  }
  return message
}

async function runUpdateCheck() {
  if (state.kind !== 'installed') return
  const current = currentSentinel?.hosted
    ? { filename: currentSentinel.hosted.filename, lfsOid: currentSentinel.hosted.lfsOid }
    : null
  dispatch({ type: 'update-check-started' })
  try {
    const { hasUpdate, latest } = await checkHostedForUpdate({ current })
    if (!hasUpdate || !latest) {
      dispatch({ type: 'update-check-up-to-date' })
      return
    }
    dispatch({
      type: 'update-check-available',
      pendingUpdate: { filename: latest.filename, lfsOid: latest.lfsOid, url: latest.url },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('update check failed', message)
    dispatch({ type: 'update-check-failed', message: friendlyHostedError(message) })
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
    currentSentinel = sentinel
    dispatch({
      type: 'detected-installed',
      checkpointId: sentinel.checkpointId,
      installedAt: sentinel.installedAt,
    })
  } else {
    dispatch({ type: 'detected-empty' })
  }
  log.info('options page opened', { initial: state.kind, settings: currentSettings })
}

renderInstall(root, state, handlers)
bootstrap()
