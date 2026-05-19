# Chrome Web Store release path

This note captures the first-release path for Slop Hammer on the Chrome Web
Store. It is a planning artifact for issue #6, not a record of an actual store
submission.

## Recommendation

Use a private trusted-tester release first, with deferred publishing enabled if
the dashboard allows it for the selected visibility. This exercises the same
Chrome Web Store review path as a public release while keeping the first install
audience small. After the reviewed item is live for trusted testers and the
install/update flow is verified from the store, follow with a public release
ticket.

Do not submit the current package as-is. The extension is close, but the first
store submission still needs a privacy/support surface, final screenshots,
permission justification copy, and a release-package cleanup pass.

## Official requirements checked

- A Chrome Web Store developer account is required before publishing, including
  a one-time registration fee and a developer email that should be monitored.
  The account setup flow also requires a publisher name and verified contact
  email. Trusted tester accounts can be configured at the publisher/account
  level.
  - https://developer.chrome.com/docs/webstore/register/
  - https://developer.chrome.com/docs/webstore/set-up-account
- 2-Step Verification is required for the Google account before publishing or
  updating an extension.
  - https://developer.chrome.com/docs/webstore/program-policies/two-step-verification/
- The first upload is a ZIP file. The ZIP must contain `manifest.json` at its
  root, and Chrome Web Store rejects extension packages larger than 2 GB.
  - https://developer.chrome.com/docs/webstore/publish/
  - https://developer.chrome.com/docs/webstore/prepare/
- Required dashboard work after upload is split across Package, Store Listing,
  Privacy, Distribution, and optionally Test instructions.
  - https://developer.chrome.com/docs/webstore/publish/
  - https://developer.chrome.com/docs/webstore/cws-dashboard-listing
  - https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
  - https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
  - https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions
- Visibility choices are Public, Unlisted, and Private. Private is appropriate
  for trusted testers, but all visibility settings still have the same policy
  requirements and review process.
  - https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- Screenshots and promo assets are part of the store-listing quality path. The
  listing docs describe localized screenshots and global promotional images; the
  current general listing guidance recommends real, clear product imagery. The
  older best-listing page calls out screenshot sizes of `1280x800` or `640x400`
  and promo images such as the `440x280` small promo tile.
  - https://developer.chrome.com/docs/webstore/cws-dashboard-listing
  - https://developer.chrome.com/docs/webstore/best-listing
- Remote hosted code means JavaScript or WASM executed by the browser from
  outside the extension package. Data, JSON, and CSS are not remote hosted code.
  Slop Hammer's hosted Hugging Face model ZIP should be framed as model data,
  not executable browser code, and all JS/WASM runtime files must remain bundled
  in the extension package.
  - https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- Manifest V3 extension pages have a minimum content security policy that
  includes `'wasm-unsafe-eval'`; this value is allowed in the minimum policy,
  while broader script sources such as `'unsafe-eval'` are not allowed.
  - https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
- Every update that changes code, manifest, or packaged assets requires a new
  ZIP with a higher extension version.
  - https://developer.chrome.com/docs/webstore/update/
- Review status is visible in the Developer Dashboard. Items may go through
  manual review, especially when sensitive permissions are requested.
  - https://developer.chrome.com/docs/webstore/check-review

## Current Slop Hammer package

Dry run performed from `main` on 2026-05-19:

```sh
pnpm release
```

Observed output:

- Production build succeeded.
- `pnpm exec wxt zip` produced `.output/slophammer-0.0.1-chrome.zip`.
- ZIP size: `24.35 MB`, comfortably below the 2 GB Chrome Web Store package
  limit.
- Unpacked output size reported by WXT: `103.76 MB`, dominated by ONNX Runtime
  WASM files.
- `references/releases/current/` was refreshed with:
  - `unpacked/`
  - `slophammer-0.0.1-chrome.zip`
  - `README.txt`
- ZIP inspection confirmed `manifest.json` is at the ZIP root.

Current manifest facts from `wxt.config.ts`:

- Name: `Slop Hammer`
- Description: `Local AI-text detector — right-click selected text.`
- Version source: `package.json` currently `0.0.1`
- Manifest permissions:
  - `contextMenus`
  - `activeTab`
  - `scripting`
  - `offscreen`
  - `storage`
  - `unlimitedStorage`
- Host permissions:
  - `<all_urls>`
- Extension pages CSP:
  - `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`
- Web accessible resources:
  - bundled `ort/*` runtime files

Package-readiness notes:

- The package size is fine.
- `manifest.json` was at the ZIP root in this dry run; repeat this check before
  upload.
- `scripts/release.mjs` still writes a `README.txt` that says the build came
  from `feat/scaffolding` and tells users to drop a local classifier ZIP. That
  README is ignored release-output, not store content, but it is stale and should
  be fixed before the release path is treated as polished.
- The store listing needs real screenshots. The repo has fixture pages and QA
  tooling, but no committed store screenshots or promo assets yet.
- The options footer has placeholder links for privacy/support style content.
  The store submission should not depend on placeholder links.

## Draft dashboard copy

These drafts are intentionally conservative and should be refined in the
release-prep ticket before submission.

### Store listing

Short description:

> Local AI-text detector for selected text. Right-click a passage and check it
> with Slop Hammer.

Long description:

> Slop Hammer helps you inspect selected text for AI-generated or AI-assisted
> writing.
>
> Select a passage on a webpage, right-click, and choose "Check with Slop
> Hammer." The extension runs the analysis locally in Chrome and shows a compact
> result card on the page. Basic mode shows a single AI probability. Advanced
> mode shows the underlying probability breakdown.
>
> Slop Hammer downloads its official classifier model during setup and stores it
> locally in the browser. After installation, normal checks do not need to send
> selected page text to a remote service.
>
> Results are signals, not proof. Use them as one input when judging whether text
> feels synthetic, heavily templated, or AI-assisted.

Suggested category:

- Productivity, or Developer Tools if the intended initial audience is technical
  users. Prefer Productivity for a general public release.

Suggested language:

- English only for v1.

### Single purpose

> Slop Hammer lets users check selected webpage text for signs of AI-generated
> or AI-assisted writing using a local classifier model.

### Permission justifications

`contextMenus`:

> Adds the "Check with Slop Hammer" item to Chrome's right-click menu for
> selected text.

`activeTab`:

> Lets the extension interact with the current tab when the user invokes the
> context-menu action.

`scripting`:

> Reserved for extension page/content-script integration required by the
> extension runtime. If release-prep confirms it is unused, remove it before
> submission.

`offscreen`:

> Runs local model loading and inference in an offscreen extension document so
> the service worker can stay lightweight.

`storage`:

> Stores extension settings and model-install state locally in Chrome.

`unlimitedStorage`:

> Allows the browser to store the local classifier model and related model files
> without the normal small extension-storage quota.

`<all_urls>` host permission:

> Lets the content script be available on normal web pages so users can check
> selected text where they are reading it. The extension only analyzes text after
> the user selects text and invokes the context-menu action.

### Privacy and data-use draft

Single-purpose user data explanation:

> Slop Hammer reads selected text only when the user explicitly chooses "Check
> with Slop Hammer." The selected text is analyzed locally in the browser. The
> extension stores settings and model-install metadata locally. It does not sell
> user data and does not use selected text for advertising or tracking.

Data categories likely involved:

- Website content: selected page text is processed when the user invokes the
  context-menu action.
- User activity: no browsing history or behavior analytics are intentionally
  collected by the current code.
- Personally identifiable information: not intentionally collected, though
  selected text can contain personal information if the user chooses such text.

Remote/network behavior:

> During setup or update checks, Slop Hammer contacts Hugging Face to download or
> compare the official model ZIP. This download is model data used by the local
> classifier. Slop Hammer does not fetch remote JavaScript or WASM to execute in
> the browser.

Remote-code declaration:

> Slop Hammer bundles its JavaScript and WASM runtime files in the extension
> package. The hosted Hugging Face artifact is a classifier model/data bundle
> installed into browser-local storage; it is not fetched as browser-executed
> JavaScript or WASM.

### Reviewer test instructions

> Slop Hammer does not require an account.
>
> 1. Install the extension.
> 2. Open the extension options page.
> 3. Click "Install from Hugging Face" to download the official model, or use the
>    manual `.zip` fallback if needed.
> 4. Open any normal `http` or `https` webpage.
> 5. Select at least 75 characters of text.
> 6. Right-click the selection and choose "Check with Slop Hammer."
> 7. Confirm the result card appears on the page.
> 8. In options, change Result detail between Basic and Advanced and Theme
>    between System, Light, and Dark to verify those settings.

## Blockers before submission

Must fix or produce before first submission:

- Privacy policy URL.
- Support URL or support/contact destination.
- Store screenshots, preferably at `1280x800` or `640x400`.
- Small promo tile decision/asset (`440x280`) if the dashboard requires or
  strongly nudges it for the chosen listing quality target.
- Final store listing copy and category selection.
- Final permission justifications pasted into the dashboard.
- Confirm whether `scripting` is actually used. If not used, remove it before
  submission to reduce review surface.
- Confirm whether `<all_urls>` is the right v1 host-permission posture or
  whether a narrower/on-click host model is feasible. If kept, justify it
  carefully.
- Create or publish privacy/support pages and replace placeholder footer links
  in options if those links remain visible.
- Fix stale release README text in `scripts/release.mjs`.
- Version-release decision: either keep `0.0.1` for the first submitted build or
  bump to the intended first store version before upload.

Should consider before public release:

- A short disclaimer in listing and/or UI that classifier output is probabilistic
  and not proof of authorship.
- Package-size notes for reviewers if upload/review flags large WASM assets.
- A private trusted-tester release before public listing.

## First release workflow

1. Finish the release-prep ticket created from the proposal below.
2. Run the automated checks:
   - `pnpm test`
   - `pnpm typecheck`
   - `pnpm build`
   - `pnpm test:e2e`
3. Run manual QA from `WORKFLOW.md`, including:
   - local fixture page
   - hostile CSS fixture page
   - one real website
   - hosted Hugging Face install
   - manual ZIP fallback if a test ZIP is available
   - Basic/Advanced result detail
   - System/Light/Dark theme
4. Run `pnpm release`.
5. Inspect `.output/slophammer-<version>-chrome.zip`:
   - `manifest.json` at ZIP root
   - expected icons present
   - no development-only files
6. Register/set up the Chrome Web Store developer account if not already done:
   - pay one-time fee
   - enable 2-Step Verification
   - set publisher name
   - verify contact email
   - configure trusted testers if doing private release
7. Upload the ZIP in Chrome Developer Dashboard.
8. Complete Store Listing, Privacy, Distribution, and Test instructions.
9. Submit for review with deferred publishing if available/desirable.
10. Watch dashboard status and publisher email for review result.
11. If approved and deferred, publish manually within the 30-day staged window.
12. If rejected, capture the rejection text in a follow-up issue before changing
    code or dashboard answers.

## Update workflow

1. Make the code/listing change.
2. Bump `package.json` / manifest version so it is greater than the currently
   published version.
3. Run automated checks and manual smoke.
4. Run `pnpm release`.
5. Upload the new ZIP through the Package tab.
6. Submit for review.
7. Use deferred/staged publishing for higher-risk updates.

Future automation via the Chrome Web Store API can wait until manual releases
have happened at least once.

## Proposed follow-up ticket

Title:

> chore(release): prepare first Chrome Web Store submission

Labels:

- `type:chore`
- `area:docs`
- `area:tooling`

Summary:

> Prepare Slop Hammer's first Chrome Web Store submission package and dashboard
> materials, using the release-path spike as the source of truth.

Scope:

- Create the privacy policy and support/contact pages or URLs required for the
  listing.
- Replace or remove visible placeholder privacy/support links in the options
  page.
- Finalize store listing copy, category, language, and reviewer test
  instructions.
- Produce store screenshots and any required promo assets.
- Finalize privacy/data-use answers and permission justifications.
- Confirm whether `scripting` is needed; remove it if unused.
- Decide whether to keep `<all_urls>` for v1; if kept, document and use the
  final justification.
- Fix stale `scripts/release.mjs` README content.
- Decide and apply the first submitted version number.
- Run `pnpm release` and verify the generated ZIP is upload-ready.
- Leave a final submission checklist with the exact dashboard fields to paste.

Acceptance criteria:

- A production ZIP is generated and inspected with `manifest.json` at the ZIP
  root.
- Store listing copy is final enough to paste into the dashboard.
- Privacy policy/support URLs are available and non-placeholder.
- Privacy/data-use answers and permission justifications are final enough to
  paste into the dashboard.
- Required screenshots and promo assets exist.
- The manifest contains only permissions we are willing to justify.
- Release README/output instructions no longer mention stale branch names or old
  manual-only model setup.
- Automated checks and manual QA evidence are recorded.

Evidence required:

- Links to privacy/support pages.
- Screenshot/promo asset paths.
- Generated ZIP path and size.
- Final permission-justification text.
- Final privacy/data-use text.
- Manual QA notes.

Non-goals:

- Paying the developer registration fee.
- Submitting the item to Chrome Web Store.
- Building Chrome Web Store API automation.
- Reworking classifier behavior except where required for store readiness.
