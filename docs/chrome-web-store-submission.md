# Chrome Web Store submission copy

Paste sheet for SlopHammer v1.0.0. Final submission, tag, and GitHub release remain owned by #24.

## Listing

Name:

> SlopHammer

Short description:

> Check selected text for AI-like signals locally in Chrome with the verified SlopHammer 350M model.

Long description:

> SlopHammer helps you inspect selected webpage text for AI-like signals. Select at least 40 words, right-click, and choose “Check with SlopHammer.” Analysis runs locally in Chrome using the verified SlopHammer 350M classifier.
>
> SlopHammer prefers WebGPU and automatically uses its packaged CPU/WebAssembly
> fallback when WebGPU is unavailable or cannot start. Both paths keep analysis on the
> device. CPU analysis can take materially longer on older computers.
>
> Results use a Human/AI presentation with a confidence label, prominent rounded percentage, explanatory sentence, and binary Human/AI bar. Advanced mode adds the raw Human, Lightly AI, Moderately AI, and Fully AI distribution plus local analysis time. Copy and Share export the detector heading and raw distribution.
>
> Model results are probabilistic and can be wrong. Consider them alongside other evidence.
>
> Setup downloads `slophammer_350m_v0_1.zip` (about 206 MB) from `Slomin/slophammer_350m` on Hugging Face and verifies SHA-256 `3d4f39017e0b47df6d4d3ee1d4a827f7a2eb42106fa12ed95dad4e67c0d63d4e`. Selected text is not sent to Hugging Face.

Category: Productivity

Language: English

Support URL: https://github.com/slomin/slophammer/blob/main/docs/support.md

Privacy policy URL: https://github.com/slomin/slophammer/blob/main/docs/privacy.md

## Privacy tab

Single purpose:

> SlopHammer checks user-selected webpage text for AI-like signals with a local classifier after an explicit context-menu action.

User data:

> SlopHammer reads only the text the user selects and explicitly asks it to check. The text is analyzed locally and is not used for advertising, tracking, profiling, or analytics. Settings, migration state, and model files are stored locally in Chrome.

Remote code / model explanation:

> All JavaScript and WebAssembly runtime files are bundled in the extension package. SlopHammer downloads only the pinned classifier data ZIP from Hugging Face. It does not fetch remote JavaScript or WebAssembly for execution.

## Permission justifications

`contextMenus`: Adds “Check with SlopHammer” to Chrome’s selection context menu.

`activeTab`: Lets SlopHammer interact with the current tab after the explicit menu action.

`scripting`: Injects the packaged content script on demand when the user invokes SlopHammer on a tab that does not yet have a live content script.

`offscreen`: Coordinates verified model installation and the packaged classifier worker
that performs local WebGPU or CPU/WebAssembly inference.

`storage`: Stores settings, install identity, and resumable v1 migration state locally.

`unlimitedStorage`: Stores the approximately 230 MB unpacked classifier files without the normal small extension quota.

`<all_urls>`: Makes the result card available on ordinary pages. Text is analyzed only after the user selects it and invokes the context-menu action.

Content security policy:

> SlopHammer bundles its classifier worker and all ONNX Runtime JavaScript,
> WebAssembly, and support files. It prefers local WebGPU inference and automatically
> falls back to the packaged local CPU/WebAssembly execution provider when WebGPU is
> unavailable or cannot initialize. No runtime code is loaded remotely.

## Reviewer test instructions

> SlopHammer does not require an account.
>
> 1. Install the extension and open options.
> 2. Click “Install from Hugging Face.” Confirm the verified SlopHammer 350M v0.1 model installs.
> 3. On a normal HTTP/HTTPS page, select 39 words and choose “Check with SlopHammer.” Confirm the card says it needs at least 40 words and no inference begins.
> 4. In current Chrome with WebGPU available, select 40 or more words and run the
> check. Confirm the card shows a Human/AI result, confidence label, prominent
> percentage, explanatory sentence, and binary bar.
> 5. Open Advanced detail and confirm the four raw buckets and analysis time appear, without decision score or threshold.
> 6. Verify Copy and Share contain only “SlopHammer: AI Content Detector” and the raw four-bucket distribution.
> 7. Verify System, Light, and Dark themes and card minimisation.
> 8. Where WebGPU is unavailable or blocked, run the same check and confirm SlopHammer
> automatically completes it with the local CPU/WebAssembly fallback. The fallback can
> take materially longer on older hardware; keep the result card open while it works.
> 9. If neither WebGPU nor CPU/WebAssembly can start, confirm the visible message gives
> actionable Chrome update/restart, memory, or model-reinstall guidance rather than
> claiming that selected text will be analyzed remotely.
> 10. Upgrade QA: load a populated pre-v1 profile, update to v1, confirm old
> settings/model data are removed, the pinned 350M artifact installs automatically,
> and an interrupted migration resumes without restoring the retired model.

## Store assets

All images are 24-bit PNG without alpha (the dashboard rejects alpha).

Store icon (uploaded separately from the packaged `icon/128.png`, which has transparent
corners): `store-assets/chrome-web-store/store-icon-128x128.png`

Screenshots, in upload order:

1. `store-assets/chrome-web-store/screenshot-1-hero-1280x800.png`
2. `store-assets/chrome-web-store/screenshot-2-advanced-1280x800.png`
3. `store-assets/chrome-web-store/screenshot-3-flow-1280x800.png`
4. `store-assets/chrome-web-store/screenshot-4-options-1280x800.png`
5. `store-assets/chrome-web-store/screenshot-5-themes-1280x800.png`

Promo tiles:

- Small promo tile (required): `store-assets/chrome-web-store/promo-small-440x280.png`
- Marquee promo tile: `store-assets/chrome-web-store/promo-marquee-1400x560.png`

Regenerate with `pnpm build && pnpm store:assets` after UI changes; the card and
options captures inside the scenes are taken from the built extension, and the run
fails if any output is not the size the Store expects. Verify every visible product
name is exactly `SlopHammer`.
