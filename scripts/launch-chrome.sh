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
PROFILE="${SLOPHAMMER_CHROME_PROFILE:-$HOME/.slophammer-chrome-profile}"
CDP_PORT="${SLOPHAMMER_CDP_PORT:-9222}"

if ! [[ "$CDP_PORT" =~ ^[0-9]+$ ]] || [ "$CDP_PORT" -lt 1 ] || [ "$CDP_PORT" -gt 65535 ]; then
  echo "SLOPHAMMER_CDP_PORT must be an integer from 1 to 65535 (received: $CDP_PORT)." >&2
  exit 1
fi

if [ ! -d "$EXT" ]; then
  echo "Extension not built. Run: pnpm build  (or pnpm dev)" >&2
  exit 1
fi

echo "Launching Chrome for Testing"
echo "  binary : $BIN"
echo "  ext    : $EXT"
echo "  profile: $PROFILE"
echo "  CDP    : http://localhost:$CDP_PORT"

exec "$BIN" \
  --remote-debugging-port="$CDP_PORT" \
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
