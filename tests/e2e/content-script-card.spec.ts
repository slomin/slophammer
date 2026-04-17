import { test, expect, gotoHtml } from './fixtures'

const LONG_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'This pangram must exceed seventy-five characters to satisfy the minimum-selection rule.'

test('content script renders result card on classify dispatch', async ({ context }) => {
  const page = await context.newPage()
  await gotoHtml(page, `<p id="t">${LONG_TEXT}</p>`)
  await page.waitForLoadState('domcontentloaded')

  // Wait for the content script's log to confirm it injected.
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))

  // Locate the tab by URL so we don't depend on "active" flags.
  const tabId = await worker.evaluate(async (pageUrl) => {
    for (let i = 0; i < 20; i++) {
      const tabs = await chrome.tabs.query({ url: pageUrl + '*' })
      if (tabs[0]?.id != null) return tabs[0].id
      await new Promise((r) => setTimeout(r, 100))
    }
    return -1
  }, page.url().split('?')[0])
  expect(tabId, 'SW could not find the test page tab').toBeGreaterThan(0)

  // Ensure the content script is alive by pinging it. We retry for up to ~3s
  // to ride over the short delay between navigation and content-script injection.
  const pingOk = await worker.evaluate(async (tabId) => {
    for (let i = 0; i < 30; i++) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId as number },
          func: () => 'alive',
        })
        return true
      } catch {
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    return false
  }, tabId)
  expect(pingOk, 'content-script frame never became executable').toBe(true)

  const requestId = 'e2e-' + Date.now()

  await worker.evaluate(
    async ([tabId, requestId, text]) => {
      await chrome.tabs.sendMessage(tabId as number, {
        type: 'classify:started',
        requestId: requestId as string,
        preview: (text as string).slice(0, 200),
        wordCount: (text as string).trim().split(/\s+/).length,
        charCount: (text as string).length,
      })
      await chrome.runtime.sendMessage({
        type: 'classify:run',
        requestId: requestId as string,
        tabId: tabId as number,
        text: text as string,
      })
    },
    [tabId, requestId, LONG_TEXT],
  )

  const card = page.locator('slop-hammer-card')
  await expect(card).toBeAttached({ timeout: 4000 })

  await expect
    .poll(
      async () =>
        card.evaluate((el) => {
          const root = el.shadowRoot?.querySelector<HTMLElement>('[data-testid="card-root"]')
          return root?.dataset.state ?? null
        }),
      { timeout: 4000 },
    )
    .toBe('ready')

  const snapshot = await card.evaluate((el) => {
    const s = el.shadowRoot!
    const q = (id: string) => s.querySelector<HTMLElement>(`[data-testid="${id}"]`)
    return {
      primaryLabel: q('primary-label')?.textContent ?? null,
      primaryPct: q('primary-pct')?.textContent ?? null,
      aiPct: q('bar-ai')?.dataset.pct ?? null,
      mixedPct: q('bar-mixed')?.dataset.pct ?? null,
      humanPct: q('bar-human')?.dataset.pct ?? null,
    }
  })

  expect(['AI-Generated', 'AI-Assisted', 'Human Written']).toContain(snapshot.primaryLabel)
  expect(snapshot.primaryPct).toMatch(/^\d+(\.\d)?$|^100$/)
  const buckets = [snapshot.aiPct, snapshot.mixedPct, snapshot.humanPct]
  expect(buckets.filter((b) => b === '100')).toHaveLength(1)
  expect(buckets.filter((b) => b === '0')).toHaveLength(2)
})
