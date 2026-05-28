#!/usr/bin/env sh
set -eu

PROJECT_ID="${FIREBASE_PROJECT_ID:-drp03-50059}"
REGION="${FIREBASE_FUNCTIONS_REGION:-europe-west2}"
FUNCTIONS_HOST="${FIREBASE_FUNCTIONS_HOST:-127.0.0.1}"
FUNCTIONS_PORT="${FIREBASE_FUNCTIONS_PORT:-5001}"
FUNCTIONS_BASE_URL="http://${FUNCTIONS_HOST}:${FUNCTIONS_PORT}/${PROJECT_ID}/${REGION}"
OPENFOODFACTS_BASE_URL="${OPENFOODFACTS_BASE_URL:-https://world.openfoodfacts.net}"
export OPENFOODFACTS_BASE_URL

cleanup() {
  if [ -n "${EMULATOR_PID:-}" ]; then
    kill "$EMULATOR_PID" 2>/dev/null || true
    wait "$EMULATOR_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

bun run firebase:data
cd functions
bun run build
cd ..

./node_modules/.bin/firebase emulators:start --only functions,firestore &
EMULATOR_PID="$!"

printf "Waiting for Firebase Functions emulator at %s...\n" "$FUNCTIONS_BASE_URL"

attempt=0
until curl -fsS "${FUNCTIONS_BASE_URL}/deadlineFoodBootstrap" >/dev/null 2>&1; do
  attempt=$((attempt + 1))

  if [ "$attempt" -ge 60 ]; then
    echo "Firebase emulator did not become ready in time." >&2
    exit 1
  fi

  sleep 1
done

echo "Firebase emulator is ready."
echo "Emulator UI: http://127.0.0.1:4000"
echo "OpenFoodFacts API: ${OPENFOODFACTS_BASE_URL}"
echo "Starting app on http://localhost:3000"
echo "Open: http://localhost:3000/"

BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND=firebase \
BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL="${FUNCTIONS_BASE_URL}" \
BUN_PUBLIC_FIREBASE_PROJECT_ID="${PROJECT_ID}" \
BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION="${REGION}" \
bun run dev
