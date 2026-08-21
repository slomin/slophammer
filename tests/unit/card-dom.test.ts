// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCard, demoteFromTopLayer, promoteToTopLayer } from '@/content/card-dom'

// The card host is promoted into the browser's top layer with the Popover API,
// which puts it above every z-index on the page and out of reach of ancestor
// transforms, filters and containment. These cover the guard rails around
// that, not the top layer itself — happy-dom has no showPopover, which is
// exactly the "unsupported browser" path.

describe('buildCard — popover host', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('does not mark the host as a popover when the browser has no Popover API', () => {
    const { host } = buildCard()
    expect(host.hasAttribute('popover')).toBe(false)
  })

  it('marks the host as a manual popover when the Popover API exists', () => {
    const proto = HTMLElement.prototype as HTMLElement & { showPopover?: () => void }
    const hadIt = 'showPopover' in proto
    if (!hadIt) Object.defineProperty(proto, 'showPopover', { value: () => {}, configurable: true })
    try {
      const { host } = buildCard()
      // `manual`, never `auto`: auto popovers light-dismiss on any outside
      // click and close each other, and the card manages its own dismissal.
      expect(host.getAttribute('popover')).toBe('manual')
    } finally {
      if (!hadIt) delete (proto as { showPopover?: unknown }).showPopover
    }
  })

  it('keeps the inline resets that defeat both page CSS and the UA popover styles', () => {
    const { host } = buildCard()
    expect(host.style.getPropertyValue('all')).toBe('initial')
    expect(host.style.getPropertyPriority('all')).toBe('important')
    expect(host.style.getPropertyValue('display')).toBe('block')
  })
})

describe('promoteToTopLayer / demoteFromTopLayer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('are no-ops without the Popover API', () => {
    const { host } = buildCard()
    document.body.appendChild(host)
    expect(() => promoteToTopLayer(host)).not.toThrow()
    expect(() => demoteFromTopLayer(host)).not.toThrow()
  })

  it('do not call into the API for a host that is not connected', () => {
    const { host } = buildCard()
    const show = vi.fn()
    const hide = vi.fn()
    Object.assign(host, { showPopover: show, hidePopover: hide })
    promoteToTopLayer(host)
    demoteFromTopLayer(host)
    expect(show).not.toHaveBeenCalled()
    expect(hide).not.toHaveBeenCalled()
  })

  it('show a connected host and swallow an API rejection instead of breaking the card', () => {
    const { host } = buildCard()
    document.body.appendChild(host)
    const show = vi.fn(() => {
      throw new DOMException('already toggling', 'InvalidStateError')
    })
    Object.assign(host, { showPopover: show, hidePopover: vi.fn() })
    expect(() => promoteToTopLayer(host)).not.toThrow()
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('hide only a host that is currently open', () => {
    const { host } = buildCard()
    document.body.appendChild(host)
    const hide = vi.fn()
    Object.assign(host, { showPopover: vi.fn(), hidePopover: hide })
    vi.spyOn(host, 'matches').mockImplementation((selector) => selector === ':popover-open')
    demoteFromTopLayer(host)
    expect(hide).toHaveBeenCalledTimes(1)
    vi.spyOn(host, 'matches').mockReturnValue(false)
    demoteFromTopLayer(host)
    expect(hide).toHaveBeenCalledTimes(1)
  })
})
