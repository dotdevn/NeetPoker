#!/usr/bin/env bash
# Creates seven OWS wallets for THE $10 TABLE. Requires: ows CLI installed.
set -euo pipefail
if ! command -v ows &>/dev/null; then
  echo "Install OWS first: curl -fsSL https://docs.openwallet.sh/install.sh | bash"
  exit 1
fi

names=(grok gpt gemini claude mistral deepseek pot)
for n in "${names[@]}"; do
  if ows wallet list 2>/dev/null | grep -q "$n"; then
    echo "Wallet '$n' already exists, skipping create."
  else
    ows wallet create --name "$n"
  fi
done

echo ""
echo "=== Wallet addresses (EVM) — copy into .env ==="
ows wallet list

echo ""
echo "Export raw EVM keys for viem (testnet only):"
echo "  ows wallet export --wallet grok --format raw-evm"
echo "Repeat for grok, gpt, gemini, claude, mistral, deepseek, pot — set *_PRIVATE_KEY in .env"
echo ""
echo "Fund six agent wallets with Base Sepolia USDC: https://faucet.circle.com"
