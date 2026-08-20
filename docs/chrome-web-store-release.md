# Chrome Web Store release path

This is the operational runbook for SlopHammer’s Chrome Web Store package. The dashboard submission, tag, GitHub release, and final release evidence remain owned by #24 after the 350M feature branch merges.

## Product contract

- Visible name: `SlopHammer`.
- Extension version: `1.0.0`.
- Sole supported classifier: `SlopHammer 350M v0.1`.
- Hugging Face artifact: `Slomin/slophammer_350m/slophammer_350m_v0_1.zip`.
- Download size: `215720009` bytes; unpacked model files are about 230 MB.
- SHA-256/LFS OID: `3d4f39017e0b47df6d4d3ee1d4a827f7a2eb42106fa12ed95dad4e67c0d63d4e`.
- Input floor: 40 words.
- Runtime: local, WebGPU-only. No CPU/WASM execution-provider fallback is claimed for v1.
- Results: the original Human/AI presentation with a confidence chip, prominent rounded winning-side percentage, explanatory sentence, and binary Human/AI bar.
- Copy and Share export only the detector heading and raw four-bucket distribution. General limitations remain in options and support guidance rather than the result card.

## Store policy notes

The package must contain `manifest.json` at the ZIP root and all JavaScript/WebAssembly runtime files. The Hugging Face ZIP is model data installed into browser-local OPFS, not remote hosted code. Keep the permission explanations and reviewer instructions aligned with `docs/chrome-web-store-submission.md`.

Relevant Chrome documentation:

- https://developer.chrome.com/docs/webstore/prepare/
- https://developer.chrome.com/docs/webstore/publish/
- https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code

## Required verification before #24

1. Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm test:e2e`.
2. Test a fresh hosted install and successful 40-word classification in Chrome with WebGPU.
3. Confirm all five zero-width characters leave the result unchanged.
4. Confirm 39 words are rejected and 40 words start classification.
5. Upgrade a populated pre-v1 profile and verify old local/session storage and the retired OPFS model are removed before the pinned 350M install.
6. Terminate Chrome during migration, restart, and confirm the OPFS journal resumes the job without overlapping installs or reviving the retired model.
7. Exercise Human/AI and leaning results, confidence bands, the prominent score and binary bar, Basic/Advanced, Advanced timing, themes, minimisation, Copy/Share, hostile CSS, and a real website.
8. Verify unsupported hardware receives a clear WebGPU requirement.
9. Regenerate Store assets and prove their visible name is exactly `SlopHammer`.
10. Run `pnpm release`; inspect the ZIP root, icons, permissions, CSP, bundled runtime files, absence of model weights, and absence of development-only files.

Do not run a 50-row corpus parity gate or a WASM evaluation for this release branch.

## Submission sequence (#24)

After this branch merges, #24 owns the versioned release commit, final package, dashboard upload, Store submission, tag, GitHub release, and final evidence. Do not close #24 from this feature branch.
