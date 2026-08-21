# Workflow

## Working style

**TDD is the default.** Every pure helper lands as a failing unit test first, then an
implementation that makes it pass, then a refactor if needed. Impure seams get an
interface + fake injected at the call site so the orchestrator around them is also
test-covered (`ClassifierRepository`, `ZipReaderLike`, `OpfsAdapterLike`, `TokenizerLike`,
`InferenceSessionLike`, …).

- Unit: **Vitest**. DOM-touching tests use `happy-dom` via `// @vitest-environment happy-dom`.
- E2E: **Playwright** persistent-context against Chrome for Testing.
- Run the right thing at the right time — `pnpm test` is fast (<2 s), `pnpm test:e2e` is ~2 s per spec.
- Never commit code whose tests don't prove the behaviour the commit claims.

**Tokenizer drift.** `@huggingface/tokenizers` is pinned to an *exact* version:
it decides every token id, and one changed id can flip a verdict across the
calibration threshold without raising anything. `tests/unit/tokenizer-vectors.test.ts`
re-checks recorded ids from the real 350M vocabulary and is the gate for
accepting a bump, but it needs the vocabulary on disk and skips without it:

```sh
unzip -o -j references/models/slophammer_350m_v0_1.zip \
  tokenizer.json tokenizer_config.json -d references/models/tokenizer
```

## Commands (quick reference)

| Command | What it does |
|---|---|
| `pnpm chrome` | Launch Chrome for Testing with the extension loaded + CDP on `:9222`, using the reusable profile at `~/.slophammer-chrome-profile`. |
| `pnpm chrome:real` | Same but with the daily Google Chrome binary on `:9223`. Note the restrictions in the "Stable Chrome" section below. |
| `pnpm test-page` | Start an http server on `:8765` serving fixtures at `/` and a hostile-CSS repro page at `/hostile`. |
| `pnpm build` | Production WXT build → `.output/chrome-mv3/`. |
| `pnpm release` | `pnpm build` + refresh `references/releases/current/{unpacked, *.zip, README.txt}`. Releases go into a single folder that overwrites on each run. |
| `pnpm reload` | `pnpm release` + kill CfT + relaunch. Reliable SW refresh. |
| `pnpm test` | Vitest unit tests. |
| `pnpm test:e2e` | Playwright E2E against CfT. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm setup:chrome` | One-time: install Chrome for Testing into `./chrome-for-testing/`. |
| `pnpm qa` | One-shot QA bootstrap: build if stale, start the test page, launch CfT. |
| `pnpm qa --no-webgpu` | Same, but with WebGPU genuinely unavailable, to exercise the fallback. |
| `pnpm qa:runtime` | Run the whole runtime QA suite against the running browser. |
| `pnpm check:package` | Audit an **existing** `.output/chrome-mv3` — one ONNX Runtime WASM binary at `ort/`, every `ORT_RUNTIME_FILES` entry present, non-WASM weight under budget. Prints the build's timestamp and sizes. Build first; `pnpm release` runs it on the packed tree. |
| `pnpm debug <cmd>` | Drive/inspect the running extension over CDP — see "Agent-driven debugging". |

## The working dev loop

1. Terminal A: `pnpm test-page`
2. Terminal B: `pnpm chrome` (launches CfT, loads `.output/chrome-mv3`, CDP on `:9222`)
3. Edit code → `pnpm reload` — rebuilds, refreshes the release folder, relaunches CfT.
4. Inspect via `chrome-extension://<id>/inspector.html` — all logs from every context
   route through there.
5. For agent-driven debugging: talk to CfT via raw CDP (see "Things to not trust" below).
6. Manual smoke on fresh tabs:
   - `http://127.0.0.1:8765/`
   - `http://127.0.0.1:8765/hostile`
   - a real site such as Reddit when validating cross-site CSS resilience

## Runtime QA (execution providers)

Two commands, one for each provider. `pnpm qa:runtime` checks WebGPU evidence,
cold start, the chosen provider and its fallback reason, repeat runs on one
session, 4-tab concurrency, a burst backlog, the hostile-CSS page, the live
dispose/rebuild path, and console hygiene — then prints PASS/FAIL per check and
exits non-zero if any failed.

```
pnpm qa                            # WebGPU available
pnpm qa:runtime --expect webgpu

pnpm qa --no-webgpu                # WebGPU genuinely unavailable
pnpm qa:runtime --expect wasm
```

**Provider equivalence** is a two-step gate: record every fixture's verdict on
one provider, then assert the other reproduces it. Verdicts must match exactly;
the rounded distribution is allowed 1pp of drift, because the card rounds and
the two providers are not required to agree bit-for-bit.

```
pnpm qa              && pnpm qa:runtime --expect webgpu --record /tmp/webgpu.json
pnpm qa --no-webgpu  && pnpm qa:runtime --expect wasm   --compare /tmp/webgpu.json
```

The suite also exercises the live rebuild path (`model:load` → dispose → new
session → classify), so the machinery the timeout-recovery paths depend on is
proven in a real browser rather than only against fakes.

It runs in **~18s** and is deterministic: every check is local, so there is no
network in the default path. Two checks are opt-in because they are slow or
flaky, and both are already covered elsewhere:

- `--watchdog` waits out the card's real deadline in-browser (~54s). The timing
  rules themselves are covered deterministically by
  `tests/unit/classify-watchdog.test.ts` with fake timers, so this only
  re-confirms in a real browser what that test already proves.
- `--site <url>` smokes a real site. It needs the network, which makes it both
  the slowest step and the only genuinely flaky one — page weight and markup are
  outside our control. The local `/hostile` fixture covers the same failure mode
  deterministically. Run it before a release, not on every loop.

**A crashed renderer is recovered, not reported as a failure.** Chrome's
"Aw, Snap!" keeps the CDP target alive, so evaluating in it hangs — with a
hard-coded 30s per call and a high failure threshold, a crash could never be
detected inside a card budget and simply looked like a classification that never
settled (measured: 60s of polling a dead tab). `waitForCard` now polls with a
short per-call timeout, confirms with a health probe, and returns `crashed`
within ~9s; the suite reloads the tab and retries the request once. Recovery
navigates to the URL the tab was *opened* on: a crashed renderer reports
`chrome-error://chromewebdata/` as its own `location.href`, so reloading "its own
URL" lands straight back on the error page. `eval`/`send` accept a per-call
timeout — rule 3 applies to every call, not once globally.

**Keep it fast and deterministic.** Budgets are proportionate to measured times
(1.2–1.8s warm on WebGPU, 2.4–3.0s on CPU/WASM), so a regression fails in
seconds instead of hanging. Probe tabs all carry `?qa=…` and the fixture tab is
matched on an empty query string — matching on pathname alone silently selected
a probe tab and classified into it (rule 4, the hard way). Console hygiene
counts only what the current run produced: each context replays its buffer on
attach (rule 8), so the suite snapshots that first and diffs against it.

**Do not trust a launch flag to disable WebGPU.** `--disable-features=WebGPU`
does *not* work — `requestAdapter()` still resolves under it. `--disable-gpu`
does, which is what `--no-webgpu` passes. `qa:runtime` never assumes: it reads
`chrome://gpu`, probes `requestAdapter()` in the extension context, and asserts
the provider the classifier actually chose matches what the browser can do.

## Agent-driven debugging

`scripts/debug-extension.mjs` (`pnpm debug`) talks to a browser started by
`pnpm qa` over raw CDP. It reaches every context — service worker, offscreen
document, options page and content scripts — which is the whole point.

| Command | What it does |
|---|---|
| `pnpm debug status` | Targets, model install state, and the browser's WebGPU probe. |
| `pnpm debug classify "<text>"` | Classify text on the fixtures page and print the card. |
| `pnpm debug classify --section 1` | Same, using fixture section 1. |
| `pnpm debug logs [seconds]` | Stream console from every extension context, with an error/warning tally. |
| `pnpm debug throttle <rate>` | Throttle the offscreen **main thread**. Does not slow inference — see rule 9. |
| `pnpm debug backlog [n]` | Queue n classifications so a card sits in `loading` past the 45s watchdog. |
| `pnpm debug reach` | Which open tabs have a live content script. |

**Two tools that cannot do this job:**

- **`chrome-devtools` MCP** hides `chrome-extension://` contexts — `list_pages`
  returns only ordinary web pages, so the service worker, offscreen document
  and options page are unreachable.
- **Playwright `connectOverCDP`** opens the browser websocket then hangs during
  init against this browser; extension `background_page` targets are a known
  trigger. Worse, its aborted auto-attach leaves targets *paused*, so later raw
  CDP calls to those targets time out until Chrome is relaunched.

**Rules the harness encodes, each learned from a real failure:**

1. Write output with `fs.writeSync`, never buffered `console.log`. A `timeout`
   SIGTERM discards buffered stdout, which silently produced empty runs.
2. The MV3 service worker idles out constantly. Never assume its target exists —
   wake it via the options page and poll for it.
3. Put a timeout on every CDP call so a hang fails loudly instead of hanging —
   and make it *per call*. `send`/`eval` hard-coded 30s and silently ignored the
   timeout their callers passed, so a liveness probe that asked for 2s waited
   half a minute and crash detection could never fire inside its budget.
   `eval` also reports page exceptions as a `{__error}` value rather than a
   rejection, so callers probing liveness must check for that shape.
4. Give probe tabs a unique URL marker. Several tabs share a prefix and
   `tabs.query()` returns the first match, which silently sends messages to the
   wrong tab.
5. `/json/new` returns before the navigation commits, so `document.readyState`
   is `complete` on `about:blank`. Wait for the real document.
6. Never measure animated geometry across separate CDP sessions — settle with
   `requestAnimationFrame` inside a single `Runtime.evaluate`.
7. `innerText` is empty in a tab that has never been rendered. Use
   `textContent`, or `Page.bringToFront` first.
8. **`pnpm debug logs` replays each context's retained console buffer when it
   attaches.** The tally is cumulative since that context booted, not a count
   for the window you watched. Two consecutive captures showed the same
   "5 warnings" from events minutes earlier. Check the timestamps inside the
   messages before believing a warning is new, or relaunch for a clean buffer.
9. **The classifier worker is not a CDP target, and CPU throttling cannot
   reach it.** Two separate walls, both measured. Chrome never lists the
   dedicated module worker that owns the ONNX session: `/json/list` shows no
   `worker` targets before the first classification and afterwards shows exactly
   `ort.env.wasm.numThreads` of them — ONNX Runtime's pthreads, parked in
   `Atomics.wait`, which answer no CDP call (even `Runtime.enable` times out).
   Separately, `Emulation.setCPUThrottlingRate` is main-thread-only: on the
   offscreen document a busy loop went 29 ms → 293 ms at 10x while the same loop
   inside a dedicated worker stayed at 28 ms → 29 ms. So there is no way to slow
   inference from CDP. Use `pnpm debug backlog` instead — the classify queue is
   strictly serial, so requests behind the head genuinely wait. The worker's
   console is not lost: Chrome routes it into the parent offscreen document's
   stream, so `pnpm debug logs` already carries it.
10. **A blocking dialog stalls the CDP call that triggered it.** `window.confirm`
   inside a `change` handler means `DOM.setFileInputFiles` does not resolve
   until the dialog is answered — fire the pick without awaiting it, then
   handle `Page.javascriptDialogOpening`. Never detach while a modal is open:
   the renderer stays unresponsive and even `Runtime.enable` times out, which
   looks exactly like a hung extension.

## MV3 gotchas (read before changing anything messaging-related)

- **`browser === chrome` in WXT ≥0.20.** `@wxt-dev/browser` exports
  `globalThis.browser ?? globalThis.chrome`; in Chrome that's just
  `globalThis.chrome`. There is no polyfill wrapper. Swapping `browser.runtime.*`
  ↔ `chrome.runtime.*` is behaviourally a no-op. (Earlier commit messages
  blaming a "polyfill wrapper" for fire-miss were misdiagnosed — the real fix
  was the async-semantics change described below.)
- **Async message handlers:** `return true` from the listener and call
  `sendResponse()` inside a `.finally()` after the async work settles. Without
  that, Chrome may terminate the SW before the handler finishes.
- **Do NOT `await chrome.tabs.sendMessage` inside a SW onMessage handler.**
  Once the handler's async work resolves and `sendResponse` fires, Chrome can
  idle the SW before the outbound tab send has actually been flushed, and
  silently drop it — observed in stable Chrome (not in CfT, which is more
  lenient about SW lifetime). **Fire-and-forget instead**:
  `chrome.tabs.sendMessage(tabId, msg).catch(logger.warn)`. Use the
  `forwardToTab` helper in `background/message-router.ts`. The reference
  implementation in `references/` does the same and works end-to-end in stable
  Chrome.
- **Filter `type === 'LOG'` at the top of the router.** Otherwise logger output routes
  back through the SW and the console floods with `router: received {type:"LOG"}` per
  emitted log line.
- **Don't `chrome.runtime.reload()`.** In MV3 it sometimes leaves the extension
  disabled, and the disabled bit is saved to the profile so subsequent
  `--load-extension` relaunches won't re-enable. `pnpm reload` kills + relaunches CfT
  instead — that's deterministic.
- **Don't re-inject content scripts from `onInstalled` via
  `chrome.scripting.executeScript`.** Chrome treats it as an error path and has been
  observed to mark the extension as errored + disabled. Live with content scripts
  only loading on http/https navigation; after an extension restart the user refreshes
  pages (which is fine for our context-menu flow).
- **Content scripts don't inject on non-http URLs.** `data:` / `about:blank` /
  `chrome://` / `file://` won't have the content script. Use `pnpm test-page` for
  anything that needs a content script.
- **`defineBackground` (WXT) is synchronous at module top-level.** Register all
  listeners inside its callback, synchronously. No `setTimeout`, no awaited delay before
  `addListener` — Chrome's event-to-listener plumbing requires top-level registration.

## Stable Chrome vs Chrome for Testing

- Chrome for Testing (CfT) = same Chromium build as stable Chrome for everything that
  matters to the extension runtime (SW, manifest, content scripts, offscreen,
  WebGPU, WebAssembly, workers, OPFS). The only difference is automation policy.
- Stable Chrome **ignores `--load-extension`** unless developer mode is already ON in
  the profile, and in recent versions does so even then. `pnpm chrome:real` exists but
  don't rely on it for automation — use it only to attach to a daily Chrome the user
  has *already* set up manually.
- If a behaviour reproduces in CfT, it reproduces in stable Chrome. If it doesn't
  reproduce in CfT but the user sees it in their daily Chrome, suspect their
  profile's saved extension state (disabled bit, cached pre-fix SW, previously-orphaned
  content script on open tabs).
- Daily Chrome-specific gotchas that bit us:
  - existing tabs can keep the old or missing content script after install/reload; use
    a fresh tab or reload the page before trusting a result
  - check the extension's **Site access** in `chrome://extensions` if it appears loaded
    but does not auto-run on a page

## Messaging mental model

```
context-menu click
  └── SW: resume any journaled pre-v1 migration
  └── SW: sendToTab(tabId, classify:started)   → content script mounts card in 'loading'
  └── SW: ensureOffscreenDocument()
  └── SW: sendToRuntime(classify:run)          → offscreen queues the request
                                                 └── one classifier worker/session
                                                     ├── prefer WebGPU
                                                     └── fall back to local CPU/WASM
                                                 └── offscreen: broadcast classify:result
                                                     └── SW router receives
                                                         └── SW: sendMessage(tabId, classify:result)
                                                             └── content script reducer: loading → ready
```

- All non-trivial state transitions in the card go through the pure reducer in
  `content/state.ts` — unit-testable with no DOM.
- The offscreen document owns one worker-backed classifier client and one FIFO queue
  shared by every tab. The worker owns the `OnnxClassifierRepository` and its single
  ONNX session; the fake repository is test-only. The content script records
  `performance.now()` on accepted start/result actions, so timing remains presentation
  metadata and never enters this protocol.

## Things to not trust

- The `chrome-devtools` MCP's `list_pages` — it tracks phantom `chrome-error://` tabs
  from failed navigations. Cross-check with
  `curl http://127.0.0.1:9222/json/list` via raw CDP.
- A CDP target's reported `url` field — it reflects the requested navigation, not the
  current location. Always `Runtime.evaluate` `location.href` in the tab to confirm.
- `pnpm test:e2e` passing alone — the E2E drives the card with a synthetic
  result because Playwright can't click native context menus and the E2E
  profile has no model installed. Manual smoke via the context-menu is still
  required before a release, including the hostile local page.
- A green E2E run as proof the *pipeline* works. Those specs passed for months
  against a fake classifier that invented verdicts whenever no model was
  installed; the extension now fails loudly instead, and a spec guards it.

## Profile + model

- CfT uses the fixed profile directory `~/.slophammer-chrome-profile`. When a test gets
  stuck in weird extension-state (disabled bit, cached SW, etc.), the cleanest recovery
  is to delete that directory and rerun `pnpm chrome`. Model will need reinstalling.
- Model is persisted in OPFS under `slop-hammer/model/*`. Sentinel JSON at
  `slop-hammer/.ready`. The installer (`install/install-orchestrator.ts`) writes both.
- The only supported artifact is
  `Slomin/slophammer_350m/slophammer_350m_v0_1.zip`, SHA-256
  `3d4f39017e0b47df6d4d3ee1d4a827f7a2eb42106fa12ed95dad4e67c0d63d4e`.
  It declares `SlopHammer 350M v0.1`, `trim+zw`, `tau=3.8088`, and
  `abstain_band=1.5`. Runtime validation rejects every retired/future identity.
- v1 requires 40 words and prefers WebGPU. If WebGPU is unavailable or its session
  cannot initialize, the packaged classifier worker retries the same pinned model
  with the local ONNX Runtime CPU/WASM execution provider. Both paths remain fully
  local and share the same preprocessing, tokenization, calibration, thresholds, and
  result contract. CPU/WASM can be materially slower, especially on older Windows and
  ChromeOS hardware; do not promise WebGPU-equivalent latency or use the retired
  75-character gate.
- Runtime provider metadata is diagnostic only and must not add result-card noise.
  A normal fallback is an informational event, not a warning. If both providers fail,
  retain both technical causes in diagnostics while showing an actionable browser,
  memory, or model-recovery message.
- Manual runtime QA must cover both providers, and is now one command per provider —
  see "Runtime QA (execution providers)". Run it green on `--expect webgpu` and on
  `--expect wasm` before claiming the fallback works. An Apple Silicon run is useful
  evidence, not a claim that it reproduces a particular Windows or Chromebook CPU;
  in particular inference here is far too fast to reach the 45s card watchdog, which
  is why the watchdog is verified by driving the messages rather than by being slow.
- A pre-v1 update writes `.slophammer-v1-migration.json` at the OPFS root,
  outside `slop-hammer/`, before storage/model deletion. The resumable phases are
  `pending → wiping → downloading → installing → ready`; `error` retains its reason.
- Extension ID is stable per (profile, `--load-extension` path) combo. Currently
  `elalpednccdbgjklegipphhapojalphi` in the CfT profile.

## Retros — bugs we already hit (so we don't rediscover)

- **Concurrent requests wedged inference permanently.** Four overlapping
  `classify:run` messages produced no results, logged no error, and left the
  offscreen document unresponsive even to CDP — every later request in every
  tab hung forever, recoverable only by recreating the offscreen document.
  Sequential requests were always fine. Fix: a FIFO queue keeps `session.run()`
  strictly one-at-a-time (`llm/classify-queue.ts`).
- **`position: fixed` is not viewport-relative under a transformed ancestor.**
  A `transform`/`filter`/`perspective`/`will-change` on `html` or `body` makes
  it the containing block, so the card's offsets were measured from the
  document. With the page scrolled 785px the card rendered at viewport top
  -777. Fix: measure where the card actually landed and correct by the
  difference, rather than enumerating the CSS properties that cause it.
- **Selections inside iframes have no rect in the top frame.** The content
  script only runs top-level, so `captureSelectionRect()` returned null,
  positioning was skipped entirely, and the card rendered below the fold.
  Fix: fall back to a viewport-anchored placement.
- **A failure action that is right in one state can lie in another.** Replacing
  an installed model reuses the manual-install path, whose non-`.zip` rejection
  dispatches `install-failed`. From `empty` that correctly shows the error card;
  from `installed` it would *replace* the installed card with it, and that
  card's Retry maps to `empty` — telling the user nothing is installed while the
  model is still on disk and still loaded. Guarded `replace-error` action
  instead, kept on the installed state like `updateError`. Worth checking any
  unguarded action reachable from a newly-added state.
- **A missing model produced invented verdicts.** Any load failure fell back to
  `FakeClassifierRepository`, whose hash-derived percentages rendered exactly
  like real ones. The E2E suite passed *because* of this. Fix: fail loudly;
  the fake is test-only.

- **Stable Chrome: card stuck in `loading`.** The SW's `classify:result`
  handler was `await`ing `chrome.tabs.sendMessage(tabId, msg)` inside the
  onMessage listener. Once the async work resolved and `sendResponse` fired,
  Chrome idled the SW and cancelled the outbound send before it reached the
  tab. CfT kept the SW alive long enough for the send to flush, which is
  why it reproduced only in stable Chrome. Fix: fire-and-forget the tab
  send (`forwardToTab` helper). Reference implementation in `references/`
  uses the same pattern.
- **50 MB of WebAssembly nobody ever executed.** The package reached 78 MB with
  three `.wasm` binaries in it, only one of which is loaded. Two independent
  causes, neither visible to tests or typecheck: importing one tokenizer symbol
  from `@huggingface/transformers` dragged in that library's own ONNX backend
  and a second `onnxruntime-web`; and ONNX Runtime's *default* entry is the
  bundled one, which inlines the emscripten factory and so carries
  `new URL('…asyncify.wasm', import.meta.url)` — enough for Vite to emit its own
  copy of a binary we already ship at `ort/` and load by path. Fix: build the
  tokenizer directly on `@huggingface/tokenizers` (which is what
  `PreTrainedTokenizer` wraps anyway), and select ORT's
  `onnxruntime-web-use-extern-wasm` export condition in `wxt.config.ts`. That
  condition is load-bearing — dropping it silently doubles the package.
  `pnpm check:package` guards this, because only the build output shows it —
  but note *how*. The extern-wasm condition is global, so a second
  `onnxruntime-web` arriving transitively resolves to the extern entry too and
  emits no extra `.wasm`. Counting binaries would not see it. The non-WASM
  weight budget is what catches that case, and the runtime-files assertion
  covers the new failure the condition introduces: the emscripten factory
  `.mjs` used to be inlined, and is now fetched at startup, so losing it breaks
  both providers while the build stays green.
- **Reddit: card existed in DOM but was invisible.** The old content-card host was an
  undefined custom element (`<slop-hammer-card>`). Reddit ships global
  `:not(:defined) { visibility: hidden; }`, so the host inherited `visibility: hidden`
  and hid the whole overlay even though messaging, state, and geometry were correct.
  Fix: mount the card on a plain `div[data-slop-hammer-card]` host with inline
  `all/visibility/display` resets before attaching the shadow root. Wykop did not
  reproduce this because it doesn't hide undefined custom elements.

## File layout

```
background/            SW-internal helpers: context-menu, message-router, offscreen-manager
content/               card DOM/state/positioning/reducer (+ styles template literal)
entrypoints/           WXT entry points: background, content, offscreen, options, inspector
install/               zip orchestrator + OPFS writer + fflate reader + file recognition + sentinel
llm/                   classifier interface, Fake + Onnx impls, contract, fp16, token prep, opfs reader
messaging/             protocol types + discriminated-union guards + logger with error forwarding
scripts/               launch-chrome, launch-real-chrome, release, reload, install-cft,
                       generate-icons, serve-test-page, qa-setup, qa-runtime,
                       debug-extension, check-package
tests/unit/            Vitest specs — one per pure module
tests/fixtures/        Recorded data the specs assert against (350M token vectors)
tests/e2e/             Playwright E2E + persistent-context fixtures
references/releases/current/unpacked   What to Load unpacked for manual testing
```

## Out-of-project files

- Do not reference paths outside this repo. If something is needed from outside — a
  model zip, a test binary, a config — **ask first** instead of assuming a location.
