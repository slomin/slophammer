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

| File | Size | Store slot |
|---|---|---|
| `screenshot-1-hero-1280x800.png` | 1280x800 | Screenshot 1 |
| `screenshot-2-advanced-1280x800.png` | 1280x800 | Screenshot 2 |
| `screenshot-3-flow-1280x800.png` | 1280x800 | Screenshot 3 |
| `screenshot-4-options-1280x800.png` | 1280x800 | Screenshot 4 |
| `screenshot-5-themes-1280x800.png` | 1280x800 | Screenshot 5 |
| `promo-small-440x280.png` | 440x280 | Small promo tile (required) |
| `promo-marquee-1400x560.png` | 1400x560 | Marquee promo tile |

The verdict on the card is a fixture (`rawPct: [5, 10, 15, 70]`), not a
classification of the sample paragraph. Every visible product name is
`SlopHammer`.
