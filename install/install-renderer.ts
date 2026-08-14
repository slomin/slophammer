import type { InstallState, PendingUpdate, UpdateStatus } from './install-ui-state'
import { decideReplace } from './replace-request'

export interface InstallHandlers {
  onInstallHosted(): void
  onFile(file: File): void
  onWipe(): void
  onRetry(): void
  onCheckForUpdates(): void
  onInstallUpdate(pending: PendingUpdate): void
  /**
   * Why a "Replace from .zip…" pick was refused before any install started, or
   * `null` once a valid pick makes an earlier complaint obsolete.
   */
  onReplaceError(message: string | null): void
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

export function renderInstall(root: HTMLElement, state: InstallState, handlers: InstallHandlers): void {
  root.innerHTML = ''
  root.dataset.state = state.kind

  switch (state.kind) {
    case 'detecting':
      root.appendChild(paragraph('Checking for installed model…'))
      return
    case 'empty':
      root.appendChild(buildEmpty(handlers))
      return
    case 'installing':
      if (state.phase === 'downloading') {
        root.appendChild(buildDownloadingCard(state.downloadedBytes, state.totalBytes))
      } else {
        root.appendChild(buildUnpackingCard(state.progress, state.currentFile, state.completed, state.total))
      }
      return
    case 'installed':
      root.appendChild(buildInstalledCard(state, handlers))
      return
    case 'error':
      root.appendChild(buildErrorCard(state.message, handlers))
      return
  }
}

function paragraph(text: string): HTMLElement {
  const p = document.createElement('p')
  p.className = 'muted'
  p.textContent = text
  return p
}

/**
 * Wires a button to a hidden `<input type="file">` and forwards the pick.
 *
 * Every install entry point (drop zone, error card, installed card) needs the
 * same three things: click-to-open, read `files[0]`, and reset `value` so
 * re-picking the *same* file fires `change` again.
 */
function wireFilePicker(
  scope: HTMLElement,
  buttonTestId: string,
  inputTestId: string,
  onPicked: (file: File) => void,
): void {
  const button = scope.querySelector<HTMLButtonElement>(`[data-testid="${buttonTestId}"]`)!
  const input = scope.querySelector<HTMLInputElement>(`[data-testid="${inputTestId}"]`)!

  button.addEventListener('click', (e) => {
    // The drop zone wraps its buttons and handles drop events; keep the click
    // from reaching it so adding a zone-level click handler later cannot
    // double-open the picker.
    e.stopPropagation()
    input.click()
  })
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.value = ''
    if (file) onPicked(file)
  })
}

function buildEmpty(handlers: InstallHandlers): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'drop-zone'
  wrap.dataset.testid = 'drop-zone'
  wrap.innerHTML = `
    <div class="dz-title">Install the Slop Hammer model</div>
    <div class="dz-sub">Download the official model (~400 MB) from Hugging Face, or drop your own <code>.zip</code> bundle.</div>
    <div class="dz-actions">
      <button class="btn primary" type="button" data-testid="install-hosted">Install from Hugging Face</button>
      <button class="btn subtle" type="button" data-testid="install-file">Install from .zip file…</button>
    </div>
    <input type="file" accept=".zip" hidden data-testid="file-input" />
  `
  const hosted = wrap.querySelector<HTMLButtonElement>('[data-testid="install-hosted"]')!
  hosted.addEventListener('click', (e) => {
    e.stopPropagation()
    handlers.onInstallHosted()
  })

  wireFilePicker(wrap, 'install-file', 'file-input', (file) => handlers.onFile(file))

  wrap.addEventListener('dragover', (e) => {
    e.preventDefault()
    wrap.classList.add('dragover')
  })
  wrap.addEventListener('dragleave', () => wrap.classList.remove('dragover'))
  wrap.addEventListener('drop', (e) => {
    e.preventDefault()
    wrap.classList.remove('dragover')
    const file = e.dataTransfer?.files?.[0]
    if (file) handlers.onFile(file)
  })
  return wrap
}

function buildDownloadingCard(downloadedBytes: number, totalBytes: number): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'installing-card'
  wrap.dataset.testid = 'installing-card'
  wrap.dataset.phase = 'downloading'
  const pctNum = totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : 0
  const pctText = totalBytes > 0 ? `${pctNum.toFixed(0)}%` : '…'
  const bytesText =
    totalBytes > 0
      ? `${formatMb(downloadedBytes)} / ${formatMb(totalBytes)} MB`
      : `${formatMb(downloadedBytes)} MB`
  wrap.innerHTML = `
    <div class="row1">
      <div class="title">Downloading model from Hugging Face…</div>
      <div class="pct" data-testid="progress-text">${pctText}</div>
    </div>
    <div class="progress"><div data-testid="progress-fill" style="width:${pctNum.toFixed(1)}%"></div></div>
    <div class="cur-file" data-testid="download-bytes">${bytesText}</div>
  `
  return wrap
}

function buildUnpackingCard(
  progress: number,
  currentFile: string | undefined,
  completed: number,
  total: number,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'installing-card'
  wrap.dataset.testid = 'installing-card'
  wrap.dataset.phase = 'unpacking'
  wrap.innerHTML = `
    <div class="row1">
      <div class="title">Unpacking model…</div>
      <div class="pct" data-testid="progress-text">${progress.toFixed(0)}%</div>
    </div>
    <div class="progress"><div data-testid="progress-fill" style="width:${progress.toFixed(1)}%"></div></div>
    <div class="cur-file" data-testid="current-file">${currentFile ? escapeHtml(currentFile) : 'decompressing…'}</div>
    <div class="count" data-testid="install-count">${
      total > 0 ? `${completed} / ${total} files` : `${completed} files unpacked`
    }</div>
  `
  return wrap
}

function buildInstalledCard(
  state: Extract<InstallState, { kind: 'installed' }>,
  handlers: InstallHandlers,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'install-card'
  wrap.dataset.testid = 'installed-card'
  const when = new Date(state.installedAt).toLocaleString()
  const { updateStatus, pendingUpdate, updateError, replaceError } = state

  wrap.innerHTML = `
    <span class="status" aria-label="installed">✓</span>
    <div class="info">
      <div class="title">Model installed</div>
      <div class="meta">
        <span class="model-chip" data-testid="checkpoint" title="${escapeHtml(state.checkpointId)}">${escapeHtml(state.checkpointId)}</span>
        <span class="dot-sep">·</span>
        <span>${escapeHtml(when)}</span>
      </div>
      <div class="update-row" data-testid="update-row" data-status="${updateStatus}">
        <button class="btn" type="button" data-testid="check-updates"${updateStatus === 'checking' ? ' disabled' : ''}>
          ${updateStatus === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
        <button class="btn" type="button" data-testid="replace-file"${updateStatus === 'checking' ? ' disabled' : ''}>Replace from .zip…</button>
        ${renderUpdateStatusInline(updateStatus, pendingUpdate, updateError)}
        ${
          replaceError
            ? `<span class="update-note error" data-testid="replace-error">${escapeHtml(replaceError)}</span>`
            : ''
        }
      </div>
    </div>
    <button class="btn danger" type="button" data-testid="reinstall">↻ Re-install</button>
    <input type="file" accept=".zip" hidden data-testid="replace-file-input" />
  `
  const checkBtn = wrap.querySelector<HTMLButtonElement>('[data-testid="check-updates"]')!
  checkBtn.addEventListener('click', () => handlers.onCheckForUpdates())

  const installUpdateBtn = wrap.querySelector<HTMLButtonElement>('[data-testid="install-update"]')
  if (installUpdateBtn && pendingUpdate) {
    installUpdateBtn.addEventListener('click', () => handlers.onInstallUpdate(pendingUpdate))
  }

  wireFilePicker(wrap, 'replace-file', 'replace-file-input', (file) => {
    const decision = decideReplace(file.name)
    if (decision.kind === 'reject') {
      handlers.onReplaceError(decision.message)
      return
    }
    // Drop any earlier "not a zip" complaint now, not after confirming — it is
    // already obsolete, and leaving it up while asking about a valid zip reads
    // as if the pick had been refused.
    handlers.onReplaceError(null)
    if (confirm(decision.prompt)) handlers.onFile(file)
  })

  const reinstall = wrap.querySelector<HTMLButtonElement>('[data-testid="reinstall"]')!
  reinstall.addEventListener('click', () => {
    if (confirm('Delete the current model and re-install? This frees ~3 GB.')) {
      handlers.onWipe()
    }
  })
  return wrap
}

function renderUpdateStatusInline(
  status: UpdateStatus,
  pending: PendingUpdate | undefined,
  error: string | undefined,
): string {
  switch (status) {
    case 'idle':
    case 'checking':
      return ''
    case 'up-to-date':
      return `<span class="update-note" data-testid="update-note">Up to date</span>`
    case 'available':
      if (!pending) return ''
      return `
        <span class="update-chip" data-testid="update-chip">Update: ${escapeHtml(pending.filename)}</span>
        <button class="btn primary compact" type="button" data-testid="install-update">Install update</button>
      `
    case 'error':
      return `<span class="update-note error" data-testid="update-error">${escapeHtml(error ?? 'Check failed')}</span>`
  }
}

function buildErrorCard(message: string, handlers: InstallHandlers): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'error-card'
  wrap.dataset.testid = 'error-card'
  wrap.innerHTML = `
    <div class="eh">
      <div class="et">Install failed</div>
      <div class="err-actions">
        <button class="btn" type="button" data-testid="install-from-file">Install from .zip instead</button>
        <button class="btn danger" type="button" data-testid="retry">↻ Retry</button>
      </div>
    </div>
    <div class="em" data-testid="error-message">${escapeHtml(message)}</div>
    <input type="file" accept=".zip" hidden data-testid="error-file-input" />
  `
  const retry = wrap.querySelector<HTMLButtonElement>('[data-testid="retry"]')!
  retry.addEventListener('click', () => handlers.onRetry())

  wireFilePicker(wrap, 'install-from-file', 'error-file-input', (file) => handlers.onFile(file))
  return wrap
}
