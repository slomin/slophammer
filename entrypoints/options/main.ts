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
import { NOT_A_ZIP_MESSAGE, isZipFilename } from '@/install/replace-request'
import { parseSentinel, type HostedSentinelMeta, type SentinelPayload } from '@/install/sentinel'
import { resolveInstalledHostedState } from '@/install/update-current'
import { MODEL_ROOT_DIR, SENTINEL_NAME } from '@/llm/opfs-model-reader'
import { createLogger, installErrorForwarding } from '@/messaging/logger'
import { resolveTheme } from '@/settings/resolve-theme'
import { createChromeSettingsStore } from '@/settings/settings-store'
import type { Settings } from '@/settings/settings-types'
import {
  V1_MIGRATION_STATE_KEY,
  didMigrationBecomeReady,
  isMigrationBlocking,
  reconcileMigrationUiState,
  type MigrationState,
} from '@/migration/state'
import {
  browserInstalledArtifactReader,
  hasSupportedInstalledArtifact,
} from '@/migration/installed-artifact'
import { renderSettings } from './settings-renderer'

installErrorForwarding('options')
const log = createLogger('options')

const root = document.getElementById('install')!
const migrationRoot = document.getElementById('migration')!
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
let currentMigrationState: MigrationState | null = null

function installIsBlocked(): boolean {
  return isMigrationBlocking(currentMigrationState)
}

function rerenderInstall(): void {
  renderInstall(root, state, handlers, { blocked: installIsBlocked() })
}

function renderMigration(state: MigrationState | null): void {
  const previous = currentMigrationState
  currentMigrationState = reconcileMigrationUiState(currentMigrationState, state)
  const refreshInstalled = didMigrationBecomeReady(previous, currentMigrationState)
  migrationRoot.innerHTML = ''
  rerenderInstall()
  if (!currentMigrationState || currentMigrationState.phase === 'ready') {
    if (refreshInstalled) {
      refreshInstalledState().catch((err) => {
        log.error('failed to refresh installed model after migration', String(err))
      })
    }
    return
  }
  state = currentMigrationState
  const card = document.createElement('div')
  card.className = `migration-card${state.phase === 'error' ? ' error' : ''}`
  card.dataset.testid = 'migration-card'
  const title = document.createElement('strong')
  title.textContent = state.phase === 'error' ? 'Model update needs attention' : 'Updating SlopHammer model'
  const message = document.createElement('div')
  message.dataset.testid = 'migration-message'
  message.textContent = state.phase === 'error'
    ? state.error ?? 'The update failed. Retry to continue; the retired model stays unavailable.'
    : `${state.phase[0]!.toUpperCase()}${state.phase.slice(1)}${state.progress == null ? '…' : ` — ${state.progress}%`}`
  card.appendChild(title)
  card.appendChild(message)
  if (state.phase === 'error') {
    const retry = document.createElement('button')
    retry.className = 'btn danger'
    retry.type = 'button'
    retry.textContent = 'Retry model update'
    retry.addEventListener('click', () => browser.runtime.sendMessage({ type: 'migration:request-resume' }).catch(() => {}))
    card.appendChild(retry)
  }
  migrationRoot.appendChild(card)
}

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
    onCardPlacementChange: (value) => {
      settingsStore.set({ cardPlacement: value }).catch((err) => log.error('set cardPlacement failed', err))
    },
  })
}

function dispatch(action: InstallAction) {
  const next = reduceInstallState(state, action)
  if (next === state) return
  state = next
  rerenderInstall()
}

const handlers = {
  onInstallHosted: () => {
    installFromHosted().catch((err) => {
      log.error('hosted install crashed', err instanceof Error ? err.message : String(err))
    })
  },
  onFile: (file: File) => {
    installFromFile(file).catch((err) => {
      log.error('install crashed', err instanceof Error ? err.message : String(err))
    })
  },
  onWipe: async () => {
    if (installIsBlocked()) return
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
  onReplaceError: (message: string | null) => dispatch({ type: 'replace-error', message }),
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

async function refreshInstalledState(): Promise<void> {
  const sentinel = await readSentinelFile()
  currentSentinel = sentinel
  dispatch(sentinel
    ? {
        type: 'detected-installed',
        checkpointId: sentinel.checkpointId,
        installedAt: sentinel.installedAt,
      }
    : { type: 'detected-empty' })
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
  if (installIsBlocked()) return
  if (!isZipFilename(file.name)) {
    dispatch({ type: 'install-failed', message: NOT_A_ZIP_MESSAGE })
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
  if (installIsBlocked()) return
  // Everything up to runInstall is non-destructive: the installed model is
  // still on disk and still loaded. Only report a failure as a lost install
  // once resetModelDir() has actually run.
  let destructive = false
  const failed = (message: string) => {
    if (!destructive && state.kind === 'installed') {
      dispatch({ type: 'hosted-install-failed', message })
      return
    }
    dispatch({ type: 'install-failed', message })
  }

  try {
    const target = explicit ?? (await resolveHostedTarget())
    if (!target) {
      failed(`Couldn't find a valid model file in ${HOSTED_MODEL.repoId}.`)
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

    destructive = true
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
    failed(friendlyHostedError(message))
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
    lfsOid: HOSTED_MODEL.expectedSha256,
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
  if (installIsBlocked()) return
  if (state.kind !== 'installed') return
  // A replace can finish while this is in flight. The result was computed
  // against the model that was installed at the time, so attaching it to a
  // different one would offer an "update" derived from a model the user has
  // already swapped out.
  const checkedAgainst = currentSentinel
  const stale = () => currentSentinel !== checkedAgainst
  dispatch({ type: 'update-check-started' })
  try {
    const current = await resolveInstalledHostedState({
      sentinel: checkedAgainst,
      hasSupportedInstall: () => hasSupportedInstalledArtifact(browserInstalledArtifactReader()),
    })
    if (stale()) return
    const { hasUpdate, latest } = await checkHostedForUpdate({ current })
    if (stale()) {
      log.info('update check discarded — the installed model changed while it was in flight')
      return
    }
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
    if (stale()) return
    dispatch({ type: 'update-check-failed', message: friendlyHostedError(message) })
  }
}

async function bootstrap() {
  const migrationData = await chrome.storage.local.get(V1_MIGRATION_STATE_KEY)
  renderMigration((migrationData[V1_MIGRATION_STATE_KEY] as MigrationState | undefined) ?? null)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[V1_MIGRATION_STATE_KEY]) return
    renderMigration((changes[V1_MIGRATION_STATE_KEY]!.newValue as MigrationState | undefined) ?? null)
  })
  browser.runtime.sendMessage({ type: 'migration:request-resume' }).catch(() => {})

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

  await refreshInstalledState()
  log.info('options page opened', { initial: state.kind, settings: currentSettings })
}

rerenderInstall()
bootstrap()
