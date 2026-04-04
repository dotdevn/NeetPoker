#!/usr/bin/env bash
# Creates seven OWS wallets for THE $10 TABLE. Requires: ows CLI installed.
set -euo pipefail
export PATH="${HOME}/.ows/bin:${PATH}"
if ! command -v ows &>/dev/null; then
  echo "Install OWS first: curl -fsSL https://docs.openwallet.sh/install.sh | bash"
  echo "Then: source ~/.zshrc   (or add ~/.ows/bin to PATH)"
  exit 1
fi

names=(grok gpt gemini claude mistral deepseek pot)
for n in "${names[@]}"; do
  if ows wallet list 2>/dev/null | grep -qE "^Name:[[:space:]]+${n}[[:space:]]*$"; then
    echo "Wallet '$n' already exists, skipping create."
  else
    ows wallet create --name "$n"
  fi
done

echo ""
echo "=== Wallet addresses (EVM) — copy into .env ==="
ows wallet list

echo ""
echo "Export EVM private keys for viem (testnet only) — run in an interactive terminal:"
echo "  ows wallet export --wallet grok"
echo "Repeat for gpt, gemini, claude, mistral, deepseek, pot — paste hex into *_PRIVATE_KEY in .env"
echo ""
echo "Fund six agent wallets with Base Sepolia USDC: https://faucet.circle.com"
