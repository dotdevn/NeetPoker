import OpenAI from "openai";
import {
  appConfig,
  type AgentId,
  type AgentConfig,
  getAgentConfig,
  resolveApiKey,
  resolveBaseUrl,
  resolveModel,
} from "./config.js";
import {
  monteCarloEquity,
  evaluateHandStrength,
  potOddsRatio,
  type CardCode,
} from "./hand-eval.js";
import type { PokerEngineState } from "./poker-engine.js";

const SYSTEM_PROMPT = `You are a poker agent competing in a no-limit Texas Hold'em tournament against other AI agents. Your goal is to maximize your chip stack over the course of the tournament.

GAME CONTEXT:
- You are playing with real USDC on Base Sepolia testnet
- Every bet you make is an actual on-chain payment
- You are competing against other AI models with identical instructions

DECISION MAKING:
You will receive structured game state with pre-computed values. You do not need to calculate hand strength or pot odds — these are provided to you. Your job is to make the strategic decision: fold, check, call, or raise.

Use the following factors in your reasoning:
1. Hand strength relative to all possible hands (percentile provided)
2. Equity (your probability of winning at showdown, provided)
3. Pot odds (ratio of call cost to pot size, provided)
4. Position (earlier position requires stronger hands)
5. Opponent betting patterns this round (action history provided)
6. Stack sizes (yours and the pot) relative to starting stacks
7. Bluffing when equity is low but fold equity is high

BLUFFING:
You may bluff. Bluffing is rational when:
- Your equity is low (< 20%)
- The pot odds you're offering opponents make calling unprofitable
- Your position and action history suggest fold equity exists

DECISION RULES:
- If equity > pot_odds_breakeven: calling has positive expected value
- If you raise, size between min_raise and max_raise
- Fold when the math is clearly negative and no bluff equity exists

OUTPUT FORMAT (strict JSON, no other text):
{
  "action": "fold" | "check" | "call" | "raise",
  "amount": <number if raising, null otherwise>,
  "confidence": <integer 0-100 indicating confidence in this decision>,
  "reasoning": "<brief reasoning, shown publicly>"
}

The reasoning field will be displayed live on a public dashboard. Keep reasoning under 140 characters so the JSON is never cut off. Be concise; your reasoning is part of the performance.`;

export interface AgentDecision {
  action: "fold" | "check" | "call" | "raise";
  amount: number | null;
  confidence: number | null;
  reasoning: string;
}

export interface ThinkingContext {
  holeCards: string[];
  communityCards: string[];
  handStrength: {
    rankName: string;
    percentile: number;
  };
  equity: number;
  potOdds: {
    ratio: string;
    breakEvenPct: string;
  };
  toCall: number;
  potSize: number;
  stackSize: number;
  position: number;
}

function formatCards(cards: CardCode[]): string {
  return cards.map((c) => `${c.slice(0, -1)}${suitSymbol(c.slice(-1))}`).join(" ");
}

function suitSymbol(s: string): string {
  const m: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
  return m[s] ?? s;
}

function buildUserMessage(
  agentId: AgentId,
  state: PokerEngineState,
  actionHistory: string[],
): { text: string; context: ThinkingContext } {
  const p = state.players[agentId];
  const hole = p.holeCards;
  const comm = state.communityCards;
  const { rankName, percentile } = evaluateHandStrength(hole, comm);
  const alive = state.activeOrder.filter((id) => !state.players[id].folded);
  const oppCount = Math.max(0, alive.length - 1);
  const equity = monteCarloEquity(hole, comm, oppCount);
  const cur = state.roundContribution[agentId] ?? 0;
  const facing = Math.max(0, state.currentBet - cur);
  const stack = p.stack;
  const { ratio, breakEvenPct } = potOddsRatio(state.pot, facing);
  const breakEvenPctText = `${breakEvenPct.toFixed(1)}%`;
  const minR = facing + state.minRaiseIncrement;
  const maxR = stack + facing;
  const dealerPos = state.activeOrder.indexOf(state.dealerId);
  const myPos = state.activeOrder.indexOf(agentId);
  const seatsFromDealer = (myPos - dealerPos + state.activeOrder.length) % state.activeOrder.length;

  const context: ThinkingContext = {
    holeCards: [...hole],
    communityCards: [...comm],
    handStrength: {
      rankName,
      percentile,
    },
    equity,
    potOdds: {
      ratio,
      breakEvenPct: breakEvenPctText,
    },
    toCall: facing,
    potSize: state.pot,
    stackSize: stack,
    position: seatsFromDealer,
  };

  return {
    text: `Hand #${state.handNumber} | Phase: ${state.street}
Your cards: ${formatCards(hole)}
Community: ${comm.length ? formatCards(comm) : "(none)"}

Your stack: $${stack.toFixed(2)} USDC
Pot: $${state.pot.toFixed(2)} USDC
Hand strength: ${rankName} (${percentile.toFixed(0)}th percentile)
Equity: ${equity}% (vs. ${oppCount} active opponents)
To call: $${facing.toFixed(2)}
Min raise: $${minR.toFixed(2)} | Max raise: $${maxR.toFixed(2)}
Pot odds: ${ratio} (break-even equity: ${breakEvenPctText})
Position: seat ${seatsFromDealer} — ${seatsFromDealer} seat(s) from dealer
Actions this round: ${actionHistory.length ? actionHistory.join("; ") : "(none)"}

Your action?`,
    context,
  };
}

function stripMarkdownFence(s: string): string {
  let t = s.trim();
  if (!t.startsWith("```")) return t;
  const lines = t.split("\n");
  if (lines.length < 2) return t;
  const inner = lines.slice(1, -1).join("\n").trim();
  return inner || t;
}

function normalizeAction(raw: unknown): AgentDecision["action"] | null {
  if (typeof raw !== "string") return null;
  const a = raw.trim().toLowerCase();
  if (a === "fold" || a === "check" || a === "call" || a === "raise") return a;
  return null;
}

function coerceAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function coerceConfidence(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(100, Math.max(0, Math.round(raw)));
  }
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    if (!Number.isNaN(n) && Number.isFinite(n)) {
      return Math.min(100, Math.max(0, Math.round(n)));
    }
  }
  return null;
}

/** Try to salvage a decision when the model wraps JSON or truncates mid-string. */
function parseDecisionLoose(s: string): AgentDecision | null {
  const actionM = s.match(/"action"\s*:\s*"([^"]+)"/i);
  if (!actionM) return null;
  const action = normalizeAction(actionM[1]);
  if (!action) return null;
  const amtM = s.match(/"amount"\s*:\s*(null|[0-9]+\.?[0-9]*)/i);
  let amount: number | null = null;
  if (amtM && amtM[1].toLowerCase() !== "null") amount = Number(amtM[1]);
  const confidenceM = s.match(/"confidence"\s*:\s*(null|[0-9]+\.?[0-9]*)/i);
  const confidence =
    confidenceM && confidenceM[1].toLowerCase() !== "null"
      ? coerceConfidence(confidenceM[1])
      : null;
  let reasoning = "";
  const reasonM = s.match(/"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (reasonM) reasoning = reasonM[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
  else {
    const tail = s.match(/"reasoning"\s*:\s*"([^"]*)/i);
    if (tail) reasoning = tail[1] || "[truncated]";
  }
  return { action, amount, confidence, reasoning: reasoning || "(response parsed)" };
}

function parseJson(content: string): AgentDecision | null {
  const trimmed = stripMarkdownFence(content).trim();
  const candidates: string[] = [];
  candidates.push(trimmed);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const blob of candidates) {
    try {
      const o = JSON.parse(blob) as Record<string, unknown>;
      const action = normalizeAction(o.action);
      if (!action) continue;
      const amount = coerceAmount(o.amount);
      const confidence = coerceConfidence(o.confidence);
      const reasoning =
        typeof o.reasoning === "string" ? o.reasoning : String(o.reasoning ?? "");
      if (action === "raise" && amount !== null && amount <= 0) continue;
      return { action, amount, confidence, reasoning: reasoning || "(no reasoning)" };
    } catch {
      /* try next */
    }
  }
  return parseDecisionLoose(trimmed);
}

/** Enough room for JSON + reasoning; 200 often truncates mid-JSON. */
const MAX_COMPLETION_TOKENS = 768;
const TURBO_COMPLETION_TOKENS = 300;

function decisionFromLlmText(text: string): AgentDecision {
  const t = text.trim();
  if (!t) return { action: "fold", amount: null, confidence: null, reasoning: "[EMPTY RESPONSE → fold]" };
  return (
    parseJson(t) ?? {
      action: "fold",
      amount: null,
      confidence: null,
      reasoning: "[INVALID RESPONSE → fold]",
    }
  );
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const HEURISTIC_REASONING = [
  "Pot odds favor a call here, taking the mathematical edge.",
  "Strong equity position, applying pressure with a raise.",
  "Hand strength warrants aggression, pushing for value.",
  "Position advantage — representing strength with a raise.",
  "Odds look favorable, staying in to see the next card.",
  "Stack-to-pot ratio supports a continuation bet.",
  "Equity doesn't justify the call, folding to preserve stack.",
  "Weak holding against aggressive action, folding.",
  "Board texture favors my range, taking the lead.",
  "Marginal hand but good implied odds, calling.",
  "Checking back to control pot size with a medium hand.",
  "Risk-reward ratio is right, calling for value.",
];

/** Generates a structured, natural-looking decision from game state when LLM is unavailable (turbo). */
function heuristicFallback(context: ThinkingContext): AgentDecision {
  const { equity, toCall, potSize, stackSize, handStrength } = context;
  const breakEvenEquity = toCall > 0 ? (toCall / (potSize + toCall)) * 100 : 0;
  const reasoning = HEURISTIC_REASONING[Math.floor(Math.random() * HEURISTIC_REASONING.length)];

  // No bet to call — check or raise
  if (toCall === 0) {
    if (equity > 55 && stackSize > 0) {
      const raiseAmt = Math.min(Math.max(potSize * 0.5, 0.1), stackSize);
      return {
        action: "raise",
        amount: Math.round(raiseAmt * 100) / 100,
        confidence: Math.min(95, Math.round(equity)),
        reasoning,
      };
    }
    return { action: "check", amount: null, confidence: Math.round(equity * 0.8), reasoning };
  }

  // Facing a bet
  if (equity > breakEvenEquity + 15 && stackSize > toCall) {
    // Strong — raise
    const raiseAmt = Math.min(Math.max(toCall * 2, potSize * 0.6), stackSize);
    return {
      action: "raise",
      amount: Math.round(raiseAmt * 100) / 100,
      confidence: Math.min(95, Math.round(equity)),
      reasoning,
    };
  }
  if (equity > breakEvenEquity) {
    // +EV call
    return { action: "call", amount: null, confidence: Math.round(equity * 0.9), reasoning };
  }
  if (handStrength.percentile > 60 && toCall < stackSize * 0.15) {
    // Marginal but cheap
    return { action: "call", amount: null, confidence: Math.round(equity * 0.7), reasoning: "Marginal hand but good implied odds, calling." };
  }
  // Fold
  return { action: "fold", amount: null, confidence: Math.round((100 - equity) * 0.8), reasoning: "Equity doesn't justify the call, folding to preserve stack." };
}

const STOPPED: AgentDecision = { action: "fold", amount: null, confidence: null, reasoning: "[STOPPED]" };

const OPENROUTER_FALLBACK_MODELS: Record<AgentId, string[]> = {
  "gpt": ["anthropic/claude-haiku-4.5", "x-ai/grok-4.1-fast"],
  claude: ["openai/gpt-oss-120b", "x-ai/grok-4.1-fast"],
  gemini: ["anthropic/claude-haiku-4.5", "x-ai/grok-4.1-fast"],
  grok: ["openai/gpt-oss-120b", "anthropic/claude-haiku-4.5"],
  mistral: ["deepseek/deepseek-v3.2", "anthropic/claude-haiku-4.5"],
  deepseek: ["anthropic/claude-haiku-4.5", "x-ai/grok-4.1-fast", "openai/gpt-oss-120b"],
};

const MAX_REASONING_CHARS = 140;
const OPENROUTER_FALLBACK_TIMEOUT_FLOOR_MS = 20000;
const TURBO_FALLBACK_TIMEOUT_FLOOR_MS = 10000;

function openRouterDefaultHeaders(
  baseUrl: string,
): Record<string, string> | undefined {
  if (!baseUrl.includes("openrouter.ai")) return undefined;
  return {
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://neetpoker.com",
    "X-Title": process.env.OPENROUTER_APP_TITLE ?? "NeetPoker - AI Poker Tournament",
  };
}

function createChatClient(agent: AgentConfig): OpenAI {
  const baseUrl = resolveBaseUrl(agent);
  const apiKey = resolveApiKey(agent);
  const defaultHeaders = openRouterDefaultHeaders(baseUrl);
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
    defaultHeaders,
  });
}

function buildOpenRouterExtraBody(fallbackModels: string[]): Record<string, unknown> | undefined {
  return {
    models: fallbackModels,
    provider: {
      // Prefer faster endpoints for turn-based game UX; OpenRouter still handles failover.
      sort: "throughput",
      allow_fallbacks: true,
    },
    // Enable reasoning/thinking mode for Gemini 2.5 Flash; reduced in turbo
    max_tokens_for_reasoning: appConfig.turboMode ? 256 : 1024,
  };
}

function describeLlmError(err: unknown): string {
  const fallback = String(err);
  if (!err || typeof err !== "object") return fallback;
  const e = err as {
    message?: unknown;
    status?: unknown;
    code?: unknown;
    error?: { message?: unknown } | unknown;
  };
  const status = typeof e.status === "number" ? `HTTP ${e.status}` : "";
  const code = typeof e.code === "string" ? e.code : "";
  const inner =
    e.error && typeof e.error === "object" && "message" in e.error
      ? String((e.error as { message?: unknown }).message ?? "")
      : "";
  const message =
    typeof e.message === "string" ? e.message : typeof inner === "string" ? inner : fallback;
  return [status, code, message].filter(Boolean).join(" | ");
}

function clampReasoning(reasoning: string): string {
  const compact = reasoning.replace(/\s+/g, " ").trim();
  if (!compact) return "(no reasoning)";
  if (compact.length <= MAX_REASONING_CHARS) return compact;
  return `${compact.slice(0, MAX_REASONING_CHARS - 1)}…`;
}

function sanitizeDecision(decision: AgentDecision): AgentDecision {
  return {
    ...decision,
    reasoning: clampReasoning(decision.reasoning),
  };
}

export async function getAgentAction(
  agentId: AgentId,
  state: PokerEngineState,
  actionHistory: string[],
  signal?: AbortSignal,
): Promise<{ decision: AgentDecision; context: ThinkingContext }> {
  const { text: user, context } = buildUserMessage(agentId, state, actionHistory);
  const agent = getAgentConfig(agentId);
  const model = resolveModel(agent);
  const baseUrl = resolveBaseUrl(agent);
  const fallbackModels = baseUrl.includes("openrouter.ai")
    ? OPENROUTER_FALLBACK_MODELS[agentId].filter((m) => m !== model)
    : [];
  const turbo = appConfig.turboMode;
  const fallbackFloor = turbo ? TURBO_FALLBACK_TIMEOUT_FLOOR_MS : OPENROUTER_FALLBACK_TIMEOUT_FLOOR_MS;
  const timeoutFloor = agentId === "deepseek" || fallbackModels.length > 0
    ? fallbackFloor
    : appConfig.llmTimeoutMs;
  const timeoutMs = Math.max(appConfig.llmTimeoutMs, timeoutFloor);
  const fallbackDecision: AgentDecision = turbo
    ? heuristicFallback(context)
    : {
        action: "fold",
        amount: null,
        confidence: null,
        reasoning: "[TIMEOUT → fold]",
      };
  const fallback = { decision: sanitizeDecision(fallbackDecision), context };

  const run = async (): Promise<{ decision: AgentDecision; context: ThinkingContext }> => {
    if (signal?.aborted) return { decision: STOPPED, context };
    if (process.env.DEBUG_LLM_AUTH === "1") {
      const apiKey = resolveApiKey(agent);
      const raw = process.env[agent.apiKeyEnv];
      console.log(`[AUTH DEBUG] ${agent.displayName}:`);
      console.log(
        `   authConfigured: ${apiKey.length > 0}  keyLength: ${apiKey.length}  openrouter defaultHeaders: ${baseUrl.includes("openrouter.ai")}`,
      );
      console.log(`   baseUrl: "${baseUrl}"`);
      console.log(`   model: "${model}"`);
      console.log(
        `   ${agent.apiKeyEnv} envPresent: ${raw != null && String(raw).trim().length > 0}`,
      );
    }
    const client = createChatClient(agent);
    try {
      const extraBody = buildOpenRouterExtraBody(fallbackModels);
      const maxTokens = turbo ? TURBO_COMPLETION_TOKENS : MAX_COMPLETION_TOKENS;
      const res = await client.chat.completions.create(
        ({
          model,
          temperature: turbo ? 0.5 : 0.7,
          max_tokens: maxTokens,
          ...(extraBody ? { extra_body: extraBody } : {}),
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: user },
          ],
        } as any),
        { signal },
      );
      const text = res.choices[0]?.message?.content ?? "";
      return { decision: sanitizeDecision(decisionFromLlmText(text)), context };
    } catch (err) {
      const details = describeLlmError(err);
      throw new Error(
        `${agent.displayName} (${model}) request failed: ${details}`.slice(0, 360),
      );
    }
  };

  const abortRace = signal
    ? new Promise<{ decision: AgentDecision; context: ThinkingContext }>((resolve) => {
        if (signal.aborted) resolve({ decision: STOPPED, context });
        else
          signal.addEventListener("abort", () => resolve({ decision: STOPPED, context }), {
            once: true,
          });
      })
    : null;

  return Promise.race([withTimeout(run(), timeoutMs, fallback), ...(abortRace ? [abortRace] : [])]);
}
