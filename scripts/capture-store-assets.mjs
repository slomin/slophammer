#!/usr/bin/env node
// Chrome Web Store assets in two stages.
//
//   1. Capture the real product from the built extension: the result card in
//      Basic and Advanced detail, in light and dark, and the options page. The
//      card is the one the content script mounts — same DOM, same styles — fed
//      a fixed synthetic result so the numbers are stable between runs.
//   2. Render each scene from store-scenes.mjs at its exact Store size with
//      those captures embedded, and screenshot it. Every output is checked
//      against the size the Store expects before the run is called good.
//
//   pnpm build
//   pnpm store:assets [--copy-to <dir>]
//
// Captures are taken at 2x and embedded at CSS size, so the product pixels stay
// crisp after the scene is rendered at 1x.
import { chromium } from '@playwright/test'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { SCENES } from './store-scenes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
process.chdir(repoRoot)

const argv = process.argv.slice(2)
const copyToIndex = argv.indexOf('--copy-to')
const COPY_TO = copyToIndex === -1 ? null : argv[copyToIndex + 1]
if (copyToIndex !== -1 && (!COPY_TO || COPY_TO.startsWith('--'))) {
  console.error('--copy-to requires a directory')
  process.exit(1)
}

const OUT_DIR = path.resolve('store-assets/chrome-web-store')
const TMP_DIR = path.join(os.tmpdir(), `slophammer-store-assets-${process.pid}`)
const PROFILE_DIR = path.join(TMP_DIR, 'profile')
const CAPTURE_DIR = path.join(TMP_DIR, 'captures')
const EXT_PATH = path.resolve('.output/chrome-mv3')
const FIXTURE_URL = 'http://slop-hammer-store.test/'
// Room around the card for its drop shadow (24px blur + 8px offset in dark).
const CARD_PAD = 32
const OPTIONS_VIEWPORT = { width: 720, height: 720 }

const LONG_TEXT =
  `In today's rapidly evolving digital landscape, leveraging artificial intelligence to drive transformative business outcomes has become not just an advantage, but a necessity. Organizations that proactively embrace cutting-edge AI solutions are uniquely positioned to unlock unprecedented value, streamline operational efficiency, and foster a culture of continuous innovation.`

// Fixed fixture: the card renders these exactly as it would a real result.
const SYNTHETIC_RESULT = {
  probs: [0.05, 0.1, 0.15, 0.7],
  rawPct: [5, 10, 15, 70],
  bucketLabels: ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'],
  extLlr: 4.2,
  threshold: 3.8088,
  verdict: 'flagged',
  tokenCount: 58,
  analysedTokens: 58,
  truncated: false,
}

function chromeExecutablePath() {
  const binPathFile = path.resolve('chrome-for-testing/bin-path.txt')
  if (!existsSync(binPathFile)) return undefined
  const p = readFileSync(binPathFile, 'utf8').trim()
  return p || undefined
}

const CARD_ROOT = `document.querySelector('[data-slop-hammer-card]')?.shadowRoot?.querySelector('[data-testid="card-root"]')`

async function serviceWorker(context) {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
}

async function setSettings(context, settings) {
  const worker = await serviceWorker(context)
  await worker.evaluate(async (value) => {
    await chrome.storage.local.set({ 'slophammer-settings': value })
  }, settings)
}

async function dispatchClassification(context, page, text) {
  const worker = await serviceWorker(context)
  const tabId = await worker.evaluate(async (pageUrl) => {
    for (let i = 0; i < 20; i++) {
      const tabs = await chrome.tabs.query({ url: pageUrl + '*' })
      if (tabs[0]?.id != null) return tabs[0].id
      await new Promise((r) => setTimeout(r, 100))
    }
    return -1
  }, page.url().split('?')[0])
  if (tabId < 1) throw new Error('Could not find fixture tab for screenshot capture')

  const requestId = 'store-assets-' + process.pid
  await worker.evaluate(
    async ([tabId, requestId, text, result]) => {
      const startedMsg = {
        type: 'classify:started',
        requestId,
        preview: text.slice(0, 200),
        wordCount: text.trim().split(/\s+/).length,
        charCount: text.length,
      }
      for (let i = 0; i < 50; i++) {
        try {
          await chrome.tabs.sendMessage(tabId, startedMsg)
          break
        } catch {
          await new Promise((r) => setTimeout(r, 100))
        }
      }
      await chrome.tabs.sendMessage(tabId, { type: 'classify:result', requestId, tabId, result })
    },
    [tabId, requestId, text, SYNTHETIC_RESULT],
  )
}

async function waitForCard(page, predicate) {
  await page.waitForFunction(
    ([rootExpr, src]) => {
      const root = eval(rootExpr)
      if (!(root instanceof HTMLElement)) return false
      return new Function('root', `return (${src})(root)`)(root)
    },
    [CARD_ROOT, predicate.toString()],
  )
}

// Park the card on plain canvas so the capture around it contains nothing but
// paper and its own shadow. Placement only recomputes on state, size or
// viewport changes, so an explicit position holds until the next one; re-apply
// after anything that changes the card's size.
async function parkCard(page, left, top) {
  for (let i = 0; i < 5; i++) {
    await page.evaluate(
      ([rootExpr, left, top]) => {
        const root = eval(rootExpr)
        root.style.left = `${left}px`
        root.style.top = `${top}px`
      },
      [CARD_ROOT, left, top],
    )
    await page.waitForTimeout(120)
    const box = await cardBox(page)
    if (Math.abs(box.x - left) < 1 && Math.abs(box.y - top) < 1) return box
  }
  throw new Error('card did not stay where it was parked')
}

async function cardBox(page) {
  return page.evaluate((rootExpr) => {
    const r = eval(rootExpr).getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  }, CARD_ROOT)
}

async function captureCard(page, name) {
  // The paragraph only exists to anchor the card; once the card is up it must
  // not bleed into the capture, and the page itself must stay transparent so
  // the card and its shadow composite over whatever the scene puts behind them.
  await page.evaluate(() => {
    const sample = document.getElementById('sample')
    if (sample) sample.style.visibility = 'hidden'
  })
  const box = await parkCard(page, 200, 120)
  const clip = {
    x: box.x - CARD_PAD,
    y: box.y - CARD_PAD,
    width: box.width + CARD_PAD * 2,
    height: box.height + CARD_PAD * 2,
  }
  const file = path.join(CAPTURE_DIR, `${name}.png`)
  await page.screenshot({ path: file, clip, scale: 'device', omitBackground: true })
  return { dataUri: dataUri(file), width: clip.width, height: clip.height }
}

function dataUri(file) {
  return `data:image/png;base64,${readFileSync(file).toString('base64')}`
}

// waitForCard serialises the predicate, so the mode has to travel with it.
const withMode = (mode) => new Function('root', `return root.dataset.mode === ${JSON.stringify(mode)}`)

async function captureProduct() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: chromeExecutablePath(),
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--use-mock-keychain',
      '--password-store=basic',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-color-profile=srgb',
    ],
  })
  try {
    const worker = await serviceWorker(context)
    const extensionId = worker.url().split('/')[2]
    if (!extensionId) throw new Error('Could not detect extension id')
    await setSettings(context, { resultDetail: 'basic', theme: 'light', cardPlacement: 'anchored' })

    // Options page — the real surface, at a width where it reads as one column.
    const options = await context.newPage()
    await options.setViewportSize(OPTIONS_VIEWPORT)
    await options.goto(`chrome-extension://${extensionId}/options.html`)
    await options.waitForLoadState('networkidle')
    await options.waitForTimeout(300)
    const optionsFile = path.join(CAPTURE_DIR, 'options.png')
    await options.screenshot({ path: optionsFile, fullPage: true, scale: 'device' })
    const optionsMeta = await sharp(optionsFile).metadata()
    const captures = {
      options: { dataUri: dataUri(optionsFile), width: optionsMeta.width / 2, height: optionsMeta.height / 2 },
    }
    await options.close()

    // Result card — mounted by the content script on a plain paper page.
    const fixture = await context.newPage()
    await fixture.route(`${FIXTURE_URL}*`, (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SlopHammer store capture</title>
<style>:root{color-scheme:light}html,body{background:transparent}body{margin:0;color:#17171a;font:15px Georgia,serif;padding:24px 32px}p{max-width:520px;margin:0}</style>
</head><body><p id="sample">${LONG_TEXT}</p></body></html>`,
      }),
    )
    await fixture.goto(FIXTURE_URL)
    await dispatchClassification(context, fixture, LONG_TEXT)
    await waitForCard(fixture, (root) => root.dataset.state === 'ready')
    // The card lands below the paragraph; parking moves it onto empty paper.
    captures.cardBasicLight = await captureCard(fixture, 'card-basic-light')

    await fixture.evaluate((rootExpr) => {
      eval(rootExpr).querySelector('[data-testid="mode-toggle"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    }, CARD_ROOT)
    await waitForCard(fixture, withMode('advanced'))
    await fixture.waitForTimeout(350)
    captures.cardAdvancedLight = await captureCard(fixture, 'card-advanced-light')

    await fixture.evaluate((rootExpr) => {
      eval(rootExpr).querySelector('[data-testid="mode-toggle"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    }, CARD_ROOT)
    await waitForCard(fixture, withMode('basic'))
    await fixture.waitForTimeout(350)

    await setSettings(context, { resultDetail: 'basic', theme: 'dark', cardPlacement: 'anchored' })
    await waitForCard(fixture, (root) => root.classList.contains('dark'))
    await fixture.waitForTimeout(200)
    captures.cardBasicDark = await captureCard(fixture, 'card-basic-dark')

    return captures
  } finally {
    await context.close()
  }
}

async function renderScenes(captures) {
  const browser = await chromium.launch({ headless: true, executablePath: chromeExecutablePath() })
  const problems = []
  try {
    for (const scene of SCENES) {
      const page = await browser.newPage({
        viewport: { width: scene.width, height: scene.height },
        deviceScaleFactor: 1,
        colorScheme: 'light',
      })
      await page.setContent(scene.render(captures), { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(150)
      const file = path.join(OUT_DIR, `${scene.name}.png`)
      await page.screenshot({ path: file, scale: 'css', fullPage: false })
      await page.close()

      const meta = await sharp(file).metadata()
      const ok = meta.width === scene.width && meta.height === scene.height && !meta.hasAlpha
      console.log(
        `${ok ? 'PASS' : 'FAIL'}  ${scene.name.padEnd(34)} ${meta.width}x${meta.height}${meta.hasAlpha ? ' (alpha!)' : ''}`,
      )
      if (!ok) problems.push(scene.name)
    }
  } finally {
    await browser.close()
  }
  return problems
}

function writeReadme() {
  writeFileSync(
    path.join(OUT_DIR, 'README.md'),
    `# Chrome Web Store assets

Generated with:

\`\`\`sh
pnpm build
pnpm store:assets
\`\`\`

Two stages: the result card (Basic/Advanced, light/dark) and the options page are
captured from the built extension — real DOM, real styles, fed one fixed synthetic
result so the numbers are stable — then each scene in \`scripts/store-scenes.mjs\`
is rendered at its exact Store size with those captures embedded.

| File | Size | Store slot |
|---|---|---|
| \`screenshot-1-hero-1280x800.png\` | 1280x800 | Screenshot 1 |
| \`screenshot-2-advanced-1280x800.png\` | 1280x800 | Screenshot 2 |
| \`screenshot-3-flow-1280x800.png\` | 1280x800 | Screenshot 3 |
| \`screenshot-4-options-1280x800.png\` | 1280x800 | Screenshot 4 |
| \`screenshot-5-themes-1280x800.png\` | 1280x800 | Screenshot 5 |
| \`promo-small-440x280.png\` | 440x280 | Small promo tile (required) |
| \`promo-marquee-1400x560.png\` | 1400x560 | Marquee promo tile |

The verdict on the card is a fixture (\`rawPct: [5, 10, 15, 70]\`), not a
classification of the sample paragraph. Every visible product name is
\`SlopHammer\`.
`,
  )
}

async function main() {
  if (!existsSync(EXT_PATH)) {
    throw new Error(`Extension build not found at ${EXT_PATH}. Run: pnpm build`)
  }
  rmSync(TMP_DIR, { recursive: true, force: true })
  mkdirSync(CAPTURE_DIR, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  let problems
  try {
    const captures = await captureProduct()
    rmSync(OUT_DIR, { recursive: true, force: true })
    mkdirSync(OUT_DIR, { recursive: true })
    problems = await renderScenes(captures)
    writeReadme()
  } finally {
    rmSync(TMP_DIR, { recursive: true, force: true })
  }

  if (problems.length) {
    throw new Error(`assets with the wrong dimensions: ${problems.join(', ')}`)
  }
  if (COPY_TO) {
    const dest = path.resolve(COPY_TO)
    mkdirSync(dest, { recursive: true })
    cpSync(OUT_DIR, dest, { recursive: true })
    console.log(`copied to ${dest}`)
  }
  console.log(`assets ready in ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
