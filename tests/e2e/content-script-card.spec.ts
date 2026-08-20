import { test, expect, gotoHtml } from './fixtures'

const LONG_TEXT =
  Array.from({ length: 40 }, (_, index) => `supported-word-${index + 1}`).join(' ')
const CARD_HOST_SELECTOR = '[data-slop-hammer-card]'
const HOSTILE_PAGE_HEAD = '<style>:not(:defined) { visibility: hidden; }</style>'

// These specs cover the card's rendering, geometry and controls, so they drive
// it with a synthetic result rather than running inference. The e2e profile has
// no model installed; this used to reach 'ready' only because a missing model
// silently fell back to a fake classifier that invented verdicts. Now that the
// extension fails loudly instead (see #19), the card would sit in 'error'.
const SYNTHETIC_RESULT = {
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

async function serviceWorkerFor(context: import('@playwright/test').BrowserContext) {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
}

async function tabIdFor(
  context: import('@playwright/test').BrowserContext,
  page: import('@playwright/test').Page,
) {
  const worker = await serviceWorkerFor(context)
  const tabId = await worker.evaluate(async (pageUrl) => {
    for (let i = 0; i < 20; i++) {
      const tabs = await chrome.tabs.query({ url: pageUrl + '*' })
      if (tabs[0]?.id != null) return tabs[0].id
      await new Promise((r) => setTimeout(r, 100))
    }
    return -1
  }, page.url().split('?')[0])
  expect(tabId, 'SW could not find the test page tab').toBeGreaterThan(0)
  return tabId
}

async function dispatchClassification(
  context: import('@playwright/test').BrowserContext,
  page: import('@playwright/test').Page,
  text: string,
) {
  const worker = await serviceWorkerFor(context)
  const tabId = await tabIdFor(context, page)
  const requestId = 'e2e-' + Date.now()

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
      verdictLabel: q('verdict-label')?.textContent ?? null,
      verdictConfidence: q('verdict-confidence')?.textContent ?? null,
      verdictBig: q('verdict-big')?.textContent ?? null,
      verdictSide: q('verdict-box')?.dataset.verdict ?? null,
      verdictText: q('verdict-text')?.textContent ?? null,
      cardText: q('card-root')?.textContent ?? null,
      headVersion: q('head-version')?.textContent ?? null,
    }
  })

  expect(snapshot.verdictLabel).toBe('AI')
  expect(snapshot.verdictConfidence).toBe('HIGH CONFIDENCE')
  expect(snapshot.verdictBig).toBe('90')
  expect(snapshot.verdictText).toBe('Likely AI-generated')
  expect(snapshot.cardText).not.toMatch(/Model estimate|not proof of authorship/i)
  expect(snapshot.verdictSide).toBe('ai')
  expect(snapshot.headVersion).toBe('v1.0.0')
})

test('advanced toggle expands raw distribution and analysis time only', async ({ context }) => {
  const page = await context.newPage()
  await gotoHtml(page, `<p id="t">${LONG_TEXT}</p>`)
  await page.waitForLoadState('domcontentloaded')
  const card = await dispatchClassification(context, page, LONG_TEXT)
  await expect(card).toBeAttached({ timeout: 4000 })
  await expect
    .poll(async () => card.evaluate((el) =>
      el.shadowRoot?.querySelector<HTMLElement>('[data-testid="card-root"]')?.dataset.state ?? null,
    ), { timeout: 4000 })
    .toBe('ready')

  await card.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="mode-toggle"]')?.click(),
  )

  const mode = await card.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLElement>('[data-testid="card-root"]')?.dataset.mode ?? null,
  )
  expect(mode).toBe('advanced')
  await expect.poll(() => card.evaluate((el) => {
    const advanced = el.shadowRoot?.querySelector<HTMLElement>('[data-testid="advanced"]')
    return advanced ? getComputedStyle(advanced).opacity : null
  })).toBe('1')
  const advanced = await card.evaluate((el) => {
    const s = el.shadowRoot!
    const q = (id: string) => s.querySelector<HTMLElement>(`[data-testid="${id}"]`)
    return {
      visible: q('advanced') ? getComputedStyle(q('advanced')!).opacity : null,
      time: q('analysis-time')?.textContent,
      text: q('advanced')?.textContent,
      labels: [0, 1, 2, 3].map((i) => q(`raw-${i}`)?.querySelector('.name')?.textContent),
      pcts: [0, 1, 2, 3].map((i) => q(`raw-${i}`)?.querySelector('.val')?.textContent),
    }
  })
  expect(advanced.visible).toBe('1')
  expect(advanced.time).toMatch(/^Analysis time (sub 0\.1s|\d+(?:\.\d+)?s)$/)
  expect(advanced.labels).toEqual(['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'])
  expect(advanced.pcts).toEqual(['5%', '10%', '15%', '70%'])
  expect(advanced.text).not.toMatch(/Decision score|Threshold/)
})

test('39 words render the dedicated too-short state without inference', async ({ context }) => {
  const page = await context.newPage()
  await gotoHtml(page, `<p>${LONG_TEXT}</p>`)
  const worker = await serviceWorkerFor(context)
  const tabId = await tabIdFor(context, page)
  await worker.evaluate(async (id) => {
    for (let i = 0; i < 50; i++) {
      try {
        await chrome.tabs.sendMessage(id, { type: 'selection:too-short', wordCount: 39, minWords: 40 })
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
  }, tabId)
  const card = page.locator(CARD_HOST_SELECTOR)
  await expect(card).toBeAttached()
  await expect.poll(() => card.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLElement>('[data-testid="error-message"]')?.textContent,
  )).toBe('Too short to judge — select at least 40 words (39 selected)')
})

test('Copy and Share actions remain interactive', async ({ context }) => {
  const page = await context.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })
  await gotoHtml(page, `<p>${LONG_TEXT}</p>`)
  const card = await dispatchClassification(context, page, LONG_TEXT)
  await expect.poll(() => card.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLElement>('[data-testid="card-root"]')?.dataset.state,
  )).toBe('ready')

  await card.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="btn-copy"]')?.click(),
  )
  await expect.poll(() => card.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="btn-copy"]')?.textContent,
  )).toMatch(/Copied|Failed/)
  await card.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="btn-share"]')?.click(),
  )
  await expect.poll(() => card.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="btn-share"]')?.textContent,
  )).toMatch(/Copied|Failed/)
})

test('minimise collapses to head row and restores', async ({ context }) => {
  const page = await context.newPage()
  await gotoHtml(page, `<p id="t">${LONG_TEXT}</p>`)
  await page.waitForLoadState('domcontentloaded')
  const card = await dispatchClassification(context, page, LONG_TEXT)
  await expect(card).toBeAttached({ timeout: 4000 })
  await expect
    .poll(async () => card.evaluate((el) =>
      el.shadowRoot?.querySelector<HTMLElement>('[data-testid="card-root"]')?.dataset.state ?? null,
    ), { timeout: 4000 })
    .toBe('ready')

  const readView = () => card.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLElement>('[data-testid="card-root"]')?.dataset.view ?? null,
  )
  const clickMinimise = () => card.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="btn-minimise"]')?.click(),
  )

  expect(await readView()).toBe('full')
  await clickMinimise()
  expect(await readView()).toBe('minimised')
  await clickMinimise()
  expect(await readView()).toBe('full')
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

// Guards the fix for the worst failure mode this extension had: with no model
// installed it fell back to a classifier that derived percentages from a hash
// of the text, and the card rendered those exactly like real results. The e2e
// profile has no model, so this asserts the honest path.
test('reports an error instead of inventing a verdict when no model is installed', async ({
  context,
}) => {
  const page = await context.newPage()
  await gotoHtml(page, `<p id="t">${LONG_TEXT}</p>`)
  await page.waitForLoadState('domcontentloaded')

  const worker = await serviceWorkerFor(context)
  const tabId = await tabIdFor(context, page)
  const requestId = 'e2e-nomodel-' + Date.now()

  await worker.evaluate(
    async ([tabId, requestId, text]) => {
      await chrome.offscreen
        .createDocument({
          url: 'offscreen.html',
          reasons: [chrome.offscreen.Reason.WORKERS],
          justification: 'e2e no-model smoke',
        })
        .catch(() => {
          /* already exists */
        })
      for (let i = 0; i < 50; i++) {
        try {
          await chrome.tabs.sendMessage(tabId as number, {
            type: 'classify:started',
            requestId: requestId as string,
            preview: (text as string).slice(0, 200),
            wordCount: (text as string).trim().split(/\s+/).length,
            charCount: (text as string).length,
          })
          break
        } catch {
          await new Promise((r) => setTimeout(r, 100))
        }
      }
    },
    [tabId, requestId, LONG_TEXT] as const,
  )

  const card = page.locator(CARD_HOST_SELECTOR)
  await expect(card).toBeAttached({ timeout: 4000 })

  // The offscreen document is created cold here, so a classify:run sent before
  // its listener is registered is simply dropped. Resend until the card
  // settles; the reducer keys off requestId, so repeats are harmless.
  await expect
    .poll(
      async () => {
        await worker.evaluate(
          ([tabId, requestId, text]) => {
            chrome.runtime
              .sendMessage({
                type: 'classify:run',
                requestId: requestId as string,
                tabId: tabId as number,
                text,
              })
              .catch(() => {})
          },
          [tabId, requestId, LONG_TEXT] as const,
        )
        return card.evaluate(
          (el) =>
            el.shadowRoot!.querySelector<HTMLElement>('[data-testid="card-root"]')?.dataset.state ??
            null,
        )
      },
      { timeout: 20000, intervals: [500, 1000, 1000, 2000] },
    )
    .toBe('error')

  const snapshot = await card.evaluate((el) => {
    const s = el.shadowRoot!
    return {
      error: s.querySelector<HTMLElement>('[data-testid="error-message"]')?.textContent ?? '',
      verdictBoxHidden:
        s.querySelector<HTMLElement>('[data-testid="verdict-box"]')?.classList.contains('hide') ?? null,
    }
  })
  // It must say what is wrong, and show no verdict at all.
  expect(snapshot.error).toMatch(/model/i)
  expect(snapshot.verdictBoxHidden).toBe(true)
})
