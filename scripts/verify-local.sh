#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

run() {
  printf "\n==> %s\n" "$*"
  "$@"
}

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to run local verification."
  exit 1
fi

if [ ! -d node_modules ]; then
  run bun install --frozen-lockfile
fi

if [ ! -d functions/node_modules ]; then
  run npm --prefix functions ci
fi

run bun run lint
run bun run typecheck
run bun run test:unit
run bun run test:domain
run bun run firebase:data
run sh -c 'cd functions && bun run lint'
run sh -c 'cd functions && bun run build'
run bun run build
run bun run audit

if [ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  for browser in google-chrome-stable google-chrome chromium chromium-browser; do
    if command -v "$browser" >/dev/null 2>&1; then
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v "$browser")"
      export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      break
    fi
  done
fi

printf "\n==> bun run test:e2e\n"
if ! bun run test:e2e; then
  cat <<'EOF'

E2E tests failed. If the failure says a Playwright browser executable is missing, install it with:

  bunx playwright install chromium

Then rerun:

  bun run verify

EOF
  exit 1
fi

printf "\nAll local verification checks passed.\n"
