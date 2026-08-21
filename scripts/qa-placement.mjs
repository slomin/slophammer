#!/usr/bin/env node
// Placement QA for the result card (issue #37), against the real extension with
// real inference. The same torture page is asserted without a model by
// tests/e2e/card-placement.spec.ts; this is the evidence run for a PR, with
// the card at its real size on the real pipeline.
//
//   pnpm qa            # bring up Chrome for Testing + the test page
//   pnpm qa:placement  # measure where the card actually lands
//
// Three measurements, because the card fails in three different ways:
//
//   cases     — one row per torture fixture at /placement. Reports where the
//               card sat relative to the text, and whether it is what the user
//               would see there: a hit test for most rows, a screenshot pixel
//               for the modal dialog, because a modal makes every node outside
//               it inert and no overlay can be hit-tested above one.
//   scroll    — the card must move with its text, hide when the text leaves
//               the viewport, and come back with it.
//   geometry  — the same selection placed at four heights in the viewport,
//               which is what exposes the dead band: a selection that fits
//               neither above nor below must pin, never clamp.
//
// Every check prints PASS/FAIL with the numbers it used and the process exits
// non-zero if any failed.
//
// Flags:
//   --cases      run only the per-fixture table
//   --geometry   run only the viewport sweep
//
// Reuses the test-page server rather than starting its own, and exits
// explicitly: debug-extension.mjs leaves CDP websockets open, so without that
// the process never exits and a finished run looks like a hang.
import sharp from 'sharp'
import { isCardBackground, near, placementProblem } from './placement-contract.mjs'
import {
  CARD_SNAPSHOT,
  CDP,
  TEST_PAGE,
  targets,
  getServiceWorker,
  openTab,
  closeTab,
  tabIdForHref,
  dispatchClassify,
  waitForCard,
  say,
} from './debug-extension.mjs'

const argv = process.argv.slice(2)
const only = argv.includes('--cases') ? 'cases' : argv.includes('--geometry') ? 'geometry' : 'both'

// Not `URL`: a const of that name shadows the global constructor in the
// temporal dead zone, and `new URL(...)` on this very line would resolve to it.
const PLACEMENT_URL = new URL('/placement', TEST_PAGE).href
const TEXT =
  'The quick brown fox jumps over the lazy dog while the committee deliberates at length about matters of no consequence whatsoever, producing minutes that nobody reads and decisions that nobody implements, which is roughly how these things tend to go in practice and has been for years.'
const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  say(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(24)} ${detail}`)
}

/**
 * Select an element's contents and report the resulting rect. The selection
 * is scrolled to sit near the top of the viewport so an adjacent placement is
 * possible; a centred selection with the advanced card in a short window pins
 * every row, which is correct but says nothing about the ancestor cases.
 */
const selectContents = (expr) => `(() => {
  const el = ${expr}
  el.scrollIntoView({block:'center'})
  window.scrollBy(0, el.getBoundingClientRect().bottom - innerHeight * 0.15)
  const r = document.createRange(); r.selectNodeContents(el)
  const s = getSelection(); s.removeAllRanges(); s.addRange(r)
  const rect = r.getBoundingClientRect()
  return {sel:{top:Math.round(rect.top),left:Math.round(rect.left),bottom:Math.round(rect.bottom),right:Math.round(rect.right)},
          viewport:{w:innerWidth,h:innerHeight}, ranges:getSelection().rangeCount, len:getSelection().toString().length}
})()`

const READ_SELECTION = `(() => {
  const s = getSelection(); if (!s || s.rangeCount === 0) return null
  const r = s.getRangeAt(0).getBoundingClientRect()
  return {top: r.top, bottom: r.bottom, left: r.left, right: r.right}
})()`

// One CSS pixel inside the card's left padding at mid height — away from the
// rounded corners, which show whatever is behind them. Rule 11: the clip is
// in document coordinates, so the viewport rect needs the scroll offset added
// or the sample lands on whatever page content scrolled past.
async function paintedPixel(page, card) {
  const { data } = await page.send(
    'Page.captureScreenshot',
    {
      format: 'png',
      clip: { x: card.scroll.x + card.left + 6, y: card.scroll.y + card.top + card.height / 2, width: 1, height: 1, scale: 1 },
    },
    8000,
  )
  const { data: raw } = await sharp(Buffer.from(data, 'base64')).raw().toBuffer({ resolveWithObject: true })
  return [raw[0], raw[1], raw[2]]
}

// CARD_SNAPSHOT plus the shape the shared oracle reads.
const readCard = async (page) => {
  const snap = await page.eval(CARD_SNAPSHOT, 5000)
  if (!snap?.mounted || snap.root === false) throw new Error('card is not mounted')
  return { ...snap, ...snap.box }
}

const CASES = [
  ['plain', selectContents(`document.querySelector('#c-plain .t')`)],
  ['transformed ancestor', selectContents(`document.querySelector('#xform .t')`)],
  ['contain: paint', selectContents(`document.querySelector('#containpaint .t')`)],
  // NOT REPRESENTATIVE. This sets the Range programmatically with
  // shadow-internal nodes, which Chrome resolves happily. A real user
  // drag-selection inside a shadow root goes through the re-scoping path that
  // Selection.getComposedRanges() exists to solve. Treat a pass here as
  // meaningless until someone measures a real selection.
  ['open shadow root', selectContents(`document.getElementById('shadowhost').shadowRoot.querySelector('.t')`)],
  [
    'multi-block selection',
    `(() => {
    const a=document.querySelector('#c-multi .t'), b=document.querySelector('#c-multi .t2')
    a.scrollIntoView({block:'center'})
    const r=document.createRange(); r.setStart(a.firstChild,0); r.setEnd(b.firstChild,b.firstChild.length)
    const s=getSelection(); s.removeAllRanges(); s.addRange(r)
    const rect=r.getBoundingClientRect()
    return {sel:{top:Math.round(rect.top),left:Math.round(rect.left),bottom:Math.round(rect.bottom),right:Math.round(rect.right)}, viewport:{w:innerWidth,h:innerHeight}, ranges:1, len:s.toString().length}
  })()`,
  ],
  // No document Range for either of these, so the card has no anchor and pins.
  [
    'textarea',
    `(() => {
    const ta=document.getElementById('ta'); ta.scrollIntoView({block:'center'}); ta.focus(); ta.setSelectionRange(0, ta.value.length)
    const rect=ta.getBoundingClientRect(); const s=getSelection()
    return {sel:{top:Math.round(rect.top),left:Math.round(rect.left),bottom:Math.round(rect.bottom),right:Math.round(rect.right)}, viewport:{w:innerWidth,h:innerHeight}, ranges:s.rangeCount, len:s.toString().length}
  })()`,
  ],
  [
    'iframe',
    `(() => {
    const f=document.getElementById('frame'); f.scrollIntoView({block:'center'})
    const d=f.contentDocument, el=d.querySelector('.t')
    const r=d.createRange(); r.selectNodeContents(el)
    const s=f.contentWindow.getSelection(); s.removeAllRanges(); s.addRange(r)
    getSelection().removeAllRanges()
    const er=el.getBoundingClientRect(), fr=f.getBoundingClientRect()
    return {sel:{top:Math.round(fr.top+er.top),left:Math.round(fr.left+er.left),bottom:Math.round(fr.top+er.bottom),right:Math.round(fr.left+er.right)}, viewport:{w:innerWidth,h:innerHeight}, ranges:getSelection().rangeCount, len:getSelection().toString().length}
  })()`,
  ],
  // Painted-above is checked with a pixel, not a hit test: everything outside
  // a modal dialog is inert, by specification.
  [
    'modal <dialog>',
    `document.getElementById('dlg').showModal(); ` + selectContents(`document.querySelector('#dlg .t')`),
  ],
  // The fixture popover is large enough that the card placed under its text
  // lands inside it, so the hit test is evidence here.
  ['popover', `document.getElementById('pop').showPopover(); ` + selectContents(`document.querySelector('#pop .t')`)],
]

async function dismiss(page) {
  await page.eval(
    `document.getElementById('dlg')?.close?.(); try{document.getElementById('pop')?.hidePopover?.()}catch(e){}`,
    4000,
  )
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`, 4000)
  await new Promise((r) => setTimeout(r, 400))
}

async function classifyAndRead(page, sw, tabId, id) {
  await dispatchClassify(sw, tabId, TEXT, id)
  const card = await waitForCard(page, 40000)
  if (card.crashed || card.timedOut) throw new Error(`${id}: no card (${card.crashed ? 'renderer crashed' : 'timed out'})`)
  // Two frames: the ResizeObserver sees the loading→ready size change, then
  // places.
  await page.eval(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`, 4000)
  return readCard(page)
}

async function runCases(page, sw, tabId) {
  say('')
  say('case                    placement  selBot  cardTop    gap  cardLeft  topLayer  painted')
  say('-'.repeat(96))
  for (const [label, expr] of CASES) {
    const info = await page.eval(expr, 6000)
    if (!info || info.__error) {
      record(label, false, `SELECT FAILED: ${info?.__error}`)
      continue
    }
    const card = await classifyAndRead(page, sw, tabId, 'placement-' + label.replace(/\W+/g, '-'))
    const sel = await page.eval(READ_SELECTION, 4000)
    const pixel = label === 'modal <dialog>' ? await paintedPixel(page, card) : null
    const painted = pixel ? isCardBackground(pixel) : card.visibleToUser
    const gap = Math.round(card.top - info.sel.bottom)
    const problem = placementProblem(card, sel, card.viewport)
    say(
      `${label.padEnd(23)} ${String(card.placement).padEnd(9)} ${String(info.sel.bottom).padStart(6)} ${String(Math.round(card.top)).padStart(8)} ` +
        `${String(gap).padStart(6)} ${String(Math.round(card.left)).padStart(9)}  ${String(card.inTopLayer).padEnd(8)}  ${painted}${pixel ? ` rgb(${pixel})` : ''}`,
    )
    record(
      label,
      !problem && painted,
      problem ?? (painted ? card.placement : pixel ? `pixel rgb(${pixel}) is not a card background` : 'not what the user would hit there'),
    )
    await dismiss(page)
  }
}

/** Scroll so the target paragraph's bottom sits at `fraction` of the viewport. */
const placeAt = (fraction) => `(() => {
  const el = document.querySelector('#c-plain .t')
  el.scrollIntoView({block:'center'})
  const r0 = el.getBoundingClientRect()
  window.scrollBy(0, r0.bottom - innerHeight * ${fraction})
  const r = document.createRange(); r.selectNodeContents(el)
  const s = getSelection(); s.removeAllRanges(); s.addRange(r)
  const rect = r.getBoundingClientRect()
  return {viewport:{w:innerWidth,h:innerHeight}, sel:{top:Math.round(rect.top),bottom:Math.round(rect.bottom),left:Math.round(rect.left),right:Math.round(rect.right)}}
})()`

async function scrollBy(page, px) {
  await page.eval(`window.scrollBy(0, ${px})`, 4000)
  await page.eval(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`, 4000)
  return { sel: await page.eval(READ_SELECTION, 4000), card: await readCard(page) }
}

async function runScroll(page, sw, tabId) {
  say('')
  say('scroll — a card placed below text near the top of the viewport')
  const info = await page.eval(placeAt(0.15), 6000)
  const before = await classifyAndRead(page, sw, tabId, 'placement-scroll')
  const selBefore = await page.eval(READ_SELECTION, 4000)
  record('scroll: starts below', before.placement === 'below', `placement=${before.placement} gap=${Math.round(before.top - selBefore.bottom)}`)

  const moved = await scrollBy(page, 100)
  const dSel = moved.sel.bottom - selBefore.bottom
  const dCard = moved.card.top - before.top
  record('scroll: follows', near(dSel, dCard) && !placementProblem(moved.card, moved.sel, moved.card.viewport), `selection moved ${Math.round(dSel)}px, card moved ${Math.round(dCard)}px`)

  const gone = await scrollBy(page, info.viewport.h)
  record('scroll: hides off-screen', gone.sel.bottom < 0 && gone.card.hidden && gone.card.visibility === 'hidden', `selection bottom ${Math.round(gone.sel.bottom)}, hidden=${gone.card.hidden}`)

  const back = await scrollBy(page, -(info.viewport.h + 100))
  record('scroll: returns', !back.card.hidden && !placementProblem(back.card, back.sel, back.card.viewport), `placement=${back.card.placement} gap=${Math.round(back.card.top - back.sel.bottom)}`)
  await dismiss(page)
}

async function runGeometry(page, sw, tabId) {
  say('')
  say('selection sits at   viewport  selTop selBot  cardTop cardH cardBot    gap  placement')
  say('-'.repeat(96))
  for (const [label, fraction] of [
    ['15% (near top)', 0.15],
    ['35%', 0.35],
    ['55% (mid page)', 0.55],
    ['85% (near bottom)', 0.85],
  ]) {
    const info = await page.eval(placeAt(fraction), 6000)
    const c = await classifyAndRead(page, sw, tabId, 'geometry-' + fraction)
    const sel = await page.eval(READ_SELECTION, 4000)
    const gap = Math.round(c.top - info.sel.bottom)
    say(
      `${label.padEnd(19)} ${String(info.viewport.h).padStart(8)} ${String(info.sel.top).padStart(7)} ${String(info.sel.bottom).padStart(6)} ` +
        `${String(Math.round(c.top)).padStart(8)} ${String(Math.round(c.h)).padStart(5)} ${String(Math.round(c.bottom)).padStart(7)} ${String(gap).padStart(6)}  ${c.placement}`,
    )
    const problem = placementProblem(c, sel, c.viewport)
    record(`geometry ${label}`, !problem, problem ?? c.placement)
    await dismiss(page)
  }
}

let failure = null
try {
  // A run that died before closeTab leaves its tab behind. openTab would then
  // add another, and tabIdForHref returns the *first* match — so the probe
  // selects text in one tab and dispatches the classification to a different
  // one, then waits out the full card budget for a card that is never coming.
  for (const t of await targets()) {
    if (t.type === 'page' && t.url.startsWith(PLACEMENT_URL)) {
      await fetch(`${CDP}/json/close/${t.id}`)
      say(`closed a stale tab left by an earlier run: ${t.id}`)
    }
  }

  const page = await openTab(PLACEMENT_URL)
  await new Promise((r) => setTimeout(r, 1500))
  await page.send('Page.enable').catch(() => {})
  await page.send('Page.bringToFront').catch(() => {})
  const sw = await getServiceWorker()

  const open = (await targets()).filter((t) => t.type === 'page' && t.url.startsWith(PLACEMENT_URL))
  if (open.length !== 1) {
    throw new Error(`expected exactly one tab on ${PLACEMENT_URL}, found ${open.length} — refusing to guess`)
  }
  const tabId = await tabIdForHref(sw, PLACEMENT_URL)

  if (only !== 'geometry') {
    await runCases(page, sw, tabId)
    await runScroll(page, sw, tabId)
  }
  if (only !== 'cases') await runGeometry(page, sw, tabId)

  await closeTab(page)
} catch (error) {
  failure = error
  // Rule 1: unbuffered, or a SIGTERM can eat the only line that says why.
  say(`PLACEMENT QA FAILED: ${error?.stack ?? error}`)
}

const failed = results.filter((r) => !r.ok)
say('')
if (failure) say(`run aborted after ${results.length} checks — the checks that never ran are not counted below`)
say(`${results.length - failed.length}/${results.length} checks passed`)
const exitCode = failure || failed.length ? 1 : 0
say(`PLACEMENT QA COMPLETE exit=${exitCode}`)
// CDP websockets stay open; without this the process never exits and a finished
// run looks like a hang.
process.exit(exitCode)
