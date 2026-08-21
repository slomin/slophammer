import { describe, expect, it } from 'vitest'
import { CARD_GAP, CARD_MARGIN } from '@/content/card-positioning'
import { GAP, MARGIN, isCardBackground, placementProblem } from '../../scripts/placement-contract.mjs'

// The oracle the E2E spec and `pnpm qa:placement` share. It restates the
// algorithm's constants in plain numbers so it can run in a page; this is
// what keeps those numbers honest.
describe('placement contract', () => {
  const vp = { width: 1280, height: 720 }
  const sel = { top: 100, bottom: 140, left: 40, right: 900 }
  const box = (top: number, left: number, h = 355, w = 320) => ({ top, left, bottom: top + h, right: left + w })

  it('uses the same gap and margin as the algorithm', () => {
    expect(GAP).toBe(CARD_GAP)
    expect(MARGIN).toBe(CARD_MARGIN)
  })

  it('accepts each adjacent placement only at its gap', () => {
    expect(placementProblem({ placement: 'below', ...box(148, 40) }, sel, vp)).toBeNull()
    expect(placementProblem({ placement: 'below', ...box(160, 40) }, sel, vp)).toMatch(/below but gap/)
    expect(placementProblem({ placement: 'above', ...box(100 - 8 - 60, 40, 60) }, sel, vp)).toBeNull()
    expect(placementProblem({ placement: 'beside', ...box(100, 908) }, sel, vp)).toBeNull()
    expect(placementProblem({ placement: 'beside', ...box(100, 700) }, sel, vp)).toMatch(/beside/)
  })

  it('accepts pinned only in the bottom-right corner', () => {
    expect(placementProblem({ placement: 'pinned', ...box(720 - 8 - 355, 1280 - 8 - 320) }, null, vp)).toBeNull()
    expect(placementProblem({ placement: 'pinned', ...box(8, 1280 - 8 - 320) }, null, vp)).toMatch(/pinned but at/)
  })

  it('holds a shifted card only to staying inside the viewport', () => {
    expect(placementProblem({ placement: 'shifted', ...box(300, 40) }, sel, vp)).toBeNull()
    expect(placementProblem({ placement: 'shifted', ...box(400, 40) }, sel, vp)).toMatch(/leaves the viewport/)
  })

  it('rejects anything it does not know', () => {
    expect(placementProblem({ placement: 'hidden', ...box(0, 0) }, sel, vp)).toMatch(/unexpected/)
  })

  it('tells the dark card background from the same colour seen through a 60% backdrop', () => {
    expect(isCardBackground([15, 15, 17], 'dark')).toBe(true)
    expect(isCardBackground([6, 6, 7], 'dark')).toBe(false)
    expect(isCardBackground([250, 250, 247])).toBe(true)
    expect(isCardBackground([100, 100, 100])).toBe(false)
  })
})
