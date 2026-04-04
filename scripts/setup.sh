#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Installing root dependencies..."
npm install
echo "Copy .env.example to .env if missing..."
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env — edit with your keys and wallet material."
fi
echo "Done. Next: ensure ~/.ows/bin is on PATH (source ~/.zshrc after OWS install), bash scripts/create-wallets.sh, fund wallets, npm run dev"
