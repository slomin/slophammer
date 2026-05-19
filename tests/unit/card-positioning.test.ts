import { describe, expect, it } from 'vitest'
import { computeCardPosition, CARD_GAP, CARD_MARGIN } from '@/content/card-positioning'

const viewport = { width: 1024, height: 768 }
const card = { width: 320, height: 180 }

describe('computeCardPosition — vertical placement', () => {
  it('places below the selection when there is room', () => {
    const sel = { top: 100, bottom: 140, left: 200, right: 500 }
    const pos = computeCardPosition({ selection: sel, viewport, card })
    expect(pos.placement).toBe('below')
    expect(pos.top).toBe(sel.bottom + CARD_GAP)
  })

  it('flips above when below would overflow the viewport', () => {
    const sel = { top: 600, bottom: 650, left: 200, right: 500 }
    const pos = computeCardPosition({ selection: sel, viewport, card })
    expect(pos.placement).toBe('above')
    expect(pos.top).toBe(sel.top - card.height - CARD_GAP)
  })

  it('clamps top to margin when even above would overflow', () => {
    const sel = { top: 40, bottom: 760, left: 200, right: 500 }
    const pos = computeCardPosition({ selection: sel, viewport, card })
    expect(pos.top).toBe(CARD_MARGIN)
  })
})

describe('computeCardPosition — horizontal clamping', () => {
  it('aligns to selection.left when it fits', () => {
    const sel = { top: 100, bottom: 140, left: 200, right: 500 }
    const pos = computeCardPosition({ selection: sel, viewport, card })
    expect(pos.left).toBe(200)
  })

  it('clamps left-overflow to margin', () => {
    const sel = { top: 100, bottom: 140, left: -10, right: 50 }
    const pos = computeCardPosition({ selection: sel, viewport, card })
    expect(pos.left).toBe(CARD_MARGIN)
  })

  it('clamps right-overflow so the card stays on screen', () => {
    const sel = { top: 100, bottom: 140, left: 900, right: 1000 }
    const pos = computeCardPosition({ selection: sel, viewport, card })
    expect(pos.left + card.width).toBeLessThanOrEqual(viewport.width - CARD_MARGIN + 1)
  })

  it('clamps to margin when card is wider than viewport', () => {
    const narrow = { width: 100, height: 400 }
    const fat = { width: 200, height: 50 }
    const sel = { top: 50, bottom: 80, left: 10, right: 90 }
    const pos = computeCardPosition({ selection: sel, viewport: narrow, card: fat })
    expect(pos.left).toBe(CARD_MARGIN)
  })
})
