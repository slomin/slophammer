# Chrome Web Store release evidence — SlopHammer 1.0.0

Prepared for issue #24 on 2026-08-21. Every check below ran from the
`chore/24-release-1.0.0` branch; the commit each section names is the one the
command ran against. The submission record at the end is filled in after the
tag, by the follow-up documented in `WORKFLOW.md` → Release.

## Product contract under test

- Extension: `SlopHammer` `1.0.0`, Manifest V3.
- Sole classifier: `SlopHammer 350M v0.1` from `Slomin/slophammer_350m`,
  file `slophammer_350m_v0_1.zip`, `215720009` bytes, SHA-256 / LFS OID
  `3d4f39017e0b47df6d4d3ee1d4a827f7a2eb42106fa12ed95dad4e67c0d63d4e`.
  The Hugging Face tree API was read on 2026-08-21 and lists exactly that size
  and OID; `llm/supported-artifact.ts` pins the same values and the installer
  verifies the SHA-256 before writing a file.
- Runtime: local WebGPU, automatic local CPU/WASM fallback. No remote code.

## Automated checks — branch at `8816e57`

Product code on the branch is identical to `main` at `1286540`; the branch's own
commits add only the store-asset pipeline, the upgrade rehearsal, tests and
documentation. The gates below were re-run after the review round, on the last
code commit; the commit that records them changes this document only.

| Check | Result |
|---|---|
| `pnpm icons` | regenerated `public/icon/*.png`, no diff against the tree |
| `SLOPHAMMER_REQUIRE_VECTORS=1 pnpm test` | 63 files, **554 tests passed**; the tokenizer vectors ran as a hard gate (vocabulary present) |
| `pnpm typecheck` | clean |
| `pnpm build` | `.output/chrome-mv3` 27.50 MB, 19 files |
| `pnpm check:package` | PASS — one ONNX Runtime WASM binary (`ort/ort-wasm-simd-threaded.asyncify.wasm`, 27.19 MB), runtime files present, JavaScript 232.99 kB under budget |
| `pnpm test:e2e` | **14 passed** (28.4 s): `content-script-card.spec.ts` 7, `card-placement.spec.ts` 7 |
| `pnpm store:assets` | 7 assets rendered, every one at its Store size with its embedded capture shown whole (PASS rows below) |

## Runtime QA — real extension, real model, Chrome for Testing 147.0.7727.57

Browser brought up with `pnpm qa`; the model in that profile was installed
from the options page.

| Suite | Result |
|---|---|
| `pnpm qa:runtime --expect webgpu --record …` | **11/11**: WebGPU evidence (chrome://gpu and adapter agree), cold start 1.8 s → AI 98 %, provider `webgpu`, repeat runs 1.1 s / 1.1 s on one session, 4-tab concurrency with `maxConcurrentRuns=1`, backlog peak 4 drained, hostile-CSS page visible, live rebuild (sessions 1 → 2), console 0 errors / 0 warnings; 4 fixture verdicts recorded |
| `pnpm qa:runtime --expect webgpu --site https://en.wikipedia.org/wiki/Duck_typing` | real-site PASS — `state=ready visibleToUser=true` |
| `pnpm qa --no-webgpu` then `pnpm qa:runtime --expect wasm --compare …` | **11/11**: `chrome://gpu disabled=true`, adapter absent, provider `wasm` with `threads=4`, fallback reason "No compatible WebGPU adapter was found.", cold start 2.9 s, repeat 2.3 s / 2.2 s, **equivalence 4/4 fixtures match the WebGPU run (max drift 0 pp)**, rebuild on `wasm`, console 0 errors, 3 expected warnings (0 unexpected) |
| `pnpm qa:placement` | **17/17**: every torture fixture (plain, transformed ancestor, `contain: paint`, open shadow root, multi-block, textarea, iframe, modal `<dialog>` painted above, overlapping popover) adjacent or pinned; scroll follow / hide / return; viewport sweep below / below / pinned / above |

Zero-width invariance (`tests/unit/token-preparation.test.ts`), the 39/40-word
gate and the calibrated verdict mapping (`tests/unit/*`, `content-script-card.spec.ts`)
are covered by the automated suites above.

## Install paths — fresh scratch profiles, current build

| Path | Result |
|---|---|
| First install, hosted (`Install from Hugging Face`) | sentinel after **9 s**: `checkpointId=SlopHammer 350M v0.1`, `source=hosted`, `hosted.filename=slophammer_350m_v0_1.zip`, `hosted.lfsOid=3d4f3901…d4e`, options chip `SlopHammer 350M v0.1`; storage holds only `checkpoint_id`, `model_installed` |
| First install, manual `.zip` (`references/models/slophammer_350m_v0_1.zip` via the file input) | sentinel after **4 s**: `checkpointId=SlopHammer 350M v0.1`, `source=manual`, same chip and storage keys |
| Context-menu classification, by hand (the one step no harness drives) | fixture page `http://127.0.0.1:8765/` paragraph 01 and a live Wikipedia article: both produced a result card next to the selection with a verdict |

## Upgrade from a retained v0.3.0 profile — `pnpm qa:upgrade`

**17/17 checks passed.** Real v0.3.0 built from `d29dfc0`, loaded on a scratch
Chrome for Testing profile; the retired `Slomin/slop_hammer_0_8_b` model installed
through the 0.3.0 options page (sentinel `Slomin/slop_hammer_0_8_b`, 8 OPFS files,
storage `checkpoint_id`, `model_installed`, a marker key and dark/advanced settings).

Upgrade in place (files swapped under the running browser, extension reloaded
from `chrome://extensions`):

| Assertion | Observed |
|---|---|
| `onInstalled` | `{ reason: "update", previousVersion: "0.3.0" }`, read from the worker's retained log object over CDP. (The persisted intent key is consumed by the wipe; on this run it was already gone when first polled, which is why the gate reads Chrome's event rather than racing storage.) |
| phases | `downloading → installing → ready` observed, `ready` in under 20 s; `pending` and `wiping` are written faster than the 500 ms poll and the journal's `destructive: true` is their evidence |
| journal | `phase=ready destructive=true artifact=slophammer_350m_v0_1.zip` |
| legacy storage | marker key gone, neither planted setting (`theme: dark`, `resultDetail: advanced`) survived, `checkpoint_id` now `SlopHammer 350M v0.1` |
| data generation | `slophammer-data-generation = 1` |
| sentinel | `checkpointId=SlopHammer 350M v0.1`, `hosted.filename=slophammer_350m_v0_1.zip`, OID `3d4f3901…d4e` |
| retired model gone | by content, since both models use the same file names: the contract file in OPFS declares `SlopHammer 350M v0.1`, neither weight file keeps the byte size it had in the legacy profile, total OPFS bytes **751,662,777 → 239,593,209** |
| classification after upgrade | card `ready`, verdict AI, 1.3 s |

Interruption (legacy snapshot restored, upgraded the same way, Chrome SIGKILLed at
the first `downloading` observation, relaunched): first phase observed after restart
`downloading`, then `installing → ready`; the same eight assertions hold (the
`onInstalled` read before the kill, journal `destructive: true`, legacy storage
cleared, generation 1, 350M sentinel, retired model gone by content). The retired
model was not revived at any point.

Harness note (recorded in `WORKFLOW.md`): relaunching with `--load-extension` after
swapping the files reports `onInstalled` as a fresh `install` with no
`previousVersion`, so it cannot stand in for an update; the in-place reload needs
Developer mode on in the profile.

## Package inspection — `pnpm release` at `a5f07c8` (pre-tag inspection build)

`references/releases/current/slophammer-1.0.0-chrome.zip`, 6,445,386 bytes, 19
files. This zip is the inspection subject only; the artifact that ships is
built from the tag (see the submission record).

- `manifest.json` at the zip root; `version` `1.0.0`; name `SlopHammer`.
- Icons: `16`, `32`, `48`, `96`, `128`.
- Permissions: `contextMenus`, `activeTab`, `offscreen`, `scripting`, `storage`,
  `unlimitedStorage`; host permissions `<all_urls>`.
- CSP (extension pages): `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`.
- Runtime files: `background.js`, `content-scripts/content.js`, `offscreen.html`
  + chunk, `assets/classifier-worker-*.js`, `options.html` + chunks,
  `inspector.html` + chunk (diagnostics page), `ort/ort-wasm-simd-threaded.asyncify.{mjs,wasm}`.
- Not present: model weights, tokenizer files, source maps, tests, the
  `references/` or `store-assets/` trees, any second WASM binary.

## Store assets — `pnpm store:assets`

Captured from the built extension and composed into scenes
(`scripts/store-scenes.mjs`); every visible product name is `SlopHammer`
(`tests/unit/store-scenes.test.ts`, `branding.test.ts`). The verdict on the card is
a fixture; the analysis time it shows (1.42 s) is the fixture's dispatch delay, set to
what a warm WebGPU run measures, so the listing does not advertise a sub-0.1 s
inference. The options capture ends on the Card position group boundary and the
render fails if any embedded capture is clipped.

| File | Size | Slot |
|---|---|---|
| `screenshot-1-hero-1280x800.png` | 1280×800 | screenshot 1 |
| `screenshot-2-advanced-1280x800.png` | 1280×800 | screenshot 2 |
| `screenshot-3-flow-1280x800.png` | 1280×800 | screenshot 3 |
| `screenshot-4-options-1280x800.png` | 1280×800 | screenshot 4 |
| `screenshot-5-themes-1280x800.png` | 1280×800 | screenshot 5 |
| `promo-small-440x280.png` | 440×280 | small promo tile |
| `promo-marquee-1400x560.png` | 1400×560 | marquee promo tile |

## Submission record

Filled in by the follow-up after the tag and the dashboard upload.

| Field | Value |
|---|---|
| Tag / commit | _pending_ |
| Artifact | `slophammer-1.0.0-chrome.zip` — SHA-256 _pending_ |
| GitHub release | _pending_ |
| Store item ID | _pending_ |
| Listing URL | _pending_ |
| Visibility | Private, trusted testers; deferred publishing (publish-after-review unchecked) |
| Submitted | _pending_ |
| Review status | _pending_ |
| Reviewer feedback | _none yet_ |
