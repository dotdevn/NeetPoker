# Security Policy

## Supported Deployments

This project is intended for local development and demo/testnet operation.
Do not run with mainnet funds unless you have performed your own security review.

## Reporting a Vulnerability

Please report security issues privately to the maintainers before public disclosure.
Include:

- Affected file(s)/endpoint(s)
- Reproduction steps
- Expected vs actual behavior
- Impact assessment

## Secrets and Keys

- Never commit `.env` or private keys.
- Use testnet-only wallets and API keys for development.
- Rotate any key immediately if it is exposed in logs, screenshots, terminals, or chat.
- Prefer `MOCK_PAYMENTS=true` for local UI testing when payments are not required.

## Operational Notes

- Optional debug ingestion is disabled by default and requires explicit env vars.
- Verify `.gitignore` is active before publishing (`.env`, `.cursor`, `dist`, `node_modules`).
