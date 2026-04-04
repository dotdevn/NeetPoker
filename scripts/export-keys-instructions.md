# Exporting OWS keys for x402 (testnet only)

Per [docs/ORACLE.md](../docs/ORACLE.md), the server uses viem with exported hex keys.

OWS CLI **1.2+** (`ows wallet export`) does **not** use `--format`; run it in a **normal terminal** (it refuses piped/non-interactive stdin).

```bash
ows wallet export --wallet gpt
ows wallet export --wallet claude
# ... gemini, mistral, deepseek, grok, pot
```

Follow the prompts and copy the **EVM** private key (`0x…`) into `.env` as `GPT_PRIVATE_KEY`, etc. Never commit `.env`.

**Base Sepolia balances:** `ows fund balance` defaults to Base **mainnet**. For testnet, use e.g. `OWS_FUND_BALANCE_CHAIN=eip155:84532` with `scripts/check-balances.sh` or:

```bash
ows fund balance --wallet gpt --chain eip155:84532
```

Production path: proxy signing through OWS REST/MCP without exporting keys.
