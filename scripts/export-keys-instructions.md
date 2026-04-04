# Exporting OWS keys for x402 (testnet only)

Per [docs/ORACLE.md](../docs/ORACLE.md) §3b Option A, the server uses viem with exported hex keys.

```bash
ows wallet export --wallet gpt --format raw-evm
ows wallet export --wallet claude --format raw-evm
# ... gemini, mistral, deepseek, grok, pot
```

Paste into `.env` as `GPT_PRIVATE_KEY`, etc. Never commit `.env`.

Production path: proxy signing through OWS REST/MCP without exporting keys.
