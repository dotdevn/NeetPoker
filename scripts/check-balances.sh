#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export PATH="$REPO_ROOT/node_modules/.bin:$PATH"

if ! command -v ows &>/dev/null; then
  echo "ows CLI not found. Run: npm install (from repo root)"
  exit 1
fi

# Load .env so OWS_VAULT_PATH, OWS_WALLET_NAMES, etc. apply (same as your app)
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

# OWS stores the vault at $HOME/.ows — it does not read OWS_VAULT_PATH.
# If .env sets OWS_VAULT_PATH=/path/to/.ows, point HOME at /path/to so ~/.ows matches.
if [[ -n "${OWS_VAULT_PATH:-}" ]]; then
  _vp="${OWS_VAULT_PATH/#\~/$HOME}"
  if [[ "$_vp" == */.ows ]]; then
    export HOME="$(cd "$(dirname "$_vp")" && pwd)"
  fi
fi

# Comma-separated names as shown by: ows wallet list (NeetPoker agents + pot)
_DEFAULT_NAMES="grok,gpt,gemini,claude,mistral,deepseek,pot"
IFS=',' read -r -a WALLETS <<< "${OWS_WALLET_NAMES:-$_DEFAULT_NAMES}"

echo "Using vault: $HOME/.ows"
if [[ -n "${OWS_WALLET_NAMES:-}" ]]; then
  echo "Wallets (from OWS_WALLET_NAMES): ${OWS_WALLET_NAMES}"
else
  echo "Wallets (default): $_DEFAULT_NAMES — set OWS_WALLET_NAMES in .env if names differ from ows wallet list"
fi
echo ""

for w in "${WALLETS[@]}"; do
  w="${w//[[:space:]]/}"
  [[ -z "$w" ]] && continue
  echo "--- $w ---"
  if [[ -n "${OWS_FUND_BALANCE_CHAIN:-}" ]]; then
    if ! ows fund balance --wallet "$w" --chain "$OWS_FUND_BALANCE_CHAIN"; then
      echo "(failed — run: ows wallet list   and set OWS_WALLET_NAMES to match)"
    fi
  else
    if ! ows fund balance --wallet "$w"; then
      echo "(failed — run: ows wallet list   and set OWS_WALLET_NAMES to match)"
    fi
  fi
done
