import {
  test as base,
  chromium,
  type BrowserContext,
  type Locator,
  type Page,
  type Worker,
} from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Settings } from '@/settings/settings-types'

export const test = base.extend<{
  context: BrowserContext
  extensionId: string
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const extPath = path.resolve('.output/chrome-mv3')
    if (!fs.existsSync(extPath)) {
      throw new Error(`Extension build not found at ${extPath}. Run: pnpm build`)
    }

    const binPathFile = path.resolve('chrome-for-testing/bin-path.txt')
    const executablePath = fs.existsSync(binPathFile)
      ? fs.readFileSync(binPathFile, 'utf8').trim()
      : undefined

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slophammer-e2e-'))
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      executablePath,
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--use-mock-keychain',
        '--password-store=basic',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    })
    await use(context)
    await context.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  },

  extensionId: async ({ context }, use) => {
    let worker: Worker | undefined = context.serviceWorkers()[0]
    if (!worker) worker = await context.waitForEvent('serviceworker')
    const id = worker.url().split('/')[2]
    if (!id) throw new Error('failed to extract extension id from ' + worker.url())
    await use(id)
  },
})

export const TEST_ORIGIN = 'http://slop-hammer.test'

export async function gotoHtml(
  page: Page,
  body: string,
  urlPath = '/t.html',
  options?: { head?: string },
): Promise<void> {
  const url = `${TEST_ORIGIN}${urlPath}`
  await page.route(`${url}*`, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head>${options?.head ?? ''}</head><body>${body}</body></html>`,
    }),
  )
  await page.goto(url)
}

// Serve several whole documents by pathname — a page and the frame it embeds,
// for instance. Anything else on the origin is a 404 rather than a hang.
export async function gotoRoutes(page: Page, routes: Record<string, string>, pathname: string): Promise<void> {
  await page.route(`${TEST_ORIGIN}/**`, (route) => {
    const requested = new URL(route.request().url()).pathname
    const body = routes[requested]
    if (body === undefined) return route.fulfill({ status: 404, body: 'not found' })
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body })
  })
  await page.goto(`${TEST_ORIGIN}${pathname}`)
}

export const CARD_HOST_SELECTOR = '[data-slop-hammer-card]'

// These specs cover the card's rendering, geometry and controls, so they drive
// it with a synthetic result rather than running inference. The e2e profile has
// no model installed; this used to reach 'ready' only because a missing model
// silently fell back to a fake classifier that invented verdicts. Now that the
// extension fails loudly instead (see #19), the card would sit in 'error'.
export const SYNTHETIC_RESULT = {
  probs: [0.05, 0.1, 0.15, 0.7],
  rawPct: [5, 10, 15, 70],
  bucketLabels: ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'],
  extLlr: 4.2,
  threshold: 3.8088,
  verdict: 'flagged',
  tokenCount: 40,
  analysedTokens: 40,
  truncated: false,
}

export async function serviceWorkerFor(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
}

export async function tabIdFor(context: BrowserContext, page: Page): Promise<number> {
  const worker = await serviceWorkerFor(context)
  const tabId = await worker.evaluate(async (pageUrl) => {
    for (let i = 0; i < 20; i++) {
      const tabs = await chrome.tabs.query({ url: pageUrl + '*' })
      if (tabs[0]?.id != null) return tabs[0].id
      await new Promise((r) => setTimeout(r, 100))
    }
    return -1
  }, page.url().split('?')[0])
  test.expect(tabId, 'SW could not find the test page tab').toBeGreaterThan(0)
  return tabId
}

let requestCounter = 0

export async function dispatchClassification(context: BrowserContext, page: Page, text: string): Promise<Locator> {
  const worker = await serviceWorkerFor(context)
  const tabId = await tabIdFor(context, page)
  const requestId = `e2e-${Date.now()}-${requestCounter++}`

  await worker.evaluate(
    async ([tabId, requestId, text, result]) => {
      const startedMsg = {
        type: 'classify:started',
        requestId: requestId as string,
        preview: (text as string).slice(0, 200),
        wordCount: (text as string).trim().split(/\s+/).length,
        charCount: (text as string).length,
      }
      for (let i = 0; i < 50; i++) {
        try {
          await chrome.tabs.sendMessage(tabId as number, startedMsg)
          break
        } catch {
          await new Promise((r) => setTimeout(r, 100))
        }
      }
      await chrome.tabs.sendMessage(tabId as number, {
        type: 'classify:result',
        requestId: requestId as string,
        tabId: tabId as number,
        result,
      })
    },
    [tabId, requestId, text, SYNTHETIC_RESULT] as const,
  )

  return page.locator(CARD_HOST_SELECTOR)
}

// Writes settings the way the options page does, so the content script's
// storage subscription picks them up live.
export async function setSettings(context: BrowserContext, patch: Partial<Settings>): Promise<void> {
  const worker = await serviceWorkerFor(context)
  await worker.evaluate(async (patch) => {
    const key = 'slophammer-settings'
    const current = (await chrome.storage.local.get(key))[key] ?? {}
    await chrome.storage.local.set({ [key]: { ...current, ...patch } })
  }, patch)
}

export const expect = test.expect
