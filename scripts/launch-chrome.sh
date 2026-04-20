#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

BIN_PATH_FILE="chrome-for-testing/bin-path.txt"
if [ ! -f "$BIN_PATH_FILE" ]; then
  echo "Chrome for Testing not installed. Run: pnpm setup:chrome" >&2
  exit 1
fi
BIN="$(cat "$BIN_PATH_FILE")"

EXT="$PWD/.output/chrome-mv3"
PROFILE="$HOME/.slophammer-chrome-profile"

if [ ! -d "$EXT" ]; then
  echo "Extension not built. Run: pnpm build  (or pnpm dev)" >&2
  exit 1
fi

echo "Launching Chrome for Testing"
echo "  binary : $BIN"
echo "  ext    : $EXT"
echo "  profile: $PROFILE"
echo "  CDP    : http://localhost:9222"

exec "$BIN" \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE" \
  --load-extension="$EXT" \
  --disable-extensions-except="$EXT" \
  --use-mock-keychain \
  --password-store=basic \
  --no-first-run \
  --no-default-browser-check \
  --hide-crash-restore-bubble \
  --disable-features=InfiniteSessionRestore \
  "$@"
