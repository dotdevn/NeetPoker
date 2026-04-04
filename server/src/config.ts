import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

function req(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) return fallback;
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function csv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export type AgentConfig = {
  id: "gpt" | "claude" | "gemini" | "grok" | "mistral" | "deepseek";
  displayName: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
  walletAddressEnv: string;
  privateKeyEnv: string;
};

export const AGENTS: AgentConfig[] = [
  {
    id: "gpt",
    displayName: "GPT",
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "GPT_MODEL",
    defaultModel: "openai/gpt-oss-120b",
    walletAddressEnv: "GPT_WALLET_ADDRESS",
    privateKeyEnv: "GPT_PRIVATE_KEY",
  },
  {
    id: "claude",
    displayName: "Claude",
    baseUrlEnv: "CLAUDE_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "CLAUDE_API_KEY",
    modelEnv: "CLAUDE_MODEL",
    defaultModel: "anthropic/claude-haiku-4.5",
    walletAddressEnv: "CLAUDE_WALLET_ADDRESS",
    privateKeyEnv: "CLAUDE_PRIVATE_KEY",
  },
  {
    id: "gemini",
    displayName: "Gemini",
    baseUrlEnv: "GEMINI_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "google/gemini-2.5-flash",
    walletAddressEnv: "GEMINI_WALLET_ADDRESS",
    privateKeyEnv: "GEMINI_PRIVATE_KEY",
  },
  {
    id: "grok",
    displayName: "Grok",
    baseUrlEnv: "GROK_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "XAI_API_KEY",
    modelEnv: "GROK_MODEL",
    defaultModel: "x-ai/grok-4.1-fast",
    walletAddressEnv: "GROK_WALLET_ADDRESS",
    privateKeyEnv: "GROK_PRIVATE_KEY",
  },
  {
    id: "mistral",
    displayName: "Mistral",
    baseUrlEnv: "MISTRAL_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    defaultModel: "mistralai/mistral-small-3.1-24b-instruct:free",
    walletAddressEnv: "MISTRAL_WALLET_ADDRESS",
    privateKeyEnv: "MISTRAL_PRIVATE_KEY",
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek/deepseek-v3.2",
    walletAddressEnv: "DEEPSEEK_WALLET_ADDRESS",
    privateKeyEnv: "DEEPSEEK_PRIVATE_KEY",
  },
];

/** Canonical clockwise seat order shared across engine and UI. */
export const SEAT_ORDER = AGENTS.map((a) => a.id) as readonly AgentConfig["id"][];
export const AGENT_IDS = SEAT_ORDER;
export type AgentId = (typeof SEAT_ORDER)[number];
const AGENT_BY_ID = new Map(AGENTS.map((a) => [a.id, a]));

const MOCK = bool("MOCK_PAYMENTS", false);
const ORIGINAL_HAND_DELAY_MS = num("HAND_DELAY_MS", 8000);
const ORIGINAL_ACTION_DELAY_MS = num("ACTION_DELAY_MS", 5000);

export const defaultDelays = {
  handDelayMs: ORIGINAL_HAND_DELAY_MS,
  actionDelayMs: ORIGINAL_ACTION_DELAY_MS,
} as const;

export const appConfig = {
  port: num("PORT", 8000),
  serverPublicUrl: opt("SERVER_PUBLIC_URL", "http://localhost:8000"),
  mockPayments: MOCK,
  allowPaymentBypass: bool("ALLOW_PAYMENT_BYPASS", false),
  x402FacilitatorUrl: opt("X402_FACILITATOR_URL", "https://facilitator.x402.org"),
  network: "eip155:84532" as const,
  baseSepoliaRpc: () => opt("BASE_SEPOLIA_RPC", "https://sepolia.base.org"),
  usdcContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
  basescanTxUrl: "https://sepolia.basescan.org/tx/" as const,

  startingStack: num("STARTING_STACK", 10),
  smallBlind: num("SMALL_BLIND", 0.05),
  bigBlind: num("BIG_BLIND", 0.1),
  handDelayMs: ORIGINAL_HAND_DELAY_MS,
  actionDelayMs: ORIGINAL_ACTION_DELAY_MS,
  llmTimeoutMs: num("LLM_TIMEOUT_MS", 12000),
  paymentRetryCount: Math.max(0, Math.min(5, Math.floor(num("PAYMENT_RETRY_COUNT", 2)))),
  paymentRetryTimeoutMs: Math.max(1000, Math.min(30000, Math.floor(num("PAYMENT_RETRY_TIMEOUT_MS", 8000)))),
  monteCarloSims: num("MONTE_CARLO_SIMS", 500),
  turboMode: false,
  feedbackAdminToken: opt("FEEDBACK_ADMIN_TOKEN", ""),
  gameAdminToken: opt("GAME_ADMIN_TOKEN", ""),
  enableManualActionApi: bool("ENABLE_MANUAL_ACTION_API", false),
  corsAllowedOrigins: csv("CORS_ALLOWED_ORIGINS", [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5714",
    "http://127.0.0.1:5714",
  ]),
  feedbackStorePath: opt("FEEDBACK_STORE_PATH", resolve(__dirname, "../data/feedback.jsonl")),
};

export function getAgentConfig(agentId: AgentId): AgentConfig {
  const agent = AGENT_BY_ID.get(agentId);
  if (!agent) {
    throw new Error(`Unknown agent id: ${agentId}`);
  }
  return agent;
}

/** dotenv does not expand ${VAR}; those literals must not be sent as Bearer tokens. */
const MIN_API_KEY_LEN = 8;
const OPENROUTER_KEY_PREFIX = "sk-or-v1-";
const OPENROUTER_SENTINELS = [
  "paste-full-key-here",
  "paste-key-here",
  "your-openrouter-key",
  "your-api-key",
  "your_key_here",
  "placeholder",
  "example",
  "changeme",
];

function validateApiKey(value: string): string | null {
  const s = value.trim();
  if (s.length < MIN_API_KEY_LEN) return "empty or too short";
  if (s.includes("${")) return 'contains a literal "${...}" reference';
  return null;
}

function validateOpenRouterApiKey(value: string): string | null {
  const s = value.trim();
  const genericError = validateApiKey(s);
  if (genericError) return genericError;
  if (!s.startsWith(OPENROUTER_KEY_PREFIX)) {
    return `must start with "${OPENROUTER_KEY_PREFIX}"`;
  }
  if (!/^sk-or-v1-[A-Za-z0-9._-]+$/.test(s)) {
    return "contains invalid characters";
  }
  const lower = s.toLowerCase();
  if (OPENROUTER_SENTINELS.some((token) => lower.includes(token))) {
    return "looks like a placeholder/sentinel value";
  }
  return null;
}

export function resolveApiKey(agent: AgentConfig): string {
  const usesOpenRouterKeyFormat = true;
  const validateForAgent = usesOpenRouterKeyFormat
    ? validateOpenRouterApiKey
    : validateApiKey;

  const rawSpecific = process.env[agent.apiKeyEnv];
  const specific = rawSpecific?.trim();
  const specificError = specific ? validateForAgent(specific) : null;
  if (specific && !specificError) {
    return specific;
  }

  const openrouter = process.env.OPENROUTER_API_KEY?.trim();
  const openrouterError =
    usesOpenRouterKeyFormat && openrouter ? validateOpenRouterApiKey(openrouter) : null;

  if (openrouter && !openrouterError) {
    return openrouter;
  }

  const invalidDetails: string[] = [];
  if (specific && specificError) {
    invalidDetails.push(`${agent.apiKeyEnv} is set but invalid (${specificError})`);
  }
  if (usesOpenRouterKeyFormat && openrouter && openrouterError) {
    invalidDetails.push(`OPENROUTER_API_KEY is set but invalid (${openrouterError})`);
  }
  const invalidHint = invalidDetails.length > 0 ? ` ${invalidDetails.join(". ")}.` : "";

  throw new Error(
    `No valid API key for ${agent.displayName}.${invalidHint} Set ${agent.apiKeyEnv}${
      usesOpenRouterKeyFormat ? " or OPENROUTER_API_KEY" : ""
    } to the full secret string${
      usesOpenRouterKeyFormat ? ` (must start with "${OPENROUTER_KEY_PREFIX}")` : ""
    } (no \${VAR} references).`,
  );
}

export function resolveBaseUrl(agent: AgentConfig): string {
  const specific = process.env[agent.baseUrlEnv];
  if (specific) return specific;
  return agent.defaultBaseUrl;
}

export function resolveModel(agent: AgentConfig): string {
  // Backward compatibility for older env naming before gpt-4o -> gpt alias cleanup.
  if (agent.id === "gpt") {
    const legacy = process.env.GPT4O_MODEL;
    if (!process.env[agent.modelEnv] && legacy) return legacy;
  }
  return opt(agent.modelEnv, agent.defaultModel);
}

export function walletAddressKey(agentId: string): string {
  if (agentId === "pot") return "POT_WALLET_ADDRESS";
  const agent = AGENT_BY_ID.get(agentId as AgentId);
  if (agent) return agent.walletAddressEnv;
  return `${agentId.toUpperCase()}_WALLET_ADDRESS`;
}

export function walletPrivateKeyKey(agentId: string): string {
  if (agentId === "pot") return "POT_PRIVATE_KEY";
  const agent = AGENT_BY_ID.get(agentId as AgentId);
  if (agent) return agent.privateKeyEnv;
  return `${agentId.toUpperCase()}_PRIVATE_KEY`;
}

export function getWalletAddress(agentId: string): string {
  if (MOCK) return "0x0000000000000000000000000000000000000001";
  if (agentId === "gpt") {
    const legacy = process.env.GPT4O_WALLET_ADDRESS;
    if (!process.env.GPT_WALLET_ADDRESS && legacy) return legacy;
  }
  return req(walletAddressKey(agentId));
}

export function getWalletPrivateKey(agentId: string): `0x${string}` {
  if (MOCK) return "0x0000000000000000000000000000000000000000000000000000000000000001";
  if (agentId === "gpt") {
    const legacy = process.env.GPT4O_PRIVATE_KEY;
    if (!process.env.GPT_PRIVATE_KEY && legacy) return legacy as `0x${string}`;
  }
  return req(walletPrivateKeyKey(agentId)) as `0x${string}`;
}
