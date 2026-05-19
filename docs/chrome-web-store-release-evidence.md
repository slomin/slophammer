# Chrome Web Store release-prep evidence

Prepared for issue #16 on 2026-05-19.

## Automated checks

The following checks passed on `chore/chrome-store-release-prep`:

- `pnpm test`
  - 26 test files passed
  - 252 tests passed
- `pnpm typecheck`
- `pnpm build`
  - build succeeded
  - WXT reported the expected large-chunk warning for bundled ONNX/WASM assets
  - unpacked output: `103.77 MB`
- `pnpm test:e2e`
  - 4 Playwright tests passed
- `pnpm release`
  - release package generated
  - ZIP: `.output/slophammer-0.3.0-chrome.zip`
  - ZIP size: `24.35 MB`

## Package inspection

The generated ZIP was inspected with `unzip`.

- `manifest.json` is at the ZIP root.
- Manifest version is `0.3.0`.
- Manifest permissions are:
  - `contextMenus`
  - `activeTab`
  - `offscreen`
  - `storage`
  - `unlimitedStorage`
- The unused `scripting` permission is no longer present.
- Host permissions remain `<all_urls>` for the v1 content-script workflow.

## Store assets

Generated with:

```sh
pnpm build
pnpm store:assets
```

Assets:

- `store-assets/chrome-web-store/screenshot-options-1280x800.png`
- `store-assets/chrome-web-store/screenshot-result-basic-1280x800.png`
- `store-assets/chrome-web-store/screenshot-result-advanced-1280x800.png`
- `store-assets/chrome-web-store/promo-small-440x280.png`

Dimension checks:

- screenshots: `1280x800`
- small promo tile: `440x280`

Visual inspection:

- Options screenshot uses light theme and shows install/settings surfaces.
- Basic result screenshot uses light theme and shows the result card fully.
- Advanced result screenshot uses light theme and shows the expanded distribution.
- Promo tile uses the Basic result screenshot composition.

## Remaining pre-submit checks

These steps still require a human pre-submit pass before uploading to Chrome Web
Store:

- Make the GitHub repository public, or move privacy/support pages to another
  public URL and update dashboard URLs.
- Confirm the Chrome Developer Dashboard accepts the selected screenshots and
  promo tile.
- Run manual QA with a real installed model:
  - local fixture page
  - hostile CSS fixture page
  - one real website
  - hosted Hugging Face install
  - manual ZIP fallback if needed
  - Basic/Advanced result detail
  - System/Light/Dark theme behavior
- Upload the ZIP only after developer account setup, 2-Step Verification, and
  dashboard fields are complete.
