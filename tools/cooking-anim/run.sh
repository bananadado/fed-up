#!/usr/bin/env bash
# End-to-end pipeline: generate any missing animations, then sync them into the
# frontend. Re-runnable / idempotent (skips ids that already exist; --force redoes).
#
# Usage:
#   ./run.sh                 # generate missing + sync
#   ./run.sh --force         # regenerate everything + sync
#   ./run.sh --only chop_onion,fry_tofu
#   FPS=3 FRAMES=6 SIZE=256 ./run.sh
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
FPS="${FPS:-4}"
FRAMES="${FRAMES:-8}"
SIZE="${SIZE:-256}"

echo ">> Generating animations (fps=$FPS frames=$FRAMES size=$SIZE)"
"$PYTHON" generate.py --fps "$FPS" --frames "$FRAMES" --size "$SIZE" "$@"

echo ">> Syncing into frontend"
"$PYTHON" sync_frontend.py

echo ">> Done. Review src/prototype/cookingAnimations/generated/, then commit the .webp + index.ts."
