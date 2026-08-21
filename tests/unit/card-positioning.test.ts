import { describe, expect, it } from 'vitest'
import { CARD_GAP, CARD_MARGIN, placeCard } from '@/content/card-positioning'

const viewport = { width: 1024, height: 768 }
const card = { width: 320, height: 180 }
const place = (args: Partial<Parameters<typeof placeCard>[0]> & { selection: Parameters<typeof placeCard>[0]['selection'] }) =>
  placeCard({ viewport, card, lastResort: 'pinned', ...args })

describe('placeCard — vertical placement', () => {
  it('places below the selection when there is room', () => {
    const sel = { top: 100, bottom: 140, left: 200, right: 500 }
    expect(place({ selection: sel })).toEqual({ placement: 'below', top: sel.bottom + CARD_GAP, left: 200 })
  })

  it('flips above when below would overflow the viewport', () => {
    const sel = { top: 600, bottom: 650, left: 200, right: 500 }
    expect(place({ selection: sel })).toEqual({
      placement: 'above',
      top: sel.top - card.height - CARD_GAP,
      left: 200,
    })
  })
})

describe('placeCard — beside the selection', () => {
  // A tall selection in a short viewport: neither above nor below fits, but
  // there is room to the right of the text.
  const tall = { width: 320, height: 600 }

  it('goes to the right of the selection, aligned with its top', () => {
    const sel = { top: 100, bottom: 700, left: 100, right: 400 }
    expect(place({ selection: sel, card: tall })).toEqual({
      placement: 'beside',
      top: 100,
      left: sel.right + CARD_GAP,
    })
  })

  it('keeps a beside card inside the viewport vertically', () => {
    const sel = { top: 300, bottom: 700, left: 100, right: 400 }
    const pos = place({ selection: sel, card: tall })
    expect(pos.placement).toBe('beside')
    if (pos.placement !== 'hidden') expect(pos.top + tall.height + CARD_MARGIN).toBeLessThanOrEqual(viewport.height)
  })

  it('goes to the left when the right has no room', () => {
    const sel = { top: 100, bottom: 700, left: 700, right: 1000 }
    expect(place({ selection: sel, card: tall })).toEqual({
      placement: 'beside',
      top: 100,
      left: sel.left - CARD_GAP - tall.width,
    })
  })

  it('prefers below and above over beside when they fit', () => {
    const sel = { top: 100, bottom: 140, left: 100, right: 400 }
    expect(place({ selection: sel }).placement).toBe('below')
  })
})

// The measured dead band: Playwright's 1280x720 viewport with the 355px basic
// card. Below needs selBottom <= 349, above needs selTop >= 371, so a paragraph
// spanning 330..400 fits neither — and previously was clamped to the top edge,
// 400px from its text.
describe('placeCard — when nothing adjacent fits', () => {
  const vp = { width: 1280, height: 720 }
  const basic = { width: 320, height: 355 }
  const sel = { top: 330, bottom: 400, left: 40, right: 1240 }

  it('falls back to the pinned corner at decide time', () => {
    expect(placeCard({ selection: sel, viewport: vp, card: basic, lastResort: 'pinned' })).toEqual({
      placement: 'pinned',
      top: vp.height - basic.height - CARD_MARGIN,
      left: vp.width - basic.width - CARD_MARGIN,
    })
  })

  it('shifts into the viewport while tracking a scroll, rather than jumping to the corner', () => {
    const pos = placeCard({ selection: sel, viewport: vp, card: basic, lastResort: 'shift' })
    expect(pos.placement).toBe('below')
    if (pos.placement === 'hidden') return
    expect(pos.top).toBeGreaterThanOrEqual(CARD_MARGIN)
    expect(pos.top + basic.height + CARD_MARGIN).toBeLessThanOrEqual(vp.height)
    expect(pos.left).toBe(40)
  })
})

describe('placeCard — anchor outside the viewport', () => {
  it('hides when the selection is entirely above the viewport', () => {
    expect(place({ selection: { top: -100, bottom: -20, left: 200, right: 500 } })).toEqual({ placement: 'hidden' })
  })

  it('hides when the selection is entirely below the viewport', () => {
    expect(place({ selection: { top: 800, bottom: 850, left: 200, right: 500 } })).toEqual({ placement: 'hidden' })
  })

  it('hides when the selection is entirely left or right of the viewport', () => {
    expect(place({ selection: { top: 100, bottom: 140, left: -300, right: -10 } })).toEqual({ placement: 'hidden' })
    expect(place({ selection: { top: 100, bottom: 140, left: 1100, right: 1300 } })).toEqual({ placement: 'hidden' })
  })

  it('hides regardless of the last resort', () => {
    expect(place({ selection: { top: -100, bottom: -20, left: 200, right: 500 }, lastResort: 'shift' })).toEqual({
      placement: 'hidden',
    })
  })

  it('still places while any part of the selection is visible', () => {
    const pos = place({ selection: { top: -30, bottom: 10, left: 200, right: 500 } })
    expect(pos.placement).toBe('below')
  })
})

describe('placeCard — horizontal clamping', () => {
  it('aligns to selection.left when it fits', () => {
    const sel = { top: 100, bottom: 140, left: 200, right: 500 }
    expect(place({ selection: sel })).toMatchObject({ left: 200 })
  })

  it('clamps left-overflow to the margin', () => {
    const sel = { top: 100, bottom: 140, left: -10, right: 50 }
    expect(place({ selection: sel })).toMatchObject({ left: CARD_MARGIN })
  })

  it('clamps right-overflow so the card stays on screen', () => {
    const sel = { top: 100, bottom: 140, left: 900, right: 1000 }
    const pos = place({ selection: sel })
    if (pos.placement === 'hidden') throw new Error('unexpected')
    expect(pos.left + card.width).toBeLessThanOrEqual(viewport.width - CARD_MARGIN)
  })

  it('clamps to the margin when the card is wider than the viewport', () => {
    const narrow = { width: 100, height: 400 }
    const fat = { width: 200, height: 50 }
    const sel = { top: 50, bottom: 80, left: 10, right: 90 }
    expect(place({ selection: sel, viewport: narrow, card: fat })).toMatchObject({ left: CARD_MARGIN })
  })
})
