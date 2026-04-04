#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-repo}"
PATTERN='sk-or-v1-[A-Za-z0-9._-]{24,}|AIza[0-9A-Za-z_-]{20,}|[A-Z0-9_]*PRIVATE_KEY=0x[a-fA-F0-9]{64}|(GAME_ADMIN_TOKEN|FEEDBACK_ADMIN_TOKEN)=[^[:space:]#]{16,}'

if [[ "$MODE" == "repo" ]]; then
  MATCHES="$(
    rg -n -P "$PATTERN" \
      --hidden \
      --glob '!**/node_modules/**' \
      --glob '!**/dist/**' \
      --glob '!.cursor/**' \
      --glob '!.env' \
      --glob '!.env.local' \
      --glob '!.env.*.local' \
      || true
  )"
elif [[ "$MODE" == "local" ]]; then
  LOCAL_FILES=()
  for file in .env .env.local .env.*.local; do
    [[ -f "$file" ]] && LOCAL_FILES+=("$file")
  done
  if [[ "${#LOCAL_FILES[@]}" -eq 0 ]]; then
    echo "No local env files found."
    exit 0
  fi
  MATCHES="$(rg -n -P "$PATTERN" "${LOCAL_FILES[@]}" || true)"
else
  echo "Unknown mode: $MODE (expected: repo | local)"
  exit 2
fi

if [[ -n "$MATCHES" ]]; then
  echo "Potential secrets detected ($MODE scan):"
  echo "$MATCHES" | sed -E 's/(=).+$/=\[REDACTED]/'
  echo ""
  echo "Remove or rotate these values before publishing."
  exit 1
fi

if [[ "$MODE" == "repo" ]]; then
  echo "No obvious secrets found in publishable files."
else
  echo "No obvious secrets found in local env files."
fi
