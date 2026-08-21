import { describe, expect, it } from 'vitest'
import { SCENES, type Scene } from '../../scripts/store-scenes.mjs'

const capture = (tag: string) => ({ dataUri: `data:image/png;base64,${tag}`, width: 386, height: 419 })
const CAPTURES = {
  cardBasicLight: capture('BASICLIGHT'),
  cardAdvancedLight: capture('ADVANCEDLIGHT'),
  cardBasicDark: capture('BASICDARK'),
  options: { dataUri: 'data:image/png;base64,OPTIONS', width: 720, height: 704 },
}

describe('store scenes', () => {
  it('covers the Store slots at their exact sizes', () => {
    expect(SCENES.map((s) => `${s.name}`)).toEqual([
      'screenshot-1-hero-1280x800',
      'screenshot-2-advanced-1280x800',
      'screenshot-3-flow-1280x800',
      'screenshot-4-options-1280x800',
      'screenshot-5-themes-1280x800',
      'promo-small-440x280',
      'promo-marquee-1400x560',
    ])
    for (const scene of SCENES) {
      expect(scene.name.endsWith(`${scene.width}x${scene.height}`)).toBe(true)
    }
  })

  it.each(SCENES.map((s): [string, Scene] => [s.name, s]))('%s renders a sized page around real captures', (_name, scene) => {
    const html = scene.render(CAPTURES)
    expect(html).toContain(`width: ${scene.width}px; height: ${scene.height}px`)
    expect(html).toMatch(/data:image\/png;base64,(BASICLIGHT|ADVANCEDLIGHT|BASICDARK|OPTIONS)/)
    expect(html).toContain('SlopHammer')
  })

  it('never shows a retired spelling of the product name', () => {
    for (const scene of SCENES) {
      const text = scene.render(CAPTURES).replace(/<[^>]*>/g, '')
      expect(text).not.toMatch(/Slop Hammer|SLOP\s*\/\s*HAMMER|slop\/hammer/)
    }
  })
})
