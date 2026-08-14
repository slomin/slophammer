import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ICON_PALETTE, buildIconSvg } from '../../scripts/generate-icons.mjs'

const LEGACY_GREENS = ['#a5ffa5', '#7be07b', '#d4ffd4']

describe('extension icon artwork', () => {
  it('uses the established brand palette', () => {
    expect(ICON_PALETTE).toEqual({
      backgroundTop: '#151517',
      backgroundBottom: '#0b0b0c',
      border: '#2a2a2f',
      hammerBody: '#ff7043',
      hammerShade: '#d94e1f',
      hammerHighlight: '#ff9a63',
    })
  })

  it('builds the SVG exclusively from the shared palette', () => {
    const svg = buildIconSvg()
    const svgColours = new Set(svg.match(/#[0-9a-f]{6}/gi)?.map((colour) => colour.toLowerCase()))

    expect(svgColours).toEqual(new Set(Object.values(ICON_PALETTE)))
  })

  it('contains none of the legacy neon greens', () => {
    const svg = buildIconSvg().toLowerCase()

    for (const colour of LEGACY_GREENS) expect(svg).not.toContain(colour)
  })

  it('does not generate files when imported as a module', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slophammer-icons-import-'))
    const generatorUrl = pathToFileURL(resolve('scripts/generate-icons.mjs'))

    try {
      execFileSync(process.execPath, [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(generatorUrl.href)})`,
      ], { cwd })

      expect(existsSync(join(cwd, 'public', 'icon'))).toBe(false)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
