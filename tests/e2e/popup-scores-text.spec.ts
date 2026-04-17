import { test, expect } from './fixtures'

test('popup scores text and renders result', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  await page.fill('#input', 'the quick brown fox jumps over the lazy dog')
  await page.click('#score')

  const result = page.locator('[data-testid="result"]')
  await expect(result).toHaveText(/^0\.\d{3}$/, { timeout: 2000 })
})
