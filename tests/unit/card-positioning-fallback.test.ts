import { describe, expect, it } from 'vitest'
import {
  CARD_MARGIN,
  correctedOffsets,
  fallbackCardPosition,
  POSITION_TOLERANCE_PX,
} from '@/content/card-positioning'

const viewport = { width: 1024, height: 768 }
const card = { width: 320, height: 180 }

// A selection made inside an iframe is not visible to the top frame, so there
// is no rect to anchor against. Previously the card kept its default offsets
// and rendered below the fold; it must land somewhere on screen instead.
describe('fallbackCardPosition — no selection rect available', () => {
  it('anchors to the top-right of the viewport', () => {
    const pos = fallbackCardPosition({ viewport, card })
    expect(pos.top).toBe(CARD_MARGIN)
    expect(pos.left).toBe(viewport.width - card.width - CARD_MARGIN)
  })

  it('always lands inside the viewport', () => {
    const pos = fallbackCardPosition({ viewport, card })
    expect(pos.top).toBeGreaterThanOrEqual(0)
    expect(pos.left).toBeGreaterThanOrEqual(0)
    expect(pos.top + card.height).toBeLessThanOrEqual(viewport.height)
    expect(pos.left + card.width).toBeLessThanOrEqual(viewport.width)
  })

  it('clamps to the margin when the card is wider than the viewport', () => {
    const pos = fallbackCardPosition({ viewport: { width: 200, height: 400 }, card })
    expect(pos.left).toBe(CARD_MARGIN)
    expect(pos.top).toBe(CARD_MARGIN)
  })
})

// A transform / filter / perspective on an ancestor makes that ancestor the
// containing block for position:fixed, so the offsets we set are measured from
// the document rather than the viewport. Measured drift equals the scroll
// offset, which put the card 777px above the fold in the wild.
describe('correctedOffsets — containing-block drift', () => {
  it('returns null when the card landed where intended', () => {
    expect(
      correctedOffsets({ applied: { top: 8, left: 47 }, target: { top: 8, left: 47 }, actual: { top: 8, left: 47 } }),
    ).toBeNull()
  })

  it('returns null for sub-pixel drift', () => {
    expect(
      correctedOffsets({
        applied: { top: 8, left: 47 },
        target: { top: 8, left: 47 },
        actual: { top: 8.2, left: 47.1 },
      }),
    ).toBeNull()
  })

  it('compensates for drift equal to the scroll offset', () => {
    // Reproduces the observed failure: applied top 8, actually rendered at -777.
    const next = correctedOffsets({
      applied: { top: 8, left: 47 },
      target: { top: 8, left: 47 },
      actual: { top: -777, left: 47 },
    })
    expect(next).not.toBeNull()
    expect(next!.top).toBe(793) // 8 + (8 - -777)
    expect(next!.left).toBe(47)
  })

  it('compensates horizontally too', () => {
    const next = correctedOffsets({
      applied: { top: 10, left: 100 },
      target: { top: 10, left: 100 },
      actual: { top: 10, left: 40 },
    })
    expect(next).not.toBeNull()
    expect(next!.left).toBe(160)
    expect(next!.top).toBe(10)
  })

  it('exposes the tolerance it uses', () => {
    expect(POSITION_TOLERANCE_PX).toBeGreaterThan(0)
    expect(POSITION_TOLERANCE_PX).toBeLessThan(2)
  })
})
