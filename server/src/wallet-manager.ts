import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { AGENT_IDS, getWalletAddress, getWalletPrivateKey, type AgentId } from "./config.js";

const DISPLAY: Record<AgentId, string> = {
  "gpt": "GPT",
  claude: "Claude",
  gemini: "Gemini",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  grok: "Grok",
};

let signers: Map<string, PrivateKeyAccount> | null = null;

export function createSigners(): Map<string, PrivateKeyAccount> {
  const ids = [...AGENT_IDS, "pot"] as const;
  const next = new Map<string, PrivateKeyAccount>();
  for (const id of ids) {
    next.set(id, privateKeyToAccount(getWalletPrivateKey(id)));
  }
  return next;
}

export function getSigners(): Map<string, PrivateKeyAccount> {
  if (!signers) {
    signers = createSigners();
  }
  return signers;
}

export function getAddress(agentId: string): string {
  return getWalletAddress(agentId);
}

export function getPotAddress(): string {
  return getWalletAddress("pot");
}

export function displayName(agentId: string): string {
  return DISPLAY[agentId as AgentId] ?? agentId;
}

export { AGENT_IDS };
