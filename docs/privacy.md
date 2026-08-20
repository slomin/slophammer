# SlopHammer Privacy Policy

SlopHammer is a browser extension that checks user-selected webpage text for AI-like signals with a local classifier.

## What SlopHammer reads

SlopHammer reads text only when you explicitly select it and choose **Check with SlopHammer**. Classification runs locally in Chrome. Selected text is not sent to Hugging Face or to SlopHammer’s developers.

## What SlopHammer stores

The extension stores settings, verified model identity/install state, resumable migration state, and classifier files locally in Chrome. A pre-v1 upgrade intentionally clears old extension storage and retired model files before installing the v1 classifier.

## Network access

During setup, migration, or an explicit update check, SlopHammer contacts Hugging Face to discover and download the pinned `Slomin/slophammer_350m/slophammer_350m_v0_1.zip` model artifact. The SHA-256 is verified before installation. The artifact is model data, not remote browser-executed code.

SlopHammer does not sell user data or use selected text for advertising, tracking, profiling, or analytics. It does not intentionally collect personally identifiable information.
