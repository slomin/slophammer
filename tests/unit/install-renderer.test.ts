// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInstall, type InstallHandlers } from '@/install/install-renderer'
import type { InstallState } from '@/install/install-ui-state'
import { NOT_A_ZIP_MESSAGE } from '@/install/replace-request'

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
    onReplaceError: vi.fn(),
  }
}

/**
 * happy-dom does not implement `window.confirm`, so there is no function to spy
 * on — it has to be assigned. Returns the mock so callers can assert on the
 * prompt text and on whether it was reached at all.
 */
function stubConfirm(answer: boolean) {
  const mock = vi.fn((_message?: string) => answer)
  Object.defineProperty(window, 'confirm', { value: mock, configurable: true, writable: true })
  return mock
}

// Without this the last stub's answer leaks into every later test in the file —
// a declining dialog would silently suppress actions the test never mentions.
afterEach(() => {
  Reflect.deleteProperty(window, 'confirm')
})

/**
 * Pick a file on a hidden input. `input.files` is read-only under happy-dom, so
 * it has to be defined onto the element before the change event is dispatched.
 */
function pick(input: HTMLInputElement, filename: string): File {
  const file = new File(['zip bytes'], filename, { type: 'application/zip' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  return file
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

  it('hands a picked file to onFile without confirming', () => {
    // First-time install has nothing to overwrite, so it must not prompt.
    const confirmSpy = stubConfirm(true)
    const handlers = makeHandlers()
    renderInstall(root, { kind: 'empty' }, handlers)
    const input = root.querySelector<HTMLInputElement>('[data-testid="file-input"]')!
    const file = pick(input, 'model.zip')
    expect(handlers.onFile).toHaveBeenCalledWith(file)
    expect(confirmSpy).not.toHaveBeenCalled()
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

  it('hands a picked file to onFile', () => {
    const handlers = makeHandlers()
    renderInstall(root, { kind: 'error', message: 'HF unreachable' }, handlers)
    const input = root.querySelector<HTMLInputElement>('[data-testid="error-file-input"]')!
    const file = pick(input, 'model.zip')
    expect(handlers.onFile).toHaveBeenCalledWith(file)
  })
})

describe('renderInstall — replacing an installed model', () => {
  let root: HTMLElement
  beforeEach(() => {
    document.body.innerHTML = '<section id="install"></section>'
    root = document.getElementById('install')!
  })

  function replaceInput(): HTMLInputElement {
    return root.querySelector<HTMLInputElement>('[data-testid="replace-file-input"]')!
  }

  it('offers a Replace from .zip action on the installed card', () => {
    renderInstall(root, installed(), makeHandlers())
    const btn = root.querySelector<HTMLButtonElement>('[data-testid="replace-file"]')!
    expect(btn).toBeTruthy()
    expect(btn.textContent).toContain('.zip')
  })

  it('installs the picked zip once the overwrite is confirmed', () => {
    const confirmSpy = stubConfirm(true)
    const handlers = makeHandlers()
    renderInstall(root, installed(), handlers)
    const file = pick(replaceInput(), 'slop_hammer_0_8b_v0_4_600.zip')
    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(confirmSpy.mock.calls[0]![0]).toContain('slop_hammer_0_8b_v0_4_600.zip')
    expect(handlers.onFile).toHaveBeenCalledWith(file)
  })

  it('does nothing when the overwrite is declined', () => {
    const confirmSpy = stubConfirm(false)
    const handlers = makeHandlers()
    renderInstall(root, installed(), handlers)
    pick(replaceInput(), 'model.zip')
    expect(handlers.onFile).not.toHaveBeenCalled()
    expect(handlers.onReplaceError).toHaveBeenCalledWith(null)
  })

  it('refuses a non-zip before asking to confirm, and never starts an install', () => {
    const confirmSpy = stubConfirm(true)
    const handlers = makeHandlers()
    renderInstall(root, installed(), handlers)
    pick(replaceInput(), 'notes.txt')
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(handlers.onFile).not.toHaveBeenCalled()
    expect(handlers.onReplaceError).toHaveBeenCalledWith(NOT_A_ZIP_MESSAGE)
  })

  it('shows a refused pick inline, keeping the installed card and its checkpoint', () => {
    // Not the error card: the model is still installed and still loaded.
    renderInstall(root, installed({ replaceError: NOT_A_ZIP_MESSAGE }), makeHandlers())
    expect(root.querySelector('[data-testid="installed-card"]')).toBeTruthy()
    expect(root.querySelector('[data-testid="checkpoint"]')?.textContent).toContain('v1')
    expect(root.querySelector('[data-testid="replace-error"]')?.textContent).toContain(
      NOT_A_ZIP_MESSAGE,
    )
  })

  it('shows no replace error by default', () => {
    renderInstall(root, installed(), makeHandlers())
    expect(root.querySelector('[data-testid="replace-error"]')).toBeNull()
  })

  it('clears the input so the same file can be picked twice', () => {
    // A refused pick preserves state identity, so `dispatch` skips the render
    // and the input element survives. Without the reset, re-picking the very
    // same file fires no second change event and the card looks frozen.
    const handlers = makeHandlers()
    renderInstall(root, installed(), handlers)
    const input = replaceInput()
    pick(input, 'notes.txt')
    pick(input, 'notes.txt')
    expect(handlers.onReplaceError).toHaveBeenNthCalledWith(1, NOT_A_ZIP_MESSAGE)
    expect(handlers.onReplaceError).toHaveBeenNthCalledWith(2, NOT_A_ZIP_MESSAGE)
    expect(input.value).toBe('')
  })

  it('cannot start a replace while an update check is in flight', () => {
    // Otherwise the check resolves against a model that has been swapped out.
    renderInstall(root, installed({ updateStatus: 'checking' }), makeHandlers())
    expect(root.querySelector<HTMLButtonElement>('[data-testid="replace-file"]')!.disabled).toBe(true)
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
