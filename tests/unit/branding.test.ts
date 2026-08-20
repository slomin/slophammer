import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PRODUCT_NAME } from '@/shared/product'

const visibleSurfaceFiles = [
  'wxt.config.ts',
  'entrypoints/background.ts',
  'entrypoints/options/index.html',
  'entrypoints/inspector/index.html',
  'entrypoints/offscreen/index.html',
  'content/card-dom.ts',
  'content/result-summary.ts',
  'install/install-renderer.ts',
  'scripts/capture-store-assets.mjs',
  'scripts/release.mjs',
  'scripts/serve-test-page.mjs',
  'docs/chrome-web-store-submission.md',
  'docs/chrome-web-store-release.md',
  'docs/support.md',
  'docs/privacy.md',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/ISSUE_TEMPLATE/spike_chore.yml',
]

describe('SlopHammer branding', () => {
  it('centralizes the exact runtime product name', () => {
    expect(PRODUCT_NAME).toBe('SlopHammer')
  })

  it.each(visibleSurfaceFiles)('%s contains no retired visible spelling', (filename) => {
    const text = readFileSync(filename, 'utf8')
    const renderedText = text
      .replace(/<[^>]*>/g, '')
      // Project #10 is still named "Slop Hammer"; this is an internal
      // workflow identifier rather than visible product branding.
      .replaceAll('Slop Hammer delivery board', '')
    expect(renderedText).not.toMatch(/Slop Hammer|SLOP\s*\/\s*HAMMER|slop\/hammer/)
  })
})
