# Slop Hammer Privacy Policy

Last updated: 2026-05-19

Slop Hammer is a browser extension for checking selected webpage text for signs
of AI-generated or AI-assisted writing. The extension is designed to run the
text analysis locally in Chrome after its classifier model has been installed.

## What Slop Hammer reads

Slop Hammer reads selected webpage text only when you explicitly choose
**Check with Slop Hammer** from Chrome's right-click menu.

The extension does not continuously read pages in the background, and it does
not analyze text unless you select text and invoke the extension action.

## What Slop Hammer stores

Slop Hammer stores the following data locally in your browser:

- extension settings, such as result detail and theme preference
- model installation state and model metadata
- the classifier model files used for local analysis

Model files are stored in browser-local storage using Chrome's Origin Private
File System. They remain on your device unless you remove the extension data or
replace/reinstall the model.

## Network access

During setup or update checks, Slop Hammer may contact Hugging Face to download
or compare the official classifier model ZIP.

That download is model data used by the local classifier. Slop Hammer does not
fetch remote JavaScript or WebAssembly to execute in the browser.

Normal text checks do not send your selected text to a remote analysis service.

## Data sharing

Slop Hammer does not sell user data.

Slop Hammer does not use selected text for advertising, tracking, profiling, or
analytics.

Slop Hammer does not intentionally collect personally identifiable information.
Selected text can contain personal information if you choose to select such
text, but the extension processes that selected text locally for the requested
check.

## Contact

For support or privacy questions, use the project support page:

https://github.com/slomin/slophammer/blob/main/docs/support.md
