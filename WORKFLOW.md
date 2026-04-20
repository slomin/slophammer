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
  matters to the extension runtime (SW, manifest, content scripts, offscreen, WebGPU,
  OPFS). The only difference is automation policy.
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
  └── SW: sendToTab(tabId, classify:started)   → content script mounts card in 'loading'
  └── SW: ensureOffscreenDocument()
  └── SW: sendToRuntime(classify:run)          → offscreen runs inference
                                                 └── offscreen: broadcast classify:result
                                                     └── SW router receives
                                                         └── SW: sendMessage(tabId, classify:result)
                                                             └── content script reducer: loading → ready
```

- All non-trivial state transitions in the card go through the pure reducer in
  `content/state.ts` — unit-testable with no DOM.
- The offscreen's classifier comes from `classifier-factory.ts` which composes
  `ClassifierRepository` implementations (Fake → OnnxClassifierRepository) behind
  injectable deps. Unit tests cover the factory's installed/not-installed branches.

## Things to not trust

- The `chrome-devtools` MCP's `list_pages` — it tracks phantom `chrome-error://` tabs
  from failed navigations. Cross-check with
  `curl http://127.0.0.1:9222/json/list` via raw CDP.
- A CDP target's reported `url` field — it reflects the requested navigation, not the
  current location. Always `Runtime.evaluate` `location.href` in the tab to confirm.
- `pnpm test:e2e` passing alone — the E2E uses a programmatic `classify:run` dispatch
  because Playwright can't click native context menus. Manual smoke via the
  context-menu is still required before a release, including the hostile local page.

## Profile + model

- CfT uses the fixed profile directory `~/.slophammer-chrome-profile`. When a test gets
  stuck in weird extension-state (disabled bit, cached SW, etc.), the cleanest recovery
  is to delete that directory and rerun `pnpm chrome`. Model will need reinstalling.
- Model is persisted in OPFS under `slop-hammer/model/*`. Sentinel JSON at
  `slop-hammer/.ready`. The installer (`install/install-orchestrator.ts`) writes both.
- **Test classifier zip** is in `references/` (which is gitignored). It must ship the
  file set declared in `llm/contract.ts` (`tokenizer.json`, `tokenizer_config.json`,
  one of the contract filenames, `model_q4f16.onnx`, and at least one
  `model_q4f16.onnx.data_*` shard). If you need a zip and there isn't one in
  `references/`, ask — don't reach outside the project for it.
- Extension ID is stable per (profile, `--load-extension` path) combo. Currently
  `elalpednccdbgjklegipphhapojalphi` in the CfT profile.

## Retros — bugs we already hit (so we don't rediscover)

- **Stable Chrome: card stuck in `loading`.** The SW's `classify:result`
  handler was `await`ing `chrome.tabs.sendMessage(tabId, msg)` inside the
  onMessage listener. Once the async work resolved and `sendResponse` fired,
  Chrome idled the SW and cancelled the outbound send before it reached the
  tab. CfT kept the SW alive long enough for the send to flush, which is
  why it reproduced only in stable Chrome. Fix: fire-and-forget the tab
  send (`forwardToTab` helper). Reference implementation in `references/`
  uses the same pattern.
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
                       generate-icons, serve-test-page
tests/unit/            Vitest specs — one per pure module
tests/e2e/             Playwright E2E + persistent-context fixtures
references/releases/current/unpacked   What to Load unpacked for manual testing
```

## Out-of-project files

- Do not reference paths outside this repo. If something is needed from outside — a
  model zip, a test binary, a config — **ask first** instead of assuming a location.
