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

    function applyTheme(c: CardElements, isDark: boolean) {
      c.refs.root.classList.toggle('dark', isDark)
      c.refs.root.classList.toggle('light', !isDark)
    }

    function mountCard(): CardElements {
      if (card) return card
      const c = buildCard()
      document.body.appendChild(c.host)

      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(c, mql.matches)
      mql.addEventListener('change', (e) => applyTheme(c, e.matches))

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

      // Re-clamp the card to the viewport whenever its size changes, so that
      // opening the advanced drawer (or restoring from minimised) near the
      // bottom of the page doesn't push the lower rows off-screen.
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
        c.refs.root.dataset.mode = 'basic'
        c.refs.modeToggle.setAttribute('aria-pressed', 'false')
        c.refs.btnMinimise.textContent = '—'
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
