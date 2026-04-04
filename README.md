# NeetPoker — THE $10 TABLE (brief v2)

[![CI](https://github.com/nikhildd32/NeetPoker/actions/workflows/ci.yml/badge.svg)](https://github.com/nikhildd32/NeetPoker/actions/workflows/ci.yml)

Six foundation models, identical prompts, real USDC microbets on Base Sepolia via x402 and OWS wallets. See [docs/ORACLE.md](docs/ORACLE.md) (same as [hackathon-brief-v2.md](hackathon-brief-v2.md)) for the full specification.

## Quick start

1. Install OWS CLI: `curl -fsSL https://docs.openwallet.sh/install.sh | bash` — then `source ~/.zshrc` (or `export PATH="$HOME/.ows/bin:$PATH"`). See [Open Wallet Standard](https://openwallet.sh/).
2. Node.js 22+
3. `cp .env.example .env` and fill secrets (LLM keys, wallet addresses, private keys for testnet)
4. `bash scripts/create-wallets.sh` if you need wallets created (see script output)
5. Fund each agent wallet with Base Sepolia USDC ([Circle faucet](https://faucet.circle.com))
6. `npm install`
7. Optional: `npm run check-balances` — runs `ows fund balance` per agent (set `OWS_FUND_BALANCE_CHAIN=eip155:84532` in `.env` for Base Sepolia; CLI default is Base mainnet)
8. `npm run dev` — API on `http://localhost:8000`, dashboard on `http://localhost:5173`
9. `curl -X POST http://localhost:8000/game/start -H "X-Admin-Token: $GAME_ADMIN_TOKEN"` to begin a tournament

Game-control endpoints now require an admin token. Set `GAME_ADMIN_TOKEN` in `.env` and pass it as `X-Admin-Token` (or `Authorization: Bearer ...`) for mutating `/game/*` requests.

Set `MOCK_PAYMENTS=true` in `.env` to run without on-chain USDC (game logic still runs; x402 client uses mock responses). You still need real LLM API keys for agents to play.

In real mode, payment retries are configurable:
- `PAYMENT_RETRY_COUNT=1`
- `PAYMENT_RETRY_TIMEOUT_MS=1500`

If blind/payout payments keep failing at runtime, the server degrades the tournament to mock-payment mode to keep gameplay moving and broadcasts a payment-mode change event.

For a watchable demo pace, increase delays in `.env`:
- `HAND_DELAY_MS=5000`
- `ACTION_DELAY_MS=3000`

## OWS wallet setup

**Wallet names must match these agent IDs exactly:** `gpt`, `claude`, `gemini`, `grok`, `mistral`, `deepseek`, and `pot` (house pot).

1. **PATH** — After installing OWS (`curl -fsSL https://docs.openwallet.sh/install.sh | bash`), ensure `~/.ows/bin` is on your `PATH` (e.g. `source ~/.zshrc` or `export PATH="$HOME/.ows/bin:$PATH"`).

2. **Import** — Never commit or paste keys into issues/chat.

   ```bash
   export PATH="$HOME/.ows/bin:$PATH"
   # Interactive: CLI prompts for the private key
   ows wallet import --name claude --private-key --chain ethereum
   ```

   Non-interactive (documented by OWS): set `OWS_PRIVATE_KEY` to the hex key, then run the same import command. Prefer a private shell session; clear the variable afterward.

3. **Verify** — `ows wallet list` and confirm the **Ethereum / `eip155`** address is the one you intend for that agent on Base Sepolia.

4. **Wrong key on a name** — `ows wallet delete --wallet <name> --confirm`, then import again.

**Security:** The OWS vault under `~/.ows` is hot-wallet territory. Do not commit vault data; rotate keys if exposed.

## LLM Routing

All six models route through OpenRouter using OpenAI-compatible Chat Completions with one shared key fallback:

- GPT: `openai/gpt-oss-120b`
- Claude: `anthropic/claude-haiku-4.5`
- Grok: `x-ai/grok-4.1-fast`
- Mistral: `mistralai/mistral-small-3.1-24b-instruct:free` (default)
- DeepSeek: `deepseek/deepseek-v3.2`
- Gemini: `google/gemini-2.5-flash`

## Packages

- `server/` — Express, `@x402/express`, WebSocket, `pokersolver`, LLM routing
- `dashboard/` — Vite + React + Tailwind + shadcn + Sensory UI slider + Framer Motion

## Demo script

See brief §10 in [docs/ORACLE.md](docs/ORACLE.md) (3-minute judge narrative).

## Open-Source Safety Notes

- Never commit `.env` (this repo ignores it by default).
- Use testnet-only wallets and keys; rotate immediately if any secret is exposed.
- Optional debug ingestion is disabled by default. To enable local debug export, set:
  - `DEBUG_INGEST_URL=http://127.0.0.1:7325/ingest/...`
  - `DEBUG_SESSION_ID=<your-session-id>`
- Run `npm run check:secrets:repo` before publishing tracked files.
- Run `npm run check:secrets:local` to check local env files.
- Run `npm run check:release` before packaging/open-sourcing (fails if local/build artifacts are present).
- Brand logos/names may be trademarks of their owners. Confirm your redistribution rights before publishing.
