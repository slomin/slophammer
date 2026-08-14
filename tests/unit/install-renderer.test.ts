// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInstall, type InstallHandlers } from '@/install/install-renderer'
import type { InstallState } from '@/install/install-ui-state'

const PENDING = {
  filename: 'slop_hammer_0_8b_v0_2.zip',
  lfsOid: 'deadbeef',
  url: 'https://example.test/slop_hammer_0_8b_v0_2.zip',
}

function installed(overrides: Partial<Extract<InstallState, { kind: 'installed' }>> = {}): InstallState {
  return {
    kind: 'installed',
    checkpointId: 'v1',
    installedAt: 1700000000000,
    updateStatus: 'idle',
    ...overrides,
  }
}

function makeHandlers(): InstallHandlers {
  return {
    onInstallHosted: vi.fn(),
    onFile: vi.fn(),
    onWipe: vi.fn(),
    onRetry: vi.fn(),
    onCheckForUpdates: vi.fn(),
    onInstallUpdate: vi.fn(),
  }
}

describe('renderInstall — empty state', () => {
  let root: HTMLElement
  beforeEach(() => {
    document.body.innerHTML = '<section id="install"></section>'
    root = document.getElementById('install')!
  })

  it('renders both CTAs with Hugging Face as the primary', () => {
    renderInstall(root, { kind: 'empty' }, makeHandlers())
    const hosted = root.querySelector<HTMLButtonElement>('[data-testid="install-hosted"]')!
    const file = root.querySelector<HTMLButtonElement>('[data-testid="install-file"]')!
    expect(hosted).toBeTruthy()
    expect(file).toBeTruthy()
    expect(hosted.classList.contains('primary')).toBe(true)
  })

  it('fires onInstallHosted when the Hugging Face button is clicked', () => {
    const handlers = makeHandlers()
    renderInstall(root, { kind: 'empty' }, handlers)
    root.querySelector<HTMLButtonElement>('[data-testid="install-hosted"]')!.click()
    expect(handlers.onInstallHosted).toHaveBeenCalledOnce()
  })
})

describe('renderInstall — installing/downloading', () => {
  let root: HTMLElement
  beforeEach(() => {
    document.body.innerHTML = '<section id="install"></section>'
    root = document.getElementById('install')!
  })

  it('shows MB progress and percent when totalBytes is known', () => {
    const state: InstallState = {
      kind: 'installing',
      phase: 'downloading',
      downloadedBytes: 100 * 1024 * 1024,
      totalBytes: 400 * 1024 * 1024,
    }
    renderInstall(root, state, makeHandlers())
    const card = root.querySelector<HTMLElement>('[data-testid="installing-card"]')!
    expect(card.dataset.phase).toBe('downloading')
    expect(root.querySelector('[data-testid="progress-text"]')!.textContent).toContain('25%')
    expect(root.querySelector('[data-testid="download-bytes"]')!.textContent).toContain('100.0 / 400.0 MB')
  })

  it('shows only downloaded MB when totalBytes is unknown (0)', () => {
    const state: InstallState = {
      kind: 'installing',
      phase: 'downloading',
      downloadedBytes: 5 * 1024 * 1024,
      totalBytes: 0,
    }
    renderInstall(root, state, makeHandlers())
    expect(root.querySelector('[data-testid="progress-text"]')!.textContent).toContain('…')
    expect(root.querySelector('[data-testid="download-bytes"]')!.textContent).toBe('5.0 MB')
  })
})

describe('renderInstall — installing/unpacking', () => {
  let root: HTMLElement
  beforeEach(() => {
    document.body.innerHTML = '<section id="install"></section>'
    root = document.getElementById('install')!
  })

  it('renders file count and current file name', () => {
    const state: InstallState = {
      kind: 'installing',
      phase: 'unpacking',
      progress: 50,
      completed: 3,
      total: 6,
      currentFile: 'tokenizer.json',
    }
    renderInstall(root, state, makeHandlers())
    const card = root.querySelector<HTMLElement>('[data-testid="installing-card"]')!
    expect(card.dataset.phase).toBe('unpacking')
    expect(root.querySelector('[data-testid="progress-text"]')!.textContent).toContain('50%')
    expect(root.querySelector('[data-testid="current-file"]')!.textContent).toContain('tokenizer.json')
    expect(root.querySelector('[data-testid="install-count"]')!.textContent).toContain('3 / 6')
  })
})

describe('renderInstall — installed + update check', () => {
  let root: HTMLElement
  beforeEach(() => {
    document.body.innerHTML = '<section id="install"></section>'
    root = document.getElementById('install')!
  })

  it('renders Check for updates button by default', () => {
    const handlers = makeHandlers()
    renderInstall(root, installed(), handlers)
    const btn = root.querySelector<HTMLButtonElement>('[data-testid="check-updates"]')!
    expect(btn).toBeTruthy()
    expect(btn.disabled).toBe(false)
    btn.click()
    expect(handlers.onCheckForUpdates).toHaveBeenCalledOnce()
  })

  it('disables the button and shows Checking… while update check is in flight', () => {
    renderInstall(root, installed({ updateStatus: 'checking' }), makeHandlers())
    const btn = root.querySelector<HTMLButtonElement>('[data-testid="check-updates"]')!
    expect(btn.disabled).toBe(true)
    expect(btn.textContent?.trim()).toBe('Checking…')
  })

  it('shows "Up to date" when no update is available', () => {
    renderInstall(root, installed({ updateStatus: 'up-to-date' }), makeHandlers())
    expect(root.querySelector('[data-testid="update-note"]')?.textContent).toContain('Up to date')
  })

  it('shows Install update button and chip when an update is available', () => {
    const handlers = makeHandlers()
    renderInstall(
      root,
      installed({ updateStatus: 'available', pendingUpdate: PENDING }),
      handlers,
    )
    expect(root.querySelector('[data-testid="update-chip"]')?.textContent).toContain(PENDING.filename)
    const btn = root.querySelector<HTMLButtonElement>('[data-testid="install-update"]')!
    expect(btn).toBeTruthy()
    btn.click()
    expect(handlers.onInstallUpdate).toHaveBeenCalledWith(PENDING)
  })

  it('shows an error note when the update check fails', () => {
    renderInstall(
      root,
      installed({ updateStatus: 'error', updateError: 'no network' }),
      makeHandlers(),
    )
    expect(root.querySelector('[data-testid="update-error"]')?.textContent).toContain('no network')
  })
})

describe('renderInstall — error state', () => {
  let root: HTMLElement
  beforeEach(() => {
    document.body.innerHTML = '<section id="install"></section>'
    root = document.getElementById('install')!
  })

  it('offers both Retry and "Install from .zip instead" actions', () => {
    const handlers = makeHandlers()
    renderInstall(root, { kind: 'error', message: 'HF unreachable' }, handlers)
    expect(root.querySelector('[data-testid="error-message"]')?.textContent).toContain('HF unreachable')
    root.querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click()
    expect(handlers.onRetry).toHaveBeenCalledOnce()
  })
})

describe('unpacking progress — unknown total', () => {
  it('omits the denominator when the total is not known', () => {
    // The zip is streamed, so the entry count is not knowable up front.
    // Reporting completed as the total made this always read "n of n".
    const root = document.createElement('div')
    renderInstall(root, { kind: 'installing', phase: 'unpacking', progress: 42, completed: 3, total: 0 }, makeHandlers())
    const text = root.querySelector('[data-testid="install-count"]')!.textContent!
    expect(text).toContain('3 files unpacked')
    expect(text).not.toContain('/')
  })
})
