import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

// Dark ground + neon-green hammer, matches the extension's inspector/card theme.
const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#151517"/>
      <stop offset="1" stop-color="#0b0b0c"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  <rect x="6" y="6" width="116" height="116" rx="20" fill="none" stroke="#2a2a2f" stroke-width="1"/>

  <g transform="translate(64 64) rotate(-38) translate(-64 -64)">
    <!-- handle -->
    <rect x="60" y="44" width="8" height="66" rx="3" fill="#a5ffa5"/>
    <rect x="60" y="96" width="8" height="14" fill="#7be07b"/>
    <!-- head -->
    <rect x="34" y="20" width="60" height="30" rx="4" fill="#a5ffa5"/>
    <rect x="34" y="20" width="60" height="6" fill="#d4ffd4"/>
    <rect x="34" y="44" width="60" height="6" fill="#7be07b"/>
    <!-- face strike lines -->
    <rect x="82" y="26" width="8" height="2" fill="#0b0b0c" opacity="0.6"/>
    <rect x="82" y="30" width="8" height="2" fill="#0b0b0c" opacity="0.6"/>
    <rect x="82" y="34" width="8" height="2" fill="#0b0b0c" opacity="0.6"/>
  </g>
</svg>
`

const OUT_DIR = resolve('public/icon')
mkdirSync(OUT_DIR, { recursive: true })

const sizes = [16, 32, 48, 96, 128]
for (const size of sizes) {
  const file = resolve(OUT_DIR, `${size}.png`)
  await sharp(Buffer.from(SVG)).resize(size, size).png().toFile(file)
  console.log(`wrote ${file}`)
}
