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

## Agent-driven debugging

`scripts/debug-extension.mjs` (`pnpm debug`) talks to a browser started by
`pnpm qa` over raw CDP. It reaches every context — service worker, offscreen
document, options page and content scripts — which is the whole point.

| Command | What it does |
|---|---|
| `pnpm debug status` | Targets, model install state, WebGPU availability. |
| `pnpm debug classify "<text>"` | Classify text on the fixtures page and print the card. |
| `pnpm debug classify --section 1` | Same, using fixture section 1. |
| `pnpm debug logs [seconds]` | Stream console from every extension context, with an error/warning tally. |
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
3. Put a timeout on every CDP call so a hang fails loudly instead of hanging.
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
9. **A blocking dialog stalls the CDP call that triggered it.** `window.confirm`
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
  └── SW: resume any journaled pre-v1 migration
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
- The offscreen classifier is `OnnxClassifierRepository`; the fake repository is
  test-only. The content script records `performance.now()` on accepted start/result
  actions, so timing remains presentation metadata and never enters this protocol.

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
- v1 is WebGPU-only and requires 40 words. Do not claim a CPU fallback or use
  the retired 75-character gate.
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
