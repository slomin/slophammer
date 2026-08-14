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

export type Placement = 'below' | 'above'

export interface CardPosition {
  top: number
  left: number
  placement: Placement
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

// Used when there is no selection rect to anchor against — most commonly a
// selection made inside an iframe, which the top frame's getSelection() cannot
// see. Without this the card kept its default offsets and rendered below the
// fold.
export function fallbackCardPosition(args: {
  viewport: ViewportSize
  card: CardSize
}): CardPosition {
  const { viewport, card } = args
  // Top-right, never further left/up than the margin even if the card is
  // larger than the viewport.
  return {
    top: CARD_MARGIN,
    left: Math.max(CARD_MARGIN, viewport.width - card.width - CARD_MARGIN),
    placement: 'below',
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

export function computeCardPosition(args: {
  selection: SelectionRect
  viewport: ViewportSize
  card: CardSize
}): CardPosition {
  const { selection, viewport, card } = args

  const belowTop = selection.bottom + CARD_GAP
  const fitsBelow = belowTop + card.height + CARD_MARGIN <= viewport.height

  let placement: Placement
  let top: number
  if (fitsBelow) {
    placement = 'below'
    top = belowTop
  } else {
    const aboveTop = selection.top - card.height - CARD_GAP
    placement = 'above'
    top = aboveTop
  }

  const maxTop = Math.max(CARD_MARGIN, viewport.height - card.height - CARD_MARGIN)
  top = clamp(top, CARD_MARGIN, maxTop)

  const maxLeft = viewport.width - card.width - CARD_MARGIN
  const left = clamp(selection.left, CARD_MARGIN, maxLeft)

  return { top, left, placement }
}
