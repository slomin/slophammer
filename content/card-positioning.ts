export const CARD_GAP = 8
export const CARD_MARGIN = 8

export interface SelectionRect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface CardSize {
  width: number
  height: number
}

// Where the card ended up relative to the text it describes. `pinned` is the
// bottom-right corner — both a setting and the fallback for anything the card
// cannot be anchored to. `hidden` means the text is entirely off screen, so
// there is nothing to sit next to.
export type Placement = 'below' | 'above' | 'beside' | 'pinned' | 'hidden'

export interface PlacedCard {
  placement: Exclude<Placement, 'hidden'>
  top: number
  left: number
}

export type CardPosition = PlacedCard | { placement: 'hidden' }

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

// Bottom-right, never further left/up than the margin even if the card is
// larger than the viewport.
export function pinnedCardPosition(args: { viewport: ViewportSize; card: CardSize }): PlacedCard {
  const { viewport, card } = args
  return {
    placement: 'pinned',
    top: Math.max(CARD_MARGIN, viewport.height - card.height - CARD_MARGIN),
    left: Math.max(CARD_MARGIN, viewport.width - card.width - CARD_MARGIN),
  }
}

export const POSITION_TOLERANCE_PX = 0.5

export interface Offsets {
  top: number
  left: number
}

// A transform / filter / perspective / will-change on an ancestor makes that
// ancestor the containing block for position:fixed descendants, so the offsets
// we set are measured from the document instead of the viewport. Rather than
// trying to enumerate every CSS property that causes it, measure where the card
// actually landed and correct by the difference. Returns null when no
// correction is needed.
export function correctedOffsets(args: {
  /** The offsets currently written to the element. */
  applied: Offsets
  /** Where those offsets were meant to put it, in viewport coordinates. */
  target: Offsets
  /** Where it actually rendered, in viewport coordinates. */
  actual: Offsets
}): Offsets | null {
  const dTop = args.target.top - args.actual.top
  const dLeft = args.target.left - args.actual.left
  if (Math.abs(dTop) <= POSITION_TOLERANCE_PX && Math.abs(dLeft) <= POSITION_TOLERANCE_PX) {
    return null
  }
  return { top: args.applied.top + dTop, left: args.applied.left + dLeft }
}

// Tries, in order: below the text, above it, to its right, to its left. Each
// candidate must fit inside the viewport with the margin; the first that does
// wins. When none fits, `lastResort` decides:
//
//   'pinned' — a new card goes to the corner. A user never sees a card clamped
//              to an edge it was not asked to go to.
//   'shift'  — a card that is already on screen and is being tracked through a
//              scroll is shifted into the viewport instead, so it stays with
//              its text rather than jumping to the corner mid-scroll.
//
// A selection entirely outside the viewport is the extreme case of nothing
// fitting: a new card pins, so a result that arrives after the reader scrolled
// away is never a hidden result; a tracked card hides until its text returns.
export function placeCard(args: {
  selection: SelectionRect
  viewport: ViewportSize
  card: CardSize
  lastResort: 'pinned' | 'shift'
}): CardPosition {
  const { selection, viewport, card, lastResort } = args

  const anchorVisible =
    selection.bottom > 0 &&
    selection.top < viewport.height &&
    selection.right > 0 &&
    selection.left < viewport.width
  if (!anchorVisible) {
    return lastResort === 'pinned' ? pinnedCardPosition({ viewport, card }) : { placement: 'hidden' }
  }

  const maxTop = Math.max(CARD_MARGIN, viewport.height - card.height - CARD_MARGIN)
  const maxLeft = Math.max(CARD_MARGIN, viewport.width - card.width - CARD_MARGIN)
  const alignedLeft = clamp(selection.left, CARD_MARGIN, maxLeft)

  const belowTop = selection.bottom + CARD_GAP
  if (belowTop + card.height + CARD_MARGIN <= viewport.height) {
    return { placement: 'below', top: belowTop, left: alignedLeft }
  }

  const aboveTop = selection.top - card.height - CARD_GAP
  if (aboveTop >= CARD_MARGIN) {
    return { placement: 'above', top: aboveTop, left: alignedLeft }
  }

  const fitsVertically = card.height + 2 * CARD_MARGIN <= viewport.height
  if (fitsVertically) {
    const besideTop = clamp(selection.top, CARD_MARGIN, maxTop)
    const rightLeft = selection.right + CARD_GAP
    if (rightLeft + card.width + CARD_MARGIN <= viewport.width) {
      return { placement: 'beside', top: besideTop, left: rightLeft }
    }
    const leftLeft = selection.left - CARD_GAP - card.width
    if (leftLeft >= CARD_MARGIN) {
      return { placement: 'beside', top: besideTop, left: leftLeft }
    }
  }

  if (lastResort === 'pinned') return pinnedCardPosition({ viewport, card })
  return { placement: 'below', top: clamp(belowTop, CARD_MARGIN, maxTop), left: alignedLeft }
}
