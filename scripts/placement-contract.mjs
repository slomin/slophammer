// The placement contract in pixels, shared by the Playwright spec and
// `pnpm qa:placement` so the two cannot drift apart. The geometry constants
// mirror content/card-positioning.ts; tests/unit/placement-contract.test.ts
// holds them equal.
export const GAP = 8
export const MARGIN = 8
export const TOLERANCE = 1.5

// .sh-card.dark / .sh-card.light --sh-bg, and how far a decoded pixel may
// stray from them. Tight on purpose: the card seen through a 60% backdrop is
// only ~9 units away from the dark background per channel.
export const CARD_BG = {
  dark: [15, 15, 17],
  light: [250, 250, 247],
}
export const PIXEL_TOLERANCE = 3

export const near = (a, b) => Math.abs(a - b) <= TOLERANCE

/**
 * What "adjacent or pinned" means. `card` carries `placement` and a viewport
 * rect; `sel` is the selection's viewport rect or null; `vp` the viewport
 * size. Returns a reason when the contract does not hold, so a failing row
 * says why.
 */
export function placementProblem(card, sel, vp) {
  if (card.top < -TOLERANCE || card.bottom > vp.height + TOLERANCE) {
    return `card leaves the viewport (${Math.round(card.top)}..${Math.round(card.bottom)} of ${vp.height})`
  }
  switch (card.placement) {
    case 'below':
      return sel && near(card.top, sel.bottom + GAP) ? null : `below but gap is ${Math.round(card.top - (sel?.bottom ?? 0))}`
    case 'above':
      return sel && near(card.bottom, sel.top - GAP) ? null : `above but gap is ${Math.round((sel?.top ?? 0) - card.bottom)}`
    case 'beside':
      return sel && (near(card.left, sel.right + GAP) || near(card.right, sel.left - GAP))
        ? null
        : 'beside but not touching the text horizontally'
    case 'pinned':
      return near(card.bottom, vp.height - MARGIN) && near(card.right, vp.width - MARGIN)
        ? null
        : `pinned but at ${Math.round(card.right)}x${Math.round(card.bottom)} of ${vp.width}x${vp.height}`
    case 'shifted':
      // A tracked card that fits nowhere adjacent: the only promise is that it
      // stayed inside the viewport, which the check above already made.
      return null
    default:
      return `unexpected placement ${card.placement}`
  }
}

/** Whether a decoded [r, g, b] is one of the card backgrounds (or the given one). */
export function isCardBackground(px, theme) {
  const candidates = theme ? [CARD_BG[theme]] : Object.values(CARD_BG)
  return candidates.some((bg) => bg.every((channel, i) => Math.abs(channel - px[i]) <= PIXEL_TOLERANCE))
}
