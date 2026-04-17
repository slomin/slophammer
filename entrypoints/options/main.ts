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

installErrorForwarding('options')
const log = createLogger('options')

const root = document.getElementById('install')!
let state: InstallState = initialInstallState

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
  const sentinel = await readSentinelFile()
  if (sentinel) {
    dispatch({ type: 'detected-installed', ...sentinel })
  } else {
    dispatch({ type: 'detected-empty' })
  }
  log.info('options page opened', { initial: state.kind })
}

renderInstall(root, state, handlers)
bootstrap()
