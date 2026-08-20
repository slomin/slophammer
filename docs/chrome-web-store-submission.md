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

`offscreen`: Runs verified model installation and local WebGPU inference in an offscreen extension document.

`storage`: Stores settings, install identity, and resumable v1 migration state locally.

`unlimitedStorage`: Stores the approximately 230 MB unpacked classifier files without the normal small extension quota.

`<all_urls>`: Makes the result card available on ordinary pages. Text is analyzed only after the user selects it and invokes the context-menu action.

Content security policy:

> SlopHammer bundles ONNX Runtime WebAssembly support files required by its WebGPU runtime. v1 classification is WebGPU-only and does not claim a CPU fallback.

## Reviewer test instructions

> SlopHammer does not require an account.
>
> 1. Install the extension and open options.
> 2. Click “Install from Hugging Face.” Confirm the verified SlopHammer 350M v0.1 model installs.
> 3. On a normal HTTP/HTTPS page, select 39 words and choose “Check with SlopHammer.” Confirm the card says it needs at least 40 words and no inference begins.
> 4. Select 40 or more words and run the check. Confirm the card shows a Human/AI result, confidence label, prominent percentage, explanatory sentence, and binary bar.
> 5. Open Advanced detail and confirm the four raw buckets and analysis time appear, without decision score or threshold.
> 6. Verify Copy and Share contain only “SlopHammer: AI Content Detector” and the raw four-bucket distribution.
> 7. Verify System, Light, and Dark themes and card minimisation.
> 8. v1 requires WebGPU. On an unsupported device, confirm SlopHammer reports the requirement clearly and does not claim CPU fallback.
> 9. Upgrade QA: load a populated pre-v1 profile, update to v1, confirm old settings/model data are removed, the pinned 350M artifact installs automatically, and an interrupted migration resumes without restoring the retired model.

## Store assets

- `store-assets/chrome-web-store/screenshot-options-1280x800.png`
- `store-assets/chrome-web-store/screenshot-result-basic-1280x800.png`
- `store-assets/chrome-web-store/screenshot-result-advanced-1280x800.png`
- `store-assets/chrome-web-store/promo-small-440x280.png`

Regenerate these after UI changes and verify every visible product name is exactly `SlopHammer`.
