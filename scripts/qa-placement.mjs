#!/usr/bin/env node
// Placement QA for the result card (issue #37).
//
//   pnpm qa            # bring up Chrome for Testing + the test page
//   pnpm qa:placement  # measure where the card actually lands
//
// Two measurements, because the card fails in two different ways:
//
//   cases     — one row per torture fixture at /placement, plus a scroll test.
//               Reports the gap between the card and the text it describes, and
//               whether the card is the top-most element at its own centre.
//   geometry  — the same selection placed at four heights in the viewport,
//               which is what exposes the dead band: with a card 501px tall in
//               a 941px viewport, a selection in the middle fits neither above
//               nor below and the card is clamped to the viewport's top edge.
//
// Flags:
//   --cases      run only the per-fixture table
//   --geometry   run only the viewport sweep
//
// Reuses the test-page server rather than starting its own, and exits
// explicitly: debug-extension.mjs leaves CDP websockets open, so without that
// the process never exits and a finished run looks like a hang.
import {
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

/** Select an element's contents and report the resulting rect. */
const selectContents = (expr) => `(() => {
  const el = ${expr}
  el.scrollIntoView({block:'center'})
  const r = document.createRange(); r.selectNodeContents(el)
  const s = getSelection(); s.removeAllRanges(); s.addRange(r)
  const rect = r.getBoundingClientRect()
  return {sel:{top:Math.round(rect.top),left:Math.round(rect.left),bottom:Math.round(rect.bottom)},
          ranges:getSelection().rangeCount, len:getSelection().toString().length}
})()`

const READ_CARD = `(() => {
  const h = document.querySelector('[data-slop-hammer-card]')
  if (!h) return null
  const root = h.shadowRoot.querySelector('[data-testid="card-root"]')
  const r = root.getBoundingClientRect()
  return {top:Math.round(r.top), left:Math.round(r.left), h:Math.round(r.height), bottom:Math.round(r.bottom)}
})()`

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
    return {sel:{top:Math.round(rect.top),left:Math.round(rect.left),bottom:Math.round(rect.bottom)}, ranges:1, len:s.toString().length}
  })()`,
  ],
  [
    'textarea',
    `(() => {
    const ta=document.getElementById('ta'); ta.scrollIntoView({block:'center'}); ta.focus(); ta.setSelectionRange(0, ta.value.length)
    const rect=ta.getBoundingClientRect(); const s=getSelection()
    return {sel:{top:Math.round(rect.top),left:Math.round(rect.left),bottom:Math.round(rect.bottom)}, ranges:s.rangeCount, len:s.toString().length}
  })()`,
  ],
  [
    'iframe',
    `(() => {
    const f=document.getElementById('frame'); f.scrollIntoView({block:'center'})
    const d=f.contentDocument, el=d.querySelector('.t')
    const r=d.createRange(); r.selectNodeContents(el)
    const s=f.contentWindow.getSelection(); s.removeAllRanges(); s.addRange(r)
    const er=el.getBoundingClientRect(), fr=f.getBoundingClientRect()
    return {sel:{top:Math.round(fr.top+er.top),left:Math.round(fr.left+er.left),bottom:Math.round(fr.top+er.bottom)}, ranges:getSelection().rangeCount, len:getSelection().toString().length}
  })()`,
  ],
  [
    'modal <dialog>',
    `document.getElementById('dlg').showModal(); ` + selectContents(`document.querySelector('#dlg .t')`),
  ],
  // INCONCLUSIVE as written. A non-modal popover has no backdrop and this one
  // does not overlap where the card lands, so `visible=true` here is not
  // evidence that the top layer is survivable. Only the modal dialog is.
  ['popover', `document.getElementById('pop').showPopover(); ` + selectContents(`document.querySelector('#pop .t')`)],
]

/** Scroll so the target paragraph's bottom sits at `fraction` of the viewport. */
const placeAt = (fraction) => `(() => {
  const el = document.querySelector('#c-plain .t')
  el.scrollIntoView({block:'center'})
  const r0 = el.getBoundingClientRect()
  window.scrollBy(0, r0.bottom - innerHeight * ${fraction})
  const r = document.createRange(); r.selectNodeContents(el)
  const s = getSelection(); s.removeAllRanges(); s.addRange(r)
  const rect = r.getBoundingClientRect()
  return {viewport:{h:innerHeight,w:innerWidth}, sel:{top:Math.round(rect.top),bottom:Math.round(rect.bottom)}}
})()`

async function classifyAndRead(page, sw, tabId, id) {
  await dispatchClassify(sw, tabId, TEXT, id)
  await waitForCard(page, 40000)
  return page.eval(READ_CARD, 5000)
}

async function dismiss(page) {
  await page.eval(
    `document.getElementById('dlg')?.close?.(); try{document.getElementById('pop')?.hidePopover?.()}catch(e){}`,
    4000,
  )
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`, 4000)
  await new Promise((r) => setTimeout(r, 400))
}

async function runCases(page, sw, tabId) {
  say('')
  say('case                    selBot  cardTop    gap  selLeft cardLeft     dx  visible onScreen  selection')
  say('-'.repeat(104))
  for (const [label, expr] of CASES) {
    const info = await page.eval(expr, 6000)
    if (!info || info.__error) {
      say(`${label.padEnd(23)} SELECT FAILED: ${info?.__error}`)
      continue
    }
    await dispatchClassify(sw, tabId, TEXT, 'placement-' + label.replace(/\W+/g, '-'))
    const card = await waitForCard(page, 40000)
    const gap = card?.rect ? card.rect.top - info.sel.bottom : null
    const dx = card?.rect ? card.rect.left - info.sel.left : null
    say(
      `${label.padEnd(23)} ${String(info.sel.bottom).padStart(6)} ${String(card?.rect?.top ?? '-').padStart(8)} ` +
        `${String(gap ?? '-').padStart(6)} ${String(info.sel.left).padStart(8)} ${String(card?.rect?.left ?? '-').padStart(8)} ` +
        `${String(dx ?? '-').padStart(6)}  ${String(card?.visibleToUser).padEnd(7)} ${String(card?.onScreen).padEnd(8)}  ranges=${info.ranges} chars=${info.len}`,
    )
    await dismiss(page)
  }

  // Does the card follow the text when the page scrolls?
  say('')
  await page.eval(selectContents(`document.querySelector('#c-plain .t')`), 6000)
  const before = await classifyAndRead(page, sw, tabId, 'placement-scroll')
  const readSel = `(()=>{const r=getSelection().getRangeAt(0).getBoundingClientRect();return{bottom:Math.round(r.bottom)}})()`
  const selBefore = await page.eval(readSel, 4000)
  await page.eval(`window.scrollBy(0, 400)`, 4000)
  await new Promise((r) => setTimeout(r, 700))
  const selAfter = await page.eval(readSel, 4000)
  const cardAfter = await page.eval(READ_CARD, 4000)
  say('scroll test — page scrolled 400px after the card was placed')
  say(`  selection bottom : ${selBefore.bottom} -> ${selAfter.bottom}   (moved ${selAfter.bottom - selBefore.bottom}px)`)
  say(`  card top         : ${before.top} -> ${cardAfter.top}   (moved ${cardAfter.top - before.top}px)`)
  say(`  gap to selection : ${before.top - selBefore.bottom} -> ${cardAfter.top - selAfter.bottom}`)
  await dismiss(page)
}

async function runGeometry(page, sw, tabId) {
  say('')
  say('selection sits at   viewport  selTop selBot  cardTop cardH cardBot    gap  placement')
  say('-'.repeat(100))
  for (const [label, fraction] of [
    ['15% (near top)', 0.15],
    ['35%', 0.35],
    ['55% (mid page)', 0.55],
    ['85% (near bottom)', 0.85],
  ]) {
    const info = await page.eval(placeAt(fraction), 6000)
    const c = await classifyAndRead(page, sw, tabId, 'geometry-' + fraction)
    const gap = c.top - info.sel.bottom
    const fitsBelow = info.sel.bottom + 8 + c.h + 8 <= info.viewport.h
    const fitsAbove = info.sel.top - c.h - 8 >= 8
    const placement = gap > 0 ? 'BELOW text' : c.top === 8 ? 'CLAMPED to viewport top' : 'above text'
    say(
      `${label.padEnd(19)} ${String(info.viewport.h).padStart(8)} ${String(info.sel.top).padStart(7)} ${String(info.sel.bottom).padStart(6)} ` +
        `${String(c.top).padStart(8)} ${String(c.h).padStart(5)} ${String(c.bottom).padStart(7)} ${String(gap).padStart(6)}  ${placement}` +
        `   (fitsBelow=${fitsBelow} fitsAbove=${fitsAbove})`,
    )
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
  const sw = await getServiceWorker()

  const open = (await targets()).filter((t) => t.type === 'page' && t.url.startsWith(PLACEMENT_URL))
  if (open.length !== 1) {
    throw new Error(`expected exactly one tab on ${PLACEMENT_URL}, found ${open.length} — refusing to guess`)
  }
  const tabId = await tabIdForHref(sw, PLACEMENT_URL)

  if (only !== 'geometry') await runCases(page, sw, tabId)
  if (only !== 'cases') await runGeometry(page, sw, tabId)

  await closeTab(page)
} catch (error) {
  failure = error
  console.error('PLACEMENT QA FAILED:', error?.stack ?? error)
}

say(`\nPLACEMENT QA COMPLETE exit=${failure ? 1 : 0}`)
// CDP websockets stay open; without this the process never exits and a finished
// run looks like a hang.
process.exit(failure ? 1 : 0)
