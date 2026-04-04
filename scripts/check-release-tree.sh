#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BLOCKERS=(
  "node_modules"
  "server/node_modules"
  "dashboard/node_modules"
  "server/dist"
  "dashboard/dist"
  "server/data/feedback.jsonl"
  "dashboard/tsconfig.tsbuildinfo"
)

FAILED=0
for path in "${BLOCKERS[@]}"; do
  if [[ -e "$path" ]]; then
    echo "Release blocker present: $path"
    FAILED=1
  fi
done

if [[ "$FAILED" -ne 0 ]]; then
  echo ""
  echo "Clean these local/build artifacts before open-source publishing."
  exit 1
fi

echo "Release tree check passed (no local/build artifacts detected)."
