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
  p.className = 'muted'
  p.textContent = text
  return p
}

function buildDropZone(handlers: InstallHandlers): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'drop-zone'
  wrap.dataset.testid = 'drop-zone'
  wrap.innerHTML = `
    <div class="dz-title">Install the Slop Hammer model</div>
    <div class="dz-sub">Drop the <code>.zip</code> bundle here, or browse to pick it.</div>
    <button class="btn primary" type="button" data-testid="pick-button">Choose .zip…</button>
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
  wrap.className = 'installing-card'
  wrap.dataset.testid = 'installing-card'
  wrap.innerHTML = `
    <div class="row1">
      <div class="title">Installing model…</div>
      <div class="pct" data-testid="progress-text">${progress.toFixed(0)}%</div>
    </div>
    <div class="progress"><div data-testid="progress-fill" style="width:${progress.toFixed(1)}%"></div></div>
    <div class="cur-file" data-testid="current-file">${currentFile ? escapeHtml(currentFile) : 'decompressing…'}</div>
    <div class="count" data-testid="install-count">${completed} / ${total} files</div>
  `
  return wrap
}

function buildInstalledCard(
  checkpointId: string,
  installedAt: number,
  handlers: InstallHandlers,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'install-card'
  wrap.dataset.testid = 'installed-card'
  const when = new Date(installedAt).toLocaleString()
  wrap.innerHTML = `
    <span class="status" aria-label="installed">✓</span>
    <div class="info">
      <div class="title">Model installed</div>
      <div class="meta">
        <span class="model-chip" data-testid="checkpoint" title="${escapeHtml(checkpointId)}">${escapeHtml(checkpointId)}</span>
        <span class="dot-sep">·</span>
        <span>${escapeHtml(when)}</span>
      </div>
    </div>
    <button class="btn danger" type="button" data-testid="reinstall">↻ Re-install</button>
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
  wrap.className = 'error-card'
  wrap.dataset.testid = 'error-card'
  wrap.innerHTML = `
    <div class="eh">
      <div class="et">Install failed</div>
      <button class="btn danger" type="button" data-testid="retry">↻ Retry</button>
    </div>
    <div class="em" data-testid="error-message">${escapeHtml(message)}</div>
  `
  const button = wrap.querySelector<HTMLButtonElement>('[data-testid="retry"]')!
  button.addEventListener('click', () => handlers.onRetry())
  return wrap
}
