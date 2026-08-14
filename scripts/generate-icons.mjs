import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

// Dark tile + orange hammer, matching the extension's brand accent.
export const ICON_PALETTE = Object.freeze({
  backgroundTop: '#151517',
  backgroundBottom: '#0b0b0c',
  border: '#2a2a2f',
  hammerBody: '#ff7043',
  hammerShade: '#d94e1f',
  hammerHighlight: '#ff9a63',
})

export function buildIconSvg(palette = ICON_PALETTE) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.backgroundTop}"/>
      <stop offset="1" stop-color="${palette.backgroundBottom}"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  <rect x="6" y="6" width="116" height="116" rx="20" fill="none" stroke="${palette.border}" stroke-width="1"/>

  <g transform="translate(64 64) rotate(-38) translate(-64 -64)">
    <!-- handle -->
    <rect x="60" y="44" width="8" height="66" rx="3" fill="${palette.hammerBody}"/>
    <rect x="60" y="96" width="8" height="14" fill="${palette.hammerShade}"/>
    <!-- head -->
    <rect x="34" y="20" width="60" height="30" rx="4" fill="${palette.hammerBody}"/>
    <rect x="34" y="20" width="60" height="6" fill="${palette.hammerHighlight}"/>
    <rect x="34" y="44" width="60" height="6" fill="${palette.hammerShade}"/>
    <!-- face strike lines -->
    <rect x="82" y="26" width="8" height="2" fill="${palette.backgroundBottom}" opacity="0.6"/>
    <rect x="82" y="30" width="8" height="2" fill="${palette.backgroundBottom}" opacity="0.6"/>
    <rect x="82" y="34" width="8" height="2" fill="${palette.backgroundBottom}" opacity="0.6"/>
  </g>
</svg>
`
}

export async function generateIcons(outDir = resolve('public/icon')) {
  mkdirSync(outDir, { recursive: true })
  const svg = buildIconSvg()

  for (const size of [16, 32, 48, 96, 128]) {
    const file = resolve(outDir, `${size}.png`)
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file)
    console.log(`wrote ${file}`)
  }
}

const isDirectRun = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) await generateIcons()
