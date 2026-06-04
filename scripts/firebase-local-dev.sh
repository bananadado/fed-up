#!/usr/bin/env sh
set -eu

PROJECT_ID="${FIREBASE_PROJECT_ID:-drp03-50059}"
REGION="${FIREBASE_FUNCTIONS_REGION:-europe-west2}"
FUNCTIONS_HOST="${FIREBASE_FUNCTIONS_HOST:-127.0.0.1}"
FUNCTIONS_PORT="${FIREBASE_FUNCTIONS_PORT:-5001}"
FUNCTIONS_BASE_URL="http://${FUNCTIONS_HOST}:${FUNCTIONS_PORT}/${PROJECT_ID}/${REGION}"
OPENFOODFACTS_BASE_URL="${OPENFOODFACTS_BASE_URL:-https://world.openfoodfacts.net}"
BACKEND_MODE="${FIREBASE_DEV_BACKEND:-auto}"
BACKEND_COMPOSE_FILE="${BACKEND_COMPOSE_FILE:-backend/docker-compose.yml}"
BACKEND_COMPOSE_PROJECT="${BACKEND_COMPOSE_PROJECT:-drp03-firebase-dev}"
BACKEND_COMPOSE_SERVICES="${BACKEND_COMPOSE_SERVICES:-api}"
LOCAL_RECOMMENDER_API_URL="${LOCAL_RECOMMENDER_API_URL:-http://127.0.0.1:8100}"
REMOTE_RECOMMENDER_API_URL="${REMOTE_RECOMMENDER_API_URL:-https://recommender.timkolesnichenko.me}"
LOCAL_RECOMMENDER_API_KEY="${LOCAL_RECOMMENDER_API_KEY:-local-firebase-dev-recommender-key}"
RECOMMENDER_API_URL_WAS_SET=0
RECOMMENDER_API_KEY_WAS_SET=0
if [ "${RECOMMENDER_API_URL+x}" ]; then
  RECOMMENDER_API_URL_WAS_SET=1
fi
if [ "${RECOMMENDER_API_KEY+x}" ]; then
  RECOMMENDER_API_KEY_WAS_SET=1
fi
RECOMMENDER_API_URL="${RECOMMENDER_API_URL:-$LOCAL_RECOMMENDER_API_URL}"
RECOMMENDER_API_KEY="${RECOMMENDER_API_KEY:-}"
export OPENFOODFACTS_BASE_URL RECOMMENDER_API_URL RECOMMENDER_API_KEY

has_nvidia_docker() {
  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1 || return 1
  docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -qi nvidia
}

cleanup() {
  if [ -n "${EMULATOR_PID:-}" ]; then
    kill "$EMULATOR_PID" 2>/dev/null || true
    wait "$EMULATOR_PID" 2>/dev/null || true
  fi

  if [ "${BACKEND_STARTED:-0}" = "1" ]; then
    docker compose \
      -p "$BACKEND_COMPOSE_PROJECT" \
      -f "$BACKEND_COMPOSE_FILE" \
      down --remove-orphans
  fi
}

trap cleanup EXIT
trap 'trap - EXIT; cleanup; exit 130' INT
trap 'trap - EXIT; cleanup; exit 143' TERM

case "$BACKEND_MODE" in
  0|false|remote)
    if [ "$RECOMMENDER_API_URL_WAS_SET" = "0" ]; then
      RECOMMENDER_API_URL="$REMOTE_RECOMMENDER_API_URL"
    fi
    ;;
  1|true|local)
    START_LOCAL_BACKEND=1
    ;;
  auto)
    if has_nvidia_docker; then
      START_LOCAL_BACKEND=1
    else
      START_LOCAL_BACKEND=0
      if [ "$RECOMMENDER_API_URL_WAS_SET" = "0" ]; then
        RECOMMENDER_API_URL="$REMOTE_RECOMMENDER_API_URL"
      fi
      echo "NVIDIA Docker runtime not detected; using remote recommender API at ${RECOMMENDER_API_URL}."
    fi
    ;;
  *)
    echo "Unsupported FIREBASE_DEV_BACKEND value: ${BACKEND_MODE}" >&2
    echo "Use auto, local, remote, 1, or 0." >&2
    exit 1
    ;;
esac

if [ "${START_LOCAL_BACKEND:-0}" = "1" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required to start the local backend stack." >&2
    exit 1
  fi
  if ! has_nvidia_docker; then
    echo "NVIDIA Docker runtime is required for FIREBASE_DEV_BACKEND=local." >&2
    echo "Use FIREBASE_DEV_BACKEND=auto or FIREBASE_DEV_BACKEND=remote to use ${REMOTE_RECOMMENDER_API_URL}." >&2
    exit 1
  fi

  RECOMMENDER_API_URL="${RECOMMENDER_API_URL:-$LOCAL_RECOMMENDER_API_URL}"
  RECOMMENDER_API_KEY="${RECOMMENDER_API_KEY:-$LOCAL_RECOMMENDER_API_KEY}"
  BACKEND_API_HEALTH_URL="${BACKEND_API_HEALTH_URL:-${RECOMMENDER_API_URL%/}/health}"
  export RECOMMENDER_API_URL RECOMMENDER_API_KEY
  echo "Starting backend stack with docker compose (${BACKEND_COMPOSE_SERVICES})..."
  BACKEND_STARTED=1
  docker compose \
    -p "$BACKEND_COMPOSE_PROJECT" \
    -f "$BACKEND_COMPOSE_FILE" \
    up -d $BACKEND_COMPOSE_SERVICES

  printf "Waiting for backend API at %s...\n" "$BACKEND_API_HEALTH_URL"

  attempt=0
  until curl -fsS "$BACKEND_API_HEALTH_URL" >/dev/null 2>&1; do
    attempt=$((attempt + 1))

    if [ "$attempt" -ge 120 ]; then
      echo "Backend API did not become ready in time." >&2
      exit 1
    fi

    sleep 1
  done

  echo "Backend API is ready."
elif [ "$RECOMMENDER_API_KEY_WAS_SET" = "0" ]; then
  echo "Remote recommender endpoints require RECOMMENDER_API_KEY in your environment." >&2
  echo "Non-recommender Firebase emulator endpoints will still start." >&2
fi

bun run firebase:data
cd functions
bun run build
cd ..

./node_modules/.bin/firebase emulators:start --only functions,firestore,storage &
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
echo "Recommender API: ${RECOMMENDER_API_URL}"
echo "Starting app on http://localhost:3000"
echo "Open: http://localhost:3000/"

BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND=firebase \
BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL="${FUNCTIONS_BASE_URL}" \
BUN_PUBLIC_FIREBASE_PROJECT_ID="${PROJECT_ID}" \
BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION="${REGION}" \
bun run dev
