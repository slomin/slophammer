import type { BrowserContext, Locator, Page } from '@playwright/test'
import sharp from 'sharp'
import { MARGIN, isCardBackground, near, placementProblem } from '../../scripts/placement-contract.mjs'
import { renderPlacementFrame, renderPlacementPage } from '../../scripts/placement-page.mjs'
import { dispatchClassification, expect, gotoRoutes, setSettings, test } from './fixtures'

// The placement torture page, asserted. Every rule the content script promises
// about where the card goes is checked here against the real extension in a
// real browser, with a synthetic result so no model is needed. The same page
// is what `pnpm qa:placement` measures with real inference.
//
// The promise: at rest the card is either adjacent to its text (below, above
// or beside, 8px away) or pinned to the bottom-right corner. It is never
// clamped to an edge it was not asked to go to. It follows the text on scroll,
// hides when the text leaves the viewport, and renders in the top layer.

const TEXT =
  'The quick brown fox jumps over the lazy dog while the committee deliberates at length about matters of no consequence whatsoever, producing minutes that nobody reads and decisions that nobody implements, which is roughly how these things tend to go in practice and has been for years.'
interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

interface CardGeometry extends Rect {
  state: string | null
  placement: string | null
  hidden: boolean
  visibility: string
  inTopLayer: boolean
  width: number
  height: number
}

async function readCard(card: Locator): Promise<CardGeometry> {
  return card.evaluate((host) => {
    const root = host.shadowRoot!.querySelector<HTMLElement>('[data-testid="card-root"]')!
    const r = root.getBoundingClientRect()
    return {
      state: root.dataset.state ?? null,
      placement: root.dataset.placement ?? null,
      hidden: root.dataset.hidden === 'true',
      visibility: getComputedStyle(root).visibility,
      inTopLayer: host.matches(':popover-open'),
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    }
  })
}

async function readSelection(page: Page): Promise<Rect> {
  return page.evaluate(() => {
    const r = getSelection()!.getRangeAt(0).getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  })
}

async function viewportOf(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
}

async function openTorturePage(page: Page): Promise<void> {
  await gotoRoutes(
    page,
    { '/placement': renderPlacementPage(), '/placement/frame': renderPlacementFrame() },
    '/placement',
  )
  await page.waitForLoadState('domcontentloaded')
}

// A real selection (Playwright's selectText drives the document Selection),
// then scrolled so the selection's bottom sits at `fraction` of the viewport.
async function selectAt(page: Page, selector: string, fraction: number): Promise<Rect> {
  await page.locator(selector).selectText()
  await page.evaluate((fraction) => {
    const r = getSelection()!.getRangeAt(0).getBoundingClientRect()
    window.scrollBy(0, r.bottom - innerHeight * fraction)
  }, fraction)
  return readSelection(page)
}

// Two frames: one for the ResizeObserver to notice the loading→ready size
// change, one for the placement it triggers.
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
}

async function classify(context: BrowserContext, page: Page): Promise<Locator> {
  const card = await dispatchClassification(context, page, TEXT)
  await expect.poll(async () => (await readCard(card)).state, { timeout: 4000 }).toBe('ready')
  await settle(page)
  return card
}

async function dismiss(page: Page, card: Locator): Promise<void> {
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await readCard(card)).state).toBe('idle')
}

async function expectAdjacentOrPinned(page: Page, card: Locator, label: string): Promise<CardGeometry> {
  const [geom, sel, vp] = await Promise.all([readCard(card), readSelection(page), viewportOf(page)])
  expect(placementProblem(geom, sel, vp), label).toBeNull()
  return geom
}

// The torture page is 900px wide. At 1280 there is room beside the text; at
// 960 there is not, which is what forces the pinned fallback.
async function setViewport(page: Page, width: number, height: number): Promise<{ width: number; height: number }> {
  await page.setViewportSize({ width, height })
  return viewportOf(page)
}

test('anchored: adjacent to the text or pinned, across viewport heights and both card sizes', async ({ context }) => {
  const page = await context.newPage()
  await openTorturePage(page)
  const seen = new Set<string>()

  for (const [width, height] of [
    [960, 700],
    [960, 941],
    [1280, 700],
    [1280, 941],
  ]) {
    const vp = await setViewport(page, width!, height!)
    for (const resultDetail of ['basic', 'advanced'] as const) {
      // Re-load after changing the mode so the content script reads it at
      // startup rather than racing storage.onChanged.
      await setSettings(context, { resultDetail })
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      for (const fraction of [0.15, 0.35, 0.55, 0.85]) {
        await selectAt(page, '#c-plain .t', fraction)
        const card = await classify(context, page)
        const geom = await expectAdjacentOrPinned(page, card, `${vp.width}x${vp.height} ${resultDetail} @${fraction}`)
        seen.add(geom.placement!)
        await dismiss(page, card)
      }
    }
  }
  // The sweep must actually cross the dead band and the beside case, or it
  // proves nothing about either.
  expect([...seen].sort()).toEqual(expect.arrayContaining(['below', 'beside', 'pinned']))
})

test('anchored: follows the text on scroll, hides when it leaves, and comes back with it', async ({ context }) => {
  const page = await context.newPage()
  await openTorturePage(page)
  await setViewport(page, 1280, 800)
  await setSettings(context, { resultDetail: 'basic' })

  const sel0 = await selectAt(page, '#c-plain .t', 0.25)
  const card = await classify(context, page)
  const before = await expectAdjacentOrPinned(page, card, 'initial')
  expect(before.placement).toBe('below')

  await page.mouse.move(640, 400)
  await page.mouse.wheel(0, 120)
  await expect.poll(async () => (await readSelection(page)).bottom).toBeLessThan(sel0.bottom - 100)
  await settle(page)
  const after = await expectAdjacentOrPinned(page, card, 'after 120px scroll')
  expect(after.top).toBeLessThan(before.top - 100)

  // Push the text out of the viewport entirely.
  await page.mouse.wheel(0, 800)
  await expect.poll(async () => (await readSelection(page)).bottom).toBeLessThan(0)
  await expect.poll(async () => (await readCard(card)).hidden).toBe(true)
  expect((await readCard(card)).visibility).toBe('hidden')

  // And bring it back.
  await page.mouse.wheel(0, -920)
  await expect.poll(async () => (await readSelection(page)).top).toBeGreaterThan(0)
  await expect.poll(async () => (await readCard(card)).hidden).toBe(false)
  await settle(page)
  const back = await expectAdjacentOrPinned(page, card, 'after scrolling back')
  expect(back.visibility).toBe('visible')
})

test('anchored: a window resize re-places the card, adjacent or pinned, never over the text', async ({ context }) => {
  const page = await context.newPage()
  await setSettings(context, { resultDetail: 'advanced' })
  await openTorturePage(page)
  await setViewport(page, 960, 941)

  await selectAt(page, '#c-plain .t', 0.35)
  const card = await classify(context, page)
  expect((await expectAdjacentOrPinned(page, card, 'at 941px')).placement).toBe('below')

  await setViewport(page, 960, 700)
  await expect
    .poll(async () => placementProblem(await readCard(card), await readSelection(page), await viewportOf(page)))
    .toBeNull()
  expect((await readCard(card)).placement).toBe('pinned')
})

test('pinned setting: bottom-right corner, and a scroll leaves it there', async ({ context }) => {
  const page = await context.newPage()
  await setSettings(context, { cardPlacement: 'pinned', resultDetail: 'basic' })
  await openTorturePage(page)
  await setViewport(page, 1280, 800)

  await selectAt(page, '#c-plain .t', 0.15)
  const card = await classify(context, page)
  const vp = await viewportOf(page)
  const before = await readCard(card)
  expect(before.placement).toBe('pinned')
  expect(near(before.right, vp.width - MARGIN) && near(before.bottom, vp.height - MARGIN)).toBe(true)

  await page.mouse.move(640, 400)
  await page.mouse.wheel(0, 200)
  await expect.poll(async () => (await readSelection(page)).bottom).toBeLessThan(0.15 * vp.height - 150)
  await settle(page)
  const after = await readCard(card)
  expect(after.top).toBe(before.top)
  expect(after.left).toBe(before.left)
  expect(after.hidden).toBe(false)
})

test('no anchor: textarea and iframe selections pin to the corner instead of a corner nobody chose', async ({ context }) => {
  const page = await context.newPage()
  await openTorturePage(page)
  const vp = await setViewport(page, 1280, 800)
  await setSettings(context, { resultDetail: 'basic' })
  const isPinned = (g: CardGeometry) =>
    g.placement === 'pinned' && near(g.right, vp.width - MARGIN) && near(g.bottom, vp.height - MARGIN)

  await page.locator('#ta').selectText()
  let card = await classify(context, page)
  expect(isPinned(await readCard(card)), 'textarea').toBe(true)
  await dismiss(page, card)

  await page.frameLocator('#frame').locator('.t').selectText()
  card = await classify(context, page)
  expect(isPinned(await readCard(card)), 'iframe').toBe(true)
})

test('top layer: transformed and contained ancestors, an overlapping popover, and a modal dialog', async ({ context }) => {
  const page = await context.newPage()
  await setSettings(context, { resultDetail: 'basic', theme: 'dark' })
  await openTorturePage(page)
  await setViewport(page, 1280, 941)

  for (const selector of ['#xform .t', '#containpaint .t']) {
    await selectAt(page, selector, 0.15)
    const card = await classify(context, page)
    const geom = await expectAdjacentOrPinned(page, card, selector)
    expect(geom.placement, selector).toBe('below')
    expect(geom.inTopLayer, selector).toBe(true)
    await dismiss(page, card)
  }

  // A non-modal popover is in the top layer too. The fixture is large enough
  // that the card placed under its text lands inside it; the card must still
  // be what the user would hit there.
  await page.evaluate(() => document.getElementById('pop')!.showPopover())
  await page.locator('#pop .t').selectText()
  let card = await classify(context, page)
  let geom = await expectAdjacentOrPinned(page, card, 'popover')
  const hitIsCard = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.hasAttribute('data-slop-hammer-card') ?? false,
    { x: geom.left + geom.width / 2, y: geom.top + geom.height / 2 },
  )
  expect(hitIsCard).toBe(true)
  await page.evaluate(() => document.getElementById('pop')!.hidePopover())
  await dismiss(page, card)

  // A modal dialog makes everything outside it inert, so a hit test can never
  // return the card there. What can be checked is paint: a pixel inside the
  // card's padding must be the card's own background, not that background
  // seen through the dialog's 60% backdrop.
  await page.evaluate(() => (document.getElementById('dlg') as HTMLDialogElement).showModal())
  await page.locator('#dlg .t').selectText()
  card = await classify(context, page)
  geom = await readCard(card)
  expect(geom.inTopLayer).toBe(true)
  const png = await page.screenshot({
    clip: { x: geom.left + 6, y: geom.top + geom.height / 2, width: 1, height: 1 },
    scale: 'css',
  })
  const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const pixel = [data[0]!, data[1]!, data[2]!]
  expect(isCardBackground(pixel, 'dark'), `pixel ${pixel} is not the dark card background`).toBe(true)
})

test('anchored: opening the advanced drawer where it no longer fits pins the card, and it stays pinned', async ({ context }) => {
  const page = await context.newPage()
  await openTorturePage(page)
  await setViewport(page, 960, 720)
  await setSettings(context, { resultDetail: 'basic' })

  await selectAt(page, '#c-plain .t', 0.45)
  const card = await classify(context, page)
  expect((await expectAdjacentOrPinned(page, card, 'basic')).placement).toBe('below')

  await card.evaluate((host) =>
    host.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="mode-toggle"]')!.click(),
  )
  await expect.poll(async () => (await readCard(card)).placement).toBe('pinned')
  const pinned = await expectAdjacentOrPinned(page, card, 'advanced')

  await page.mouse.move(640, 300)
  await page.mouse.wheel(0, 100)
  await expect.poll(async () => (await readSelection(page)).bottom).toBeLessThan(0.45 * 720 - 50)
  await settle(page)
  const after = await readCard(card)
  expect(after.placement).toBe('pinned')
  expect(after.top).toBe(pinned.top)

  // Closing the drawer is a fresh decision: the smaller card fits below its
  // text again, so it goes back there rather than staying latched in the
  // corner.
  await page.mouse.wheel(0, -100)
  await expect.poll(async () => (await readSelection(page)).bottom).toBeGreaterThan(0.45 * 720 - 10)
  await card.evaluate((host) =>
    host.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="mode-toggle"]')!.click(),
  )
  await expect.poll(async () => (await readCard(card)).placement).toBe('below')
  await expectAdjacentOrPinned(page, card, 'basic again')
})
