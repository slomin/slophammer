---
name: slophammer-manual-qa
description: Bring Slop Hammer up for manual QA in one shot — build the extension if stale, launch Chrome for Testing with the extension loaded, and start the test-page server with 5 sample texts. Use when the user asks to "manually QA", "test in the browser", "open slophammer for testing", or anything equivalent.
---

# Slop Hammer — manual QA skill

## Goal

Fresh Claude session hands a ready-to-use browser to the user without any extra steps. The user clicks the Chrome window, selects a paragraph on the test page, and right-clicks → **Check with Slop Hammer**.

## Run this

```bash
pnpm qa
```

That command:
1. Builds the extension if `.output/chrome-mv3` is missing or older than `content/` / `entrypoints/` sources.
2. Kills anything bound to ports `:8765` (test-page) and `:9222` (Chrome CDP) so re-runs are idempotent.
3. Spawns `node scripts/serve-test-page.mjs` (detached) — serves 5 sample texts at `http://localhost:8765/`.
4. Spawns `bash scripts/launch-chrome.sh http://localhost:8765/` (detached) — Chrome for Testing with the extension loaded, opening the test page on startup. The launcher passes `--hide-crash-restore-bubble` so Chrome never prompts to restore the previous session.
5. Waits for both to be up.
6. Prints a ready banner.

## Model

On first run the user drops their model zip onto the extension's options page (toolbar icon → options). The install lives in the persistent profile at `~/.slophammer-chrome-profile` and survives Chrome restarts and extension rebuilds (unpacked extension ID stays stable). After the first install, `pnpm qa` just launches into a ready state.

## What you should do in the session

1. Run `pnpm qa`.
2. If it exits 0, tell the user **"ready for manual QA — Chrome is open on the test page"** and stop. Don't open anything else.
3. If it exits non-zero, read the error, fix if obvious (stale ports, missing Chrome for Testing), and re-run. Otherwise surface the error verbatim.

## Troubleshooting

- **"Chrome for Testing not installed"** → run `pnpm setup:chrome`, then retry.
- **"Extension not built"** → run `pnpm build`, then retry (the orchestrator should do this automatically but if you hit it, the source-newer heuristic missed).
- **Session-restore dialog still shows up** → the `--hide-crash-restore-bubble` flag usually kills it, but if Chrome was force-killed mid-install the Preferences file may still be flagged. As a last resort, `rm -rf ~/.slophammer-chrome-profile` and re-run; the user will have to re-drop the model zip.

## Files this skill depends on

- `scripts/qa-setup.mjs` — orchestrator
- `scripts/serve-test-page.mjs` — fixtures server (pre-existing)
- `scripts/launch-chrome.sh` — Chrome launcher (accepts trailing URL args)
