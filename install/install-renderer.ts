import type { InstallState } from './install-ui-state'

export interface InstallHandlers {
  onFile(file: File): void
  onWipe(): void
  onRetry(): void
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

export function renderInstall(root: HTMLElement, state: InstallState, handlers: InstallHandlers): void {
  root.innerHTML = ''
  root.dataset.state = state.kind

  switch (state.kind) {
    case 'detecting':
      root.appendChild(paragraph('Checking for installed model…'))
      return
    case 'empty':
      root.appendChild(buildDropZone(handlers))
      return
    case 'installing':
      root.appendChild(buildInstallingCard(state.progress, state.currentFile, state.completed, state.total))
      return
    case 'installed':
      root.appendChild(buildInstalledCard(state.checkpointId, state.installedAt, handlers))
      return
    case 'error':
      root.appendChild(buildErrorCard(state.message, handlers))
      return
  }
}

function paragraph(text: string): HTMLElement {
  const p = document.createElement('p')
  p.textContent = text
  return p
}

function buildDropZone(handlers: InstallHandlers): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'drop-zone'
  wrap.dataset.testid = 'drop-zone'
  wrap.innerHTML = `
    <h2>Drop your model zip here</h2>
    <p class="muted">Expected: a zip produced by the Slop Hammer training pipeline (≈2.7 GB).
    The contents decompress into this browser's private storage (OPFS).</p>
    <button class="btn" type="button" data-testid="pick-button">Choose file…</button>
    <input type="file" accept=".zip" hidden data-testid="file-input" />
  `
  const input = wrap.querySelector<HTMLInputElement>('[data-testid="file-input"]')!
  const button = wrap.querySelector<HTMLButtonElement>('[data-testid="pick-button"]')!

  button.addEventListener('click', (e) => {
    e.stopPropagation()
    input.click()
  })
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) handlers.onFile(file)
    input.value = ''
  })
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

function buildInstallingCard(
  progress: number,
  currentFile: string | undefined,
  completed: number,
  total: number,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'card'
  wrap.dataset.testid = 'installing-card'
  wrap.innerHTML = `
    <h2>Installing model…</h2>
    <p class="muted" data-testid="install-subline">
      ${completed}/${total} files · ${currentFile ? `writing <code>${escapeHtml(currentFile)}</code>` : 'decompressing'}
    </p>
    <div class="progress-bar"><div data-testid="progress-fill" style="width:${progress.toFixed(1)}%"></div></div>
    <p class="muted" data-testid="progress-text">${progress.toFixed(1)}%</p>
    <p class="hint">This takes ~1–3 minutes on a fast disk. Don't close this tab.</p>
  `
  return wrap
}

function buildInstalledCard(
  checkpointId: string,
  installedAt: number,
  handlers: InstallHandlers,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'card installed'
  wrap.dataset.testid = 'installed-card'
  const when = new Date(installedAt).toLocaleString()
  wrap.innerHTML = `
    <div class="check" aria-hidden="true">✓</div>
    <div class="info">
      <h2>Model installed</h2>
      <p class="muted" data-testid="checkpoint"><code>${escapeHtml(checkpointId)}</code> · ${escapeHtml(when)}</p>
    </div>
    <button class="btn danger" type="button" data-testid="reinstall">Re-install</button>
  `
  const button = wrap.querySelector<HTMLButtonElement>('[data-testid="reinstall"]')!
  button.addEventListener('click', () => {
    if (confirm('Delete the current model and re-install? This frees ~3 GB.')) {
      handlers.onWipe()
    }
  })
  return wrap
}

function buildErrorCard(message: string, handlers: InstallHandlers): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'card error'
  wrap.dataset.testid = 'error-card'
  wrap.innerHTML = `
    <h2>Install failed</h2>
    <p data-testid="error-message">${escapeHtml(message)}</p>
    <button class="btn" type="button" data-testid="retry">Try again</button>
  `
  const button = wrap.querySelector<HTMLButtonElement>('[data-testid="retry"]')!
  button.addEventListener('click', () => handlers.onRetry())
  return wrap
}
