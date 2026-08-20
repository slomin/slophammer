#!/usr/bin/env node
import { chromium } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
process.chdir(repoRoot)

const OUT_DIR = path.resolve('store-assets/chrome-web-store')
const TMP_DIR = path.join(os.tmpdir(), `slophammer-store-assets-${Date.now()}`)
const EXT_PATH = path.resolve('.output/chrome-mv3')
const WIDTH = 1280
const HEIGHT = 800

const LONG_TEXT =
  `In today's rapidly evolving digital landscape, leveraging artificial intelligence to drive transformative business outcomes has become not just an advantage, but a necessity. Organizations that proactively embrace cutting-edge AI solutions are uniquely positioned to unlock unprecedented value, streamline operational efficiency, and foster a culture of continuous innovation.`

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

async function normalize(input, output, width, height) {
  await sharp(input)
    .resize(width, height, {
      fit: 'cover',
      position: 'center',
    })
    .png({ compressionLevel: 9 })
    .toFile(output)
}

async function dispatchClassification(context, page, text) {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const tabId = await worker.evaluate(async (pageUrl) => {
    for (let i = 0; i < 20; i++) {
      const tabs = await chrome.tabs.query({ url: pageUrl + '*' })
      if (tabs[0]?.id != null) return tabs[0].id
      await new Promise((r) => setTimeout(r, 100))
    }
    return -1
  }, page.url().split('?')[0])
  if (tabId < 1) throw new Error('Could not find fixture tab for screenshot capture')

  const requestId = 'store-assets-' + Date.now()
  await worker.evaluate(
    async ([tabId, requestId, text, result]) => {
      await chrome.storage.local.set({
        'slophammer-settings': {
          resultDetail: 'basic',
          theme: 'light',
        },
      })
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

async function waitForReadyCard(page) {
  await page.waitForFunction(() => {
    const host = document.querySelector('[data-slop-hammer-card]')
    const root = host?.shadowRoot?.querySelector('[data-testid="card-root"]')
    return root?.dataset.state === 'ready'
  })
}

async function placeCardForStore(page) {
  await page.evaluate(() => {
    const host = document.querySelector('[data-slop-hammer-card]')
    const root = host?.shadowRoot?.querySelector('[data-testid="card-root"]')
    if (!(root instanceof HTMLElement)) return
    root.style.left = '872px'
    root.style.top = '126px'
  })
}

async function main() {
  if (!existsSync(EXT_PATH)) {
    throw new Error(`Extension build not found at ${EXT_PATH}. Run: pnpm build`)
  }

  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(TMP_DIR, {
    headless: false,
    executablePath: chromeExecutablePath(),
    viewport: { width: WIDTH, height: HEIGHT },
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
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    const extensionId = worker.url().split('/')[2]
    if (!extensionId) throw new Error('Could not detect extension id')
    await worker.evaluate(() =>
      chrome.storage.local.set({
        'slophammer-settings': {
          resultDetail: 'basic',
          theme: 'light',
        },
      }),
    )

    const options = await context.newPage()
    await options.setViewportSize({ width: WIDTH, height: HEIGHT })
    await options.goto(`chrome-extension://${extensionId}/options.html`)
    await options.screenshot({ path: path.join(OUT_DIR, 'screenshot-options-1280x800.png') })

    const fixture = await context.newPage()
    await fixture.setViewportSize({ width: WIDTH, height: HEIGHT })
    await fixture.route('http://slop-hammer-store.test/*', (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SlopHammer store capture</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #fafaf7;
      color: #17171a;
      font: 14px ui-monospace, Menlo, monospace;
      padding: 44px 48px;
    }
    main { max-width: 760px; }
    .brand {
      color: #d94e1f;
      letter-spacing: .08em;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 28px;
    }
    h1 {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 40px;
      line-height: 1.08;
      margin: 0 0 18px;
      font-weight: 500;
    }
    p {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 19px;
      line-height: 1.62;
      margin: 0 0 20px;
    }
    .note {
      color: #6d6a61;
      border-top: 1px dashed #d8d5cc;
      padding-top: 14px;
      font-size: 12px;
      font-family: ui-monospace, Menlo, monospace;
    }
  </style>
</head>
<body>
  <main>
    <div class="brand">SlopHammer</div>
    <h1>Check selected text without sending it to a remote analysis service.</h1>
    <p id="sample">${LONG_TEXT}</p>
    <div class="note">Select at least 40 words, right-click, and choose Check with SlopHammer.</div>
  </main>
</body>
</html>`,
      }),
    )
    await fixture.goto('http://slop-hammer-store.test/')
    await dispatchClassification(context, fixture, LONG_TEXT)
    await waitForReadyCard(fixture)
    await placeCardForStore(fixture)

    await fixture.screenshot({ path: path.join(OUT_DIR, 'screenshot-result-basic-1280x800.png') })

    await fixture.evaluate(() => {
      const host = document.querySelector('[data-slop-hammer-card]')
      const toggle = host?.shadowRoot?.querySelector('[data-testid="mode-toggle"]')
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    })
    await fixture.waitForFunction(() => {
      const host = document.querySelector('[data-slop-hammer-card]')
      const root = host?.shadowRoot?.querySelector('[data-testid="card-root"]')
      return root?.dataset.mode === 'advanced'
    })
    await fixture.waitForTimeout(300)
    await placeCardForStore(fixture)
    await fixture.screenshot({ path: path.join(OUT_DIR, 'screenshot-result-advanced-1280x800.png') })

    const promoSource = path.join(OUT_DIR, 'screenshot-result-basic-1280x800.png')
    await normalize(promoSource, path.join(OUT_DIR, 'promo-small-440x280.png'), 440, 280)

    writeFileSync(
      path.join(OUT_DIR, 'README.md'),
      `# Chrome Web Store assets

Generated with:

\`\`\`sh
pnpm build
node scripts/capture-store-assets.mjs
\`\`\`

All screenshots are captured in light theme from deterministic local extension
surfaces.
`,
    )
  } finally {
    await context.close()
    rmSync(TMP_DIR, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
