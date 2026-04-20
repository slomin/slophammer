import { test, expect, gotoHtml } from './fixtures'

const LONG_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'This pangram must exceed seventy-five characters to satisfy the minimum-selection rule.'
const CARD_HOST_SELECTOR = '[data-slop-hammer-card]'
const HOSTILE_PAGE_HEAD = '<style>:not(:defined) { visibility: hidden; }</style>'

async function dispatchClassification(
  context: import('@playwright/test').BrowserContext,
  page: import('@playwright/test').Page,
  text: string,
) {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))

  const tabId = await worker.evaluate(async (pageUrl) => {
    for (let i = 0; i < 20; i++) {
      const tabs = await chrome.tabs.query({ url: pageUrl + '*' })
      if (tabs[0]?.id != null) return tabs[0].id
      await new Promise((r) => setTimeout(r, 100))
    }
    return -1
  }, page.url().split('?')[0])
  expect(tabId, 'SW could not find the test page tab').toBeGreaterThan(0)

  const requestId = 'e2e-' + Date.now()
  await worker.evaluate(
    async ([tabId, requestId, text]) => {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: 'e2e smoke',
      }).catch(() => { /* already exists */ })

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

      for (let i = 0; i < 50; i++) {
        try {
          await chrome.runtime.sendMessage({
            type: 'classify:run',
            requestId: requestId as string,
            tabId: tabId as number,
            text: text as string,
          })
          break
        } catch {
          await new Promise((r) => setTimeout(r, 100))
        }
      }
    },
    [tabId, requestId, text],
  )

  return page.locator(CARD_HOST_SELECTOR)
}

test('content script renders result card on classify dispatch', async ({ context }) => {
  const page = await context.newPage()
  await gotoHtml(page, `<p id="t">${LONG_TEXT}</p>`)
  await page.waitForLoadState('domcontentloaded')

  const card = await dispatchClassification(context, page, LONG_TEXT)
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

test('content script remains visible when the page hides undefined custom elements', async ({ context }) => {
  const page = await context.newPage()
  await gotoHtml(page, `<p id="t">${LONG_TEXT}</p>`, '/hostile.html', { head: HOSTILE_PAGE_HEAD })
  await page.waitForLoadState('domcontentloaded')

  const card = await dispatchClassification(context, page, LONG_TEXT)
  await expect(card).toBeAttached({ timeout: 4000 })

  await expect
    .poll(
      async () =>
        card.evaluate((el) => {
          const root = el.shadowRoot?.querySelector<HTMLElement>('[data-testid="card-root"]')
          return {
            state: root?.dataset.state ?? null,
            hostVisibility: getComputedStyle(el).visibility,
            rootVisibility: root ? getComputedStyle(root).visibility : null,
          }
        }),
      { timeout: 4000 },
    )
    .toEqual({
      state: 'ready',
      hostVisibility: 'visible',
      rootVisibility: 'visible',
    })
})
