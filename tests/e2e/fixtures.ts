import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

export async function gotoHtml(page: import('@playwright/test').Page, body: string, urlPath = '/t.html'): Promise<void> {
  const url = `http://slop-hammer.test${urlPath}`
  await page.route(`${url}*`, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body>${body}</body></html>`,
    }),
  )
  await page.goto(url)
}

export const expect = test.expect
