# Chrome Web Store release path

This is the operational runbook for SlopHammer’s Chrome Web Store package. The dashboard submission, tag, GitHub release, and final release evidence remain owned by #24 after the 350M feature branch merges.

## Product contract

- Visible name: `SlopHammer`.
- Extension version: `1.0.0`.
- Sole supported classifier: `SlopHammer 350M v0.1`.
- Hugging Face artifact: `Slomin/slophammer_350m/slophammer_350m_v0_1.zip`.
- Download size: `215720009` bytes; unpacked model files are about 230 MB.
- SHA-256/LFS OID: `3d4f39017e0b47df6d4d3ee1d4a827f7a2eb42106fa12ed95dad4e67c0d63d4e`.
- Packaged extension: `27.50 MB` unpacked, `6.44 MB` zipped. It contains exactly one
  ONNX Runtime WASM binary (`ort/ort-wasm-simd-threaded.asyncify.wasm`, 27.19 MB);
  `pnpm check:package` asserts that and prints the current sizes.
- Input floor: 40 words.
- Runtime: local WebGPU preferred, with an automatic packaged CPU/WASM fallback when
  WebGPU is unavailable or cannot initialize. CPU inference can be materially slower.
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

Each item names the command that proves it today; the ones marked *by hand* have no
harness and are done in Chrome for Testing with the context menu.

1. Run `pnpm icons` (no diff), `SLOPHAMMER_REQUIRE_VECTORS=1 pnpm test`, `pnpm typecheck`,
   `pnpm build`, `pnpm check:package`, and `pnpm test:e2e`.
2. Test a fresh hosted install and successful 40-word classification in current Chrome
   with WebGPU; confirm diagnostics identify `webgpu` (`pnpm qa:runtime --expect webgpu`
   on a profile that installed the model from the options page; `pnpm debug status`
   prints the sentinel and the chosen provider).
3. Confirm all five zero-width characters leave the result unchanged
   (`tests/unit/token-preparation.test.ts`).
4. Confirm 39 words are rejected and 40 words start classification (`qa:runtime`,
   `tests/e2e/content-script-card.spec.ts`).
5. Upgrade a populated pre-v1 profile and verify old local/session storage and the
   retired OPFS model are removed before the pinned 350M install (`pnpm qa:upgrade`).
6. Terminate Chrome during migration, restart, and confirm the OPFS journal resumes the
   job without overlapping installs or reviving the retired model (`pnpm qa:upgrade`,
   interruption pass).
7. Exercise Human/AI and leaning results, confidence bands, the prominent score and
   binary bar, Basic/Advanced, Advanced timing, themes, minimisation, Copy/Share, hostile
   CSS (`qa:runtime`, `test:e2e`, `qa:placement`), and a real website
   (`pnpm qa:runtime --site <url>`, plus one context-menu classification *by hand*).
8. In a separate browser profile, make WebGPU genuinely unavailable and verify the
   same installed model classifies through local CPU/WASM. Confirm diagnostics identify
   `wasm`, expected fallback emits no warning/error, and selected text never leaves the
   device.
9. Inject or otherwise exercise a WebGPU session-initialization failure while the API
   is present; verify CPU/WASM starts cleanly. Exercise a both-provider failure and
   confirm the user sees actionable browser, memory, or model recovery guidance while
   diagnostics retain both provider causes.
10. Compare representative fixed inputs on WebGPU and CPU/WASM. Confirm identical
    preprocessing/token metadata and materially consistent distributions, decision
    scores, and verdicts without changing the pinned calibration contract.
11. Throttle the CPU fallback on the classifier-worker target so a run crosses the
    normal card watchdog. Confirm loading remains alive, the eventual result is
    accepted, repeated requests reuse one session, and concurrent tabs remain FIFO
    serialized. Record cold and warm timings without promising equivalent performance
    on a particular Windows laptop or Chromebook.
12. Restart the fallback browser profile and confirm the installed model remains in
    OPFS and the CPU session is recreated lazily. If practical, exercise the low-memory
    path and verify that closing tabs/apps and retrying is the stated recovery.
13. Regenerate Store assets (`pnpm store:assets`) and prove their visible name is
    exactly `SlopHammer`.
14. Run `pnpm release`; inspect the ZIP root, icons, permissions, CSP, packaged worker
    and ONNX Runtime files, absence of model weights, and absence of development-only
    files (`pnpm check:package` runs inside `pnpm release`). Confirm no runtime
    JavaScript, worker, MJS, or WASM is fetched remotely.

No 50-row corpus parity gate is required. The targeted WebGPU/CPU-WASM equivalence,
fallback, timeout, lifecycle, and package checks above are required.

## Submission sequence (#24)

After this branch merges, #24 owns the versioned release commit, final package, dashboard upload, Store submission, tag, GitHub release, and final evidence. Do not close #24 from this feature branch.
