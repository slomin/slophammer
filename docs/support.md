# SlopHammer Support

SlopHammer checks selected webpage text for AI-like signals locally in Chrome.

## Getting started

1. Install SlopHammer and open its options page.
2. Install the verified SlopHammer 350M v0.1 model from Hugging Face.
3. Open a normal HTTP/HTTPS page and select at least 40 words.
4. Right-click and choose **Check with SlopHammer**.

SlopHammer v1 requires WebGPU. If Chrome reports WebGPU is unavailable, this device is not supported; there is no CPU fallback.

Results are probabilistic and can be wrong. Consider them alongside other evidence.

If installation or a pre-v1 migration fails, open options and use the displayed retry action. SlopHammer keeps the retired model unavailable and resumes the verified 350M install; it does not roll back.

Report problems at https://github.com/slomin/slophammer/issues/new and include the Chrome version, OS, WebGPU availability, model/migration status, and the visible error text. Do not include private selected text.
