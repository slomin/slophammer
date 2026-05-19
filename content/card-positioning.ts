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
