#!/usr/bin/env bash
# Launch the user's actual Google Chrome binary (not Chrome for Testing) with
# remote debugging enabled on :9223 so we can run our smoke against a real
# Chrome install. Uses a disposable profile dir so it doesn't touch the daily
# profile's data.
set -euo pipefail

cd "$(dirname "$0")/.."

BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -x "$BIN" ]; then
  echo "Not found: $BIN"
  echo "Is Google Chrome installed in /Applications?"
  exit 1
fi

EXT="$PWD/references/releases/current/unpacked"
PROFILE="$HOME/.slophammer-real-chrome-profile"

if [ ! -d "$EXT" ]; then
  echo "Release folder not found at $EXT"
  echo "Run: pnpm release"
  exit 1
fi

echo "Launching Google Chrome"
echo "  binary : $BIN"
echo "  ext    : $EXT"
echo "  profile: $PROFILE   (disposable; does not touch your daily profile)"
echo "  CDP    : http://localhost:9223"

exec "$BIN" \
  --remote-debugging-port=9223 \
  --user-data-dir="$PROFILE" \
  --load-extension="$EXT" \
  --disable-extensions-except="$EXT" \
  --use-mock-keychain \
  --password-store=basic \
  --no-first-run \
  --no-default-browser-check
