/**
 * Generates fresh Base Sepolia–style EVM wallets and writes *_WALLET_ADDRESS / *_PRIVATE_KEY
 * into the repo-root `.env`. Does not modify API key lines.
 * Run: npm run gen-wallets
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");

const PREFIXES = [
  "GROK",
  "GPT",
  "GEMINI",
  "CLAUDE",
  "MISTRAL",
  "DEEPSEEK",
  "POT",
] as const;

function main(): void {
  let text = readFileSync(envPath, "utf8");
  for (const prefix of PREFIXES) {
    const pk = generatePrivateKey();
    const ac = privateKeyToAccount(pk);
    text = text.replace(
      new RegExp(`^${prefix}_WALLET_ADDRESS=.*$`, "m"),
      `${prefix}_WALLET_ADDRESS=${ac.address}`,
    );
    text = text.replace(
      new RegExp(`^${prefix}_PRIVATE_KEY=.*$`, "m"),
      `${prefix}_PRIVATE_KEY=${pk}`,
    );
  }
  writeFileSync(envPath, text, "utf8");
  console.log(`Updated wallet lines in ${envPath}`);
  console.log("Fund agent wallets with Base Sepolia USDC: https://faucet.circle.com");
}

main();
