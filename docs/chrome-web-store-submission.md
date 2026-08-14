# Chrome Web Store submission copy

This file is the paste sheet for Slop Hammer's first Chrome Web Store
submission. It should be reviewed against the Chrome Developer Dashboard before
upload.

## Listing

Name:

> Slop Hammer

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
> Results are signals, not proof. Use them as one input when judging whether
> text feels synthetic, heavily templated, or AI-assisted.

Category:

> Productivity

Language:

> English

Support URL:

> https://github.com/slomin/slophammer/blob/main/docs/support.md

Privacy policy URL:

> https://github.com/slomin/slophammer/blob/main/docs/privacy.md

## Privacy tab

Single purpose:

> Slop Hammer lets users check selected webpage text for signs of AI-generated
> or AI-assisted writing using a local classifier model.

User data:

> Slop Hammer reads selected webpage text only when the user explicitly chooses
> "Check with Slop Hammer." The selected text is analyzed locally in the
> browser. The extension stores settings and model-install metadata locally. It
> does not sell user data and does not use selected text for advertising,
> tracking, profiling, or analytics.

Data categories:

> Website content: selected page text is processed when the user invokes the
> context-menu action.
>
> User activity: browsing history or behavior analytics are not intentionally
> collected by the current extension.
>
> Personally identifiable information: not intentionally collected. Selected
> text can contain personal information if the user chooses such text, but the
> extension processes that selected text locally for the requested check.

Remote code / hosted model explanation:

> Slop Hammer bundles its JavaScript and WebAssembly runtime files in the
> extension package. During setup or update checks, it may download the official
> classifier model ZIP from Hugging Face. That artifact is model data installed
> into browser-local storage; it is not fetched as browser-executed JavaScript or
> WebAssembly.

## Permission justifications

`contextMenus`:

> Adds the "Check with Slop Hammer" item to Chrome's right-click menu for
> selected text.

`activeTab`:

> Lets the extension interact with the current tab when the user invokes the
> context-menu action.

`scripting`:

> Injects the content script into the current tab when the user chooses "Check
> with Slop Hammer" and no content script is running there yet. This happens on
> tabs that were already open when the extension was installed or updated.
> Without it the menu action silently does nothing on those tabs.

`offscreen`:

> Runs local model loading and inference in an offscreen extension document so
> the service worker can stay lightweight.

`storage`:

> Stores extension settings and model-install state locally in Chrome.

`unlimitedStorage`:

> Allows Chrome to store the local classifier model and related model files
> without the normal small extension-storage quota.

`<all_urls>` host permission:

> Lets the content script be available on normal web pages so users can check
> selected text where they are reading it. Slop Hammer only analyzes text after
> the user selects text and invokes the context-menu action.

Content security policy:

> Slop Hammer uses the Manifest V3-compatible `'wasm-unsafe-eval'` content
> security policy value so the bundled ONNX Runtime WebAssembly files can run
> locally in Chrome.

## Reviewer test instructions

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

## Store assets

Screenshots:

- `store-assets/chrome-web-store/screenshot-options-1280x800.png`
- `store-assets/chrome-web-store/screenshot-result-basic-1280x800.png`
- `store-assets/chrome-web-store/screenshot-result-advanced-1280x800.png`

Promo asset:

- `store-assets/chrome-web-store/promo-small-440x280.png`

## Pre-submit checklist

- The GitHub repository is public, or the privacy/support URLs have been moved
  to another public destination.
- Privacy policy URL opens without authentication.
- Support URL opens without authentication.
- Screenshot assets match the final dashboard upload.
- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
- `pnpm test:e2e` passes.
- `pnpm release` produces the intended `slophammer-1.0.0-chrome.zip`.
- The generated ZIP has `manifest.json` at the ZIP root.
