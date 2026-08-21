# Chrome Web Store assets

Generated with:

```sh
pnpm build
pnpm store:assets
```

Two stages: the result card (Basic/Advanced, light/dark) and the options page are
captured from the built extension — real DOM, real styles, fed one fixed synthetic
result so the numbers are stable — then each scene in `scripts/store-scenes.mjs`
is rendered at its exact Store size with those captures embedded.

All files are 24-bit PNG without alpha, which is what the dashboard accepts.

| File | Size | Store slot |
|---|---|---|
| `store-icon-128x128.png` | 128x128 | Store icon (the packaged icon has alpha; this one is flattened on paper) |
| `screenshot-1-hero-1280x800.png` | 1280x800 | Screenshot 1 |
| `screenshot-2-advanced-1280x800.png` | 1280x800 | Screenshot 2 |
| `screenshot-3-flow-1280x800.png` | 1280x800 | Screenshot 3 |
| `screenshot-4-options-1280x800.png` | 1280x800 | Screenshot 4 |
| `screenshot-5-themes-1280x800.png` | 1280x800 | Screenshot 5 |
| `promo-small-440x280.png` | 440x280 | Small promo tile (required) |
| `promo-marquee-1400x560.png` | 1400x560 | Marquee promo tile |

The verdict on the card is a fixture (`rawPct: [5, 10, 15, 70]`), not a
classification of the sample paragraph, and the analysis time it shows is the
fixture's dispatch delay (1400 ms), set to what a warm WebGPU run of
the 350M model measures in `qa:runtime`. Every visible product name is
`SlopHammer`; `tests/unit/store-scenes.test.ts` and `branding.test.ts` hold
the scene module to that. The scene fonts are system stacks (Iowan Old Style /
Georgia, ui-monospace), so regenerate on the same platform to keep the set
consistent.
