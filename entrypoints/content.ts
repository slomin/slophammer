import { buildCard, type CardElements } from '@/content/card-dom'
import { renderState } from '@/content/card-state'
import { computeCardPosition } from '@/content/card-positioning'
import { initialCardState, reduceCardState, type CardState } from '@/content/state'
import { createLogger, installErrorForwarding } from '@/messaging/logger'
import {
  isClassifyError,
  isClassifyResult,
  isClassifyStarted,
  isModelStatus,
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
    installErrorForwarding('content')
    const log = createLogger('content')
    log.info('content script loaded', { href: location.href })

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
          c.refs.root.style.left = `${left}px`
          c.refs.root.style.top = `${top}px`
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

    function position(c: CardElements) {
      if (!lastRect) return
      if (isDragged) return
      const p = computeCardPosition({
        selection: toSelectionRect(lastRect),
        viewport: currentViewport(),
        card: { width: c.refs.root.offsetWidth || 320, height: c.refs.root.offsetHeight || 180 },
      })
      c.refs.root.style.top = `${p.top}px`
      c.refs.root.style.left = `${p.left}px`
    }

    function applyAction(action: Parameters<typeof reduceCardState>[1]) {
      const prev = state
      state = reduceCardState(prev, action)
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

    browser.runtime.onMessage.addListener((raw) => {
      const m = raw as ExtensionMessage
      if (isSelectionTooShort(m)) {
        showToast(`Selection too short — need at least 75 characters, got ${m.length}.`)
        return false
      }
      if (isClassifyStarted(m)) {
        lastRect = captureSelectionRect()
        applyAction(m)
        return false
      }
      if (isClassifyResult(m) || isClassifyError(m) || isModelStatus(m)) {
        applyAction(m)
        return false
      }
      return false
    })
  },
})
