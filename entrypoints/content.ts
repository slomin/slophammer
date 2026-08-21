import { createClassifyWatchdog } from '@/content/classify-watchdog'
import { buildCard, type CardElements } from '@/content/card-dom'
import { renderState } from '@/content/card-state'
import { formatResultSummary } from '@/content/result-summary'
import {
  computeCardPosition,
  correctedOffsets,
  fallbackCardPosition,
} from '@/content/card-positioning'
import {
  CLASSIFY_TIMEOUT_MS,
  initialCardState,
  reduceCardState,
  type CardState,
} from '@/content/state'
import { createLogger, installErrorForwarding } from '@/messaging/logger'
import {
  isClassifyError,
  isClassifyResult,
  isClassifyStarted,
  isModelStatus,
  isPing,
  isSelectionTooShort,
  type ExtensionMessage,
} from '@/messaging/protocol'
import { resolveTheme } from '@/settings/resolve-theme'
import { createChromeSettingsStore } from '@/settings/settings-store'
import { DEFAULT_SETTINGS, type Settings } from '@/settings/settings-types'

function captureSelectionRect(): DOMRect | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return rect
}

function toSelectionRect(r: DOMRect) {
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
}

function currentViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // On-demand injection means this can run in a frame that already has an
    // instance. Two live instances would double-handle every message and each
    // sweep away the other's card, so the incumbent wins and we stop here.
    // An orphaned instance (extension updated underneath it) reports not-alive,
    // and we take over from it.
    const instanceKey = Symbol.for('slophammer.contentInstance')
    const world = globalThis as unknown as Record<symbol, { alive(): boolean } | undefined>
    if (world[instanceKey]?.alive()) return
    world[instanceKey] = {
      alive() {
        try {
          return Boolean(browser.runtime?.id)
        } catch {
          return false
        }
      },
    }

    installErrorForwarding('content')
    const log = createLogger('content')
    log.info('content script loaded', { href: location.href })

    // Any card still in the DOM belongs to an orphaned instance — the guard
    // above guarantees no live one exists — so clear it rather than leaving a
    // second, unresponsive card behind.
    for (const stale of document.querySelectorAll('[data-slop-hammer-card]')) {
      stale.remove()
    }

    let state: CardState = initialCardState
    let card: CardElements | null = null
    let lastRect: DOMRect | null = null
    // Once the user has dragged the card, `position()` must stop yanking it
    // back under the selection. Reset on each new classify:started so a fresh
    // selection gets the default auto-placement.
    let isDragged = false

    const settingsStore = createChromeSettingsStore()
    let settings: Settings = DEFAULT_SETTINGS
    const systemDarkMql = window.matchMedia('(prefers-color-scheme: dark)')

    settingsStore
      .get()
      .then((s) => {
        settings = s
        if (card) applyTheme(card)
      })
      .catch((err) => log.error('settings load failed', err))

    settingsStore.subscribe((next) => {
      settings = next
      if (card) applyTheme(card)
    })

    function applyTheme(c: CardElements) {
      const resolved = resolveTheme(settings.theme, systemDarkMql.matches)
      c.refs.root.classList.toggle('dark', resolved === 'dark')
      c.refs.root.classList.toggle('light', resolved === 'light')
    }

    function mountCard(): CardElements {
      if (card) return card
      const c = buildCard()
      document.body.appendChild(c.host)

      applyTheme(c)
      systemDarkMql.addEventListener('change', () => applyTheme(c))

      c.refs.btnCopy.addEventListener('click', () => void copyResult(c))
      c.refs.btnShare.addEventListener('click', () => void shareResult(c))

      c.refs.dismissButton.addEventListener('click', () => applyAction({ type: 'dismiss' }))
      c.refs.btnClose.addEventListener('click', () => applyAction({ type: 'dismiss' }))

      c.refs.btnMinimise.addEventListener('click', () => {
        const minimised = c.refs.root.dataset.view === 'minimised'
        c.refs.root.dataset.view = minimised ? 'full' : 'minimised'
        c.refs.btnMinimise.textContent = minimised ? '—' : '+'
      })

      c.refs.modeToggle.addEventListener('click', () => {
        const pressed = c.refs.modeToggle.getAttribute('aria-pressed') === 'true'
        c.refs.modeToggle.setAttribute('aria-pressed', String(!pressed))
        c.refs.root.dataset.mode = pressed ? 'basic' : 'advanced'
      })

      // Drag by the head row. Buttons stop propagation so clicks on the
      // minimise/close icons still act as clicks, not drag handles.
      for (const btn of [c.refs.btnMinimise, c.refs.btnClose]) {
        btn.addEventListener('mousedown', (e) => e.stopPropagation())
      }
      c.refs.head.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        const rect = c.refs.root.getBoundingClientRect()
        const offsetX = e.clientX - rect.left
        const offsetY = e.clientY - rect.top
        c.refs.root.dataset.dragging = 'true'
        const onMove = (ev: MouseEvent) => {
          const w = c.refs.root.offsetWidth || 320
          const h = c.refs.root.offsetHeight || 180
          const maxLeft = Math.max(0, window.innerWidth - w)
          const maxTop = Math.max(0, window.innerHeight - h)
          const left = Math.min(Math.max(0, ev.clientX - offsetX), maxLeft)
          const top = Math.min(Math.max(0, ev.clientY - offsetY), maxTop)
          // These are viewport coordinates; add the containing-block offset so
          // the card lands under the cursor on a transformed page instead of
          // teleporting by the full displacement.
          c.refs.root.style.left = `${left + containingBlockOffset.left}px`
          c.refs.root.style.top = `${top + containingBlockOffset.top}px`
        }
        const onUp = () => {
          isDragged = true
          delete c.refs.root.dataset.dragging
          window.removeEventListener('mousemove', onMove, true)
          window.removeEventListener('mouseup', onUp, true)
        }
        window.addEventListener('mousemove', onMove, true)
        window.addEventListener('mouseup', onUp, true)
      })

      // Re-clamp the card to the viewport whenever its size changes, so that
      // opening the advanced drawer (or restoring from minimised) near the
      // bottom of the page doesn't push the lower rows off-screen. Skipped
      // once the user has taken manual control via drag.
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          if (state.kind !== 'idle') position(c)
        })
        ro.observe(c.refs.root)
      }

      card = c
      return c
    }

    async function writeToClipboard(text: string): Promise<boolean> {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        // The async clipboard can be refused (no permission, document not
        // focused). The legacy path still works from a user gesture.
        try {
          // Selecting a scratch textarea clears whatever the user had
          // highlighted — the very text they just had analysed — so put their
          // ranges back afterwards.
          const selection = window.getSelection()
          const saved: Range[] = []
          if (selection) {
            for (let i = 0; i < selection.rangeCount; i++) saved.push(selection.getRangeAt(i))
          }
          const ta = document.createElement('textarea')
          ta.value = text
          ta.setAttribute('readonly', '')
          ta.style.cssText = 'position:fixed;top:-1000px;opacity:0'
          document.body.appendChild(ta)
          ta.select()
          const ok = document.execCommand('copy')
          ta.remove()
          if (selection && saved.length) {
            selection.removeAllRanges()
            for (const range of saved) selection.addRange(range)
          }
          return ok
        } catch {
          return false
        }
      }
    }

    function flashButton(btn: HTMLButtonElement, label: string) {
      const original = btn.textContent
      btn.textContent = label
      btn.disabled = true
      setTimeout(() => {
        btn.textContent = original
        btn.disabled = false
      }, 1500)
    }

    async function copyResult(c: CardElements) {
      if (state.kind !== 'ready') return
      const ok = await writeToClipboard(formatResultSummary(state.result))
      if (!ok) log.warn('copy to clipboard failed')
      flashButton(c.refs.btnCopy, ok ? '✓ Copied' : '✗ Failed')
    }

    async function shareResult(c: CardElements) {
      if (state.kind !== 'ready') return
      const summary = formatResultSummary(state.result)
      const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> }
      if (typeof nav.share === 'function') {
        try {
          await nav.share({ text: summary })
          return
        } catch (err) {
          // A dismissed share sheet is not a failure worth reporting.
          if ((err as Error)?.name === 'AbortError') return
          log.warn('share unavailable, copying instead', String(err))
        }
      }
      const ok = await writeToClipboard(summary)
      flashButton(c.refs.btnShare, ok ? '✓ Copied' : '✗ Failed')
    }

    // How far the card's own coordinate space is displaced from the viewport,
    // when an ancestor's transform makes it the containing block. Zero on a
    // normal page.
    let containingBlockOffset = { top: 0, left: 0 }

    function position(c: CardElements) {
      if (isDragged) return
      const viewport = currentViewport()
      const card = {
        width: c.refs.root.offsetWidth || 320,
        height: c.refs.root.offsetHeight || 180,
      }
      // No rect means the selection isn't visible to this frame — an iframe
      // selection, most often. Anchor to the viewport rather than leaving the
      // card at its default offsets, which put it below the fold.
      const p = lastRect
        ? computeCardPosition({ selection: toSelectionRect(lastRect), viewport, card })
        : fallbackCardPosition({ viewport, card })

      // If an ancestor carries a transform/filter/perspective it becomes the
      // containing block for position:fixed, and these offsets are measured
      // from the document instead of the viewport. Measure where the card
      // actually landed and correct by the difference. Repeat a couple of
      // times: a pure translation converges immediately, but a scaled ancestor
      // needs another pass because the correction is scaled too.
      let applied = { top: p.top, left: p.left }
      for (let attempt = 0; attempt < 3; attempt++) {
        c.refs.root.style.top = `${applied.top}px`
        c.refs.root.style.left = `${applied.left}px`
        const actual = c.refs.root.getBoundingClientRect()
        const corrected = correctedOffsets({
          applied,
          target: p,
          actual: { top: actual.top, left: actual.left },
        })
        if (!corrected) break
        if (attempt === 0) {
          log.debug('correcting for a non-viewport containing block', {
            target: p.top,
            actual: Math.round(actual.top),
          })
        }
        applied = corrected
      }
      // Dragging writes viewport coordinates, so it needs the same offset.
      containingBlockOffset = { top: applied.top - p.top, left: applied.left - p.left }
    }

    // Watchdog: a request that never comes back (wedged offscreen document,
    // dropped message, service worker death) would otherwise leave the card
    // spinning in 'loading' indefinitely. The timing rules live in
    // content/classify-watchdog.ts so they are testable with fake timers.
    const watchdog = createClassifyWatchdog({
      timeoutMs: CLASSIFY_TIMEOUT_MS,
      onTimeout: (requestId) => {
        log.warn('classify timed out', { requestId, ms: CLASSIFY_TIMEOUT_MS })
        applyAction({ type: 'classify:timeout', requestId })
      },
    })

    function applyAction(action: Parameters<typeof reduceCardState>[1]) {
      const prev = state
      state = reduceCardState(prev, action)

      watchdog.sync(action, state)

      if (state === prev) return
      const c = mountCard()
      if (action.type === 'classify:started') {
        c.refs.root.dataset.view = 'full'
        const startMode = settings.resultDetail
        c.refs.root.dataset.mode = startMode
        c.refs.modeToggle.setAttribute('aria-pressed', String(startMode === 'advanced'))
        c.refs.btnMinimise.textContent = '—'
        isDragged = false
      }
      renderState(c, state)
      if (state.kind !== 'idle') position(c)
    }

    function showToast(text: string) {
      const host = document.createElement('div')
      host.style.cssText = [
        'position: fixed',
        'bottom: 16px',
        'right: 16px',
        'padding: 8px 12px',
        'background: #151517',
        'color: #e5e5e5',
        'font: 13px ui-monospace, Menlo, monospace',
        'border: 1px solid #3a3a3f',
        'border-radius: 4px',
        'z-index: 2147483647',
      ].join(';')
      host.textContent = text
      document.body.appendChild(host)
      setTimeout(() => host.remove(), 3000)
    }

    document.addEventListener(
      'mousedown',
      (e) => {
        if (state.kind === 'idle' || !card) return
        if (e.composedPath().includes(card.host)) return
        applyAction({ type: 'dismiss' })
      },
      true,
    )
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') applyAction({ type: 'dismiss' })
      },
      true,
    )

    browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
      const m = raw as ExtensionMessage
      if (isPing(m)) {
        // Answering is what tells the service worker this tab is reachable.
        sendResponse({ alive: true })
        return false
      }
      if (isSelectionTooShort(m)) {
        lastRect = captureSelectionRect()
        applyAction(m)
        return false
      }
      if (isClassifyStarted(m)) {
        lastRect = captureSelectionRect()
        applyAction({ ...m, startedAtMs: performance.now() })
        return false
      }
      if (isClassifyResult(m)) {
        applyAction({ ...m, finishedAtMs: performance.now() })
        return false
      }
      if (isClassifyError(m) || isModelStatus(m)) {
        applyAction(m)
        return false
      }
      return false
    })
  },
})
