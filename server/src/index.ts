import { createServer } from "node:http";
import { lookup } from "node:dns/promises";
import { timingSafeEqual } from "node:crypto";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { WebSocketServer, WebSocket } from "ws";
import {
  paymentMiddlewareFromHTTPServer,
  x402ResourceServer,
  x402HTTPResourceServer,
} from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { Network } from "@x402/core/types";
import type { HTTPRequestContext } from "@x402/core/server";
import { AGENTS, appConfig, defaultDelays, resolveBaseUrl, resolveModel } from "./config.js";
import { initX402Clients, isPaymentBypassMode, setPaymentBypassMode } from "./x402-setup.js";
import { getPotAddress } from "./wallet-manager.js";
import { addFeedbackEntry, listFeedbackEntries } from "./feedback-store.js";
import {
  applyGameAction,
  previewGameAction,
  serializeState,
  validateGameActionPolicy,
  type GameActionBody,
} from "./game-actions.js";
import { broadcast, setBroadcaster, engine, resetTournament } from "./game-state.js";
import { isRunning, startLoop, stopLoop, stopLoopAndWait } from "./game-loop.js";

const network = appConfig.network as Network;
const payTo = getPotAddress();
const ORIGINAL_ACTION_DELAY = defaultDelays.actionDelayMs;
const ORIGINAL_HAND_DELAY = defaultDelays.handDelayMs;
const ORIGINAL_LLM_TIMEOUT = appConfig.llmTimeoutMs;
const MAX_FEEDBACK_LENGTH = 1000;
const MAX_USDC_ACTION_AMOUNT = 1_000_000;

const AGENT_ID_SET = new Set(AGENTS.map((agent) => agent.id));
const ACTION_SET = new Set(["blind", "fold", "check", "call", "raise"] as const);

const routes = {
  "POST /game/action": {
    accepts: {
      scheme: "exact",
      price: async (ctx: HTTPRequestContext) => {
        const body = validateGameActionBody(ctx.adapter.getBody?.());
        if (!body) return "$0.000000";
        const policyError = validateGameActionPolicy(body, { allowBlind: false, enforceTurn: true });
        if (policyError) return "$0.000000";
        const preview = previewGameAction(body, { allowBlind: false, enforceTurn: true });
        const a = Number.isFinite(preview?.amount) ? preview?.amount ?? 0 : 0;
        return `$${a.toFixed(6)}` as `${string}`;
      },
      payTo,
      network,
    },
    description: "THE $10 TABLE — poker action (USDC to pot)",
  },
};

const facilitator = new HTTPFacilitatorClient({
  url: appConfig.x402FacilitatorUrl,
});

const resourceServer = new x402ResourceServer(facilitator).register(
  network,
  new ExactEvmScheme(),
);

const httpServer = new x402HTTPResourceServer(resourceServer, routes);

httpServer.onProtectedRequest(async (ctx) => {
  const body = validateGameActionBody(ctx.adapter.getBody?.());
  if (!body) return { grantAccess: true };
  const policyError = validateGameActionPolicy(body, { allowBlind: false, enforceTurn: true });
  if (policyError) return { grantAccess: true };
  const preview = previewGameAction(body, { allowBlind: false, enforceTurn: true });
  if (!preview || preview.amount === 0) return { grantAccess: true };
  return;
});

function extractAdminTokenFromRequest(req: express.Request): string {
  const bearer = req.headers.authorization;
  if (typeof bearer === "string" && bearer.startsWith("Bearer ")) {
    return bearer.slice("Bearer ".length).trim();
  }
  const rawHeader = req.headers["x-admin-token"];
  if (typeof rawHeader === "string") return rawHeader.trim();
  if (Array.isArray(rawHeader)) return (rawHeader[0] ?? "").trim();
  return "";
}

function secureTokenEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function getGameAdminToken(): string {
  return appConfig.gameAdminToken.trim() || appConfig.feedbackAdminToken.trim();
}

function isOriginAllowed(origin: string): boolean {
  return appConfig.corsAllowedOrigins.includes(origin);
}

function normalizeOptionalAmount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_USDC_ACTION_AMOUNT) return undefined;
  return Math.round(n * 1_000_000) / 1_000_000;
}

function normalizeFeedbackText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[\r\n\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FEEDBACK_LENGTH);
  return normalized || null;
}

function validateGameActionBody(input: unknown): GameActionBody | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  const rawAgentId = body.agentId;
  const rawAction = body.action;

  if (typeof rawAgentId !== "string" || !AGENT_ID_SET.has(rawAgentId as (typeof AGENTS)[number]["id"])) {
    return null;
  }
  if (typeof rawAction !== "string" || !ACTION_SET.has(rawAction as GameActionBody["action"])) {
    return null;
  }

  const amount = normalizeOptionalAmount(body.amount);
  const raiseIncrement = normalizeOptionalAmount(body.raiseIncrement);

  if (body.amount !== undefined && amount === undefined) return null;
  if (body.raiseIncrement !== undefined && raiseIncrement === undefined) return null;

  if (rawAction === "raise" && amount === undefined && raiseIncrement === undefined) {
    return null;
  }

  return {
    agentId: rawAgentId as GameActionBody["agentId"],
    action: rawAction as GameActionBody["action"],
    amount,
    raiseIncrement,
  };
}

function isStrongAdminToken(token: string): boolean {
  if (token.length < 24) return false;
  if (/change-?me|example|test|default|token/i.test(token)) return false;
  return true;
}

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function ensureStrongTokenOrFail(name: string, value: string): void {
  if (!value) {
    throw new Error(`${name} is required for game-control endpoints`);
  }
  if (!isStrongAdminToken(value)) {
    throw new Error(`${name} is weak; use at least 24 random characters`);
  }
}

async function main(): Promise<void> {
  const gameAdminToken = getGameAdminToken();
  ensureStrongTokenOrFail("GAME_ADMIN_TOKEN (or FEEDBACK_ADMIN_TOKEN fallback)", gameAdminToken);

  let x402Ready = false;

  // Always init on-chain signing clients when not in mock mode.
  // x402 HTTP middleware (facilitator) is only needed for the manual action API.
  if (!appConfig.mockPayments) {
    try {
      initX402Clients();
      setPaymentBypassMode(false);
      console.log("On-chain USDC payment clients initialized.");
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(`On-chain client init failed (${reason}); payments will use mock/bypass mode.`);
      if (!appConfig.allowPaymentBypass) {
        throw new Error(
          `On-chain client init failed (${reason}). Set ALLOW_PAYMENT_BYPASS=1 for local mock fallback.`,
        );
      }
      setPaymentBypassMode(true);
    }
  }

  // x402 facilitator init is only needed for the manual action API HTTP middleware.
  if (!appConfig.mockPayments && appConfig.enableManualActionApi) {
    try {
      const host = new URL(appConfig.x402FacilitatorUrl).hostname;
      await lookup(host);
      await httpServer.initialize();
      x402Ready = true;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(`x402 facilitator init failed (${reason}); manual action API will be unavailable.`);
    }
  }

  // Global fallback limiter for all general traffic
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS" || req.path === "/game/status",
  });
  // Strict limiter for auth brute-force protection (e.g., /admin/feedback token guessing)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
  });
  // Generous limiter for game control endpoints (already protected by requireGameAdmin token)
  const gameControlLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const app = express();
  app.use(helmet());

  // CORS MUST run before any rate limiters so preflights don't fail cross-origin
  app.use((req, res, next) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    if (origin && !isOriginAllowed(origin)) {
      res.status(403).json({ ok: false, error: "origin not allowed" });
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Payment, X-Admin-Token");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(globalLimiter);

  app.use(express.json({ limit: "64kb" }));
  if (x402Ready && appConfig.enableManualActionApi) {
    app.use(paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false));
  } else {
    app.use((_req, _res, next) => next());
  }

  const requireGameAdmin: express.RequestHandler = (req, res, next) => {
    const providedToken = extractAdminTokenFromRequest(req);
    if (!providedToken || !secureTokenEqual(providedToken, gameAdminToken)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    next();
  };
  const paymentRuntimeValid =
    !appConfig.enableManualActionApi || appConfig.mockPayments || x402Ready || isPaymentBypassMode();

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/game/status", (_req, res) => {
    res.json({ running: isRunning() });
  });

  app.post("/game/stop", gameControlLimiter, (_req, res) => {
    stopLoop();
    res.json({ ok: true, stopping: true });
  });

  app.post("/game/speed", gameControlLimiter, (req, res) => {
    const mode = req.body?.mode;
    if (mode !== "turbo" && mode !== "normal") {
      res.status(400).json({
        ok: false,
        error: 'mode must be "turbo" or "normal"',
      });
      return;
    }

    if (mode === "turbo") {
      appConfig.actionDelayMs = 0;
      appConfig.handDelayMs = 200;
      appConfig.llmTimeoutMs = 8000;
      appConfig.turboMode = true;
    } else {
      appConfig.actionDelayMs = ORIGINAL_ACTION_DELAY;
      appConfig.handDelayMs = ORIGINAL_HAND_DELAY;
      appConfig.llmTimeoutMs = ORIGINAL_LLM_TIMEOUT;
      appConfig.turboMode = false;
    }

    res.json({
      ok: true,
      actionDelayMs: appConfig.actionDelayMs,
      handDelayMs: appConfig.handDelayMs,
      llmTimeoutMs: appConfig.llmTimeoutMs,
      turboMode: appConfig.turboMode,
    });
  });

  // Game settings (safe, non-security parameters)
  app.get("/game/settings", (_req, res) => {
    res.json({
      startingStack: appConfig.startingStack,
      smallBlind: appConfig.smallBlind,
      bigBlind: appConfig.bigBlind,
      handDelayMs: appConfig.handDelayMs,
      actionDelayMs: appConfig.actionDelayMs,
      llmTimeoutMs: appConfig.llmTimeoutMs,
      monteCarloSims: appConfig.monteCarloSims,
    });
  });

  app.post("/game/settings", gameControlLimiter, (req, res) => {
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ ok: false, error: "body must be a JSON object" });
      return;
    }

    const safeKeys: Record<string, { min: number; max: number; integer?: boolean }> = {
      startingStack: { min: 1, max: 1000 },
      smallBlind: { min: 0.01, max: 50 },
      bigBlind: { min: 0.01, max: 100 },
      handDelayMs: { min: 0, max: 30000, integer: true },
      actionDelayMs: { min: 0, max: 30000, integer: true },
      llmTimeoutMs: { min: 1000, max: 60000, integer: true },
      monteCarloSims: { min: 50, max: 5000, integer: true },
    };

    for (const key of Object.keys(body)) {
      if (!safeKeys[key]) {
        res.status(400).json({ ok: false, error: `unknown setting key: ${key}` });
        return;
      }
    }

    for (const [key, value] of Object.entries(body)) {
      const constraint = safeKeys[key];
      const n = Number(value);
      if (!Number.isFinite(n)) {
        res.status(400).json({ ok: false, error: `${key} must be a number` });
        return;
      }
      const clamped = Math.max(constraint.min, Math.min(constraint.max, n));
      const final = constraint.integer ? Math.round(clamped) : Math.round(clamped * 100) / 100;
      (appConfig as Record<string, unknown>)[key] = final;
    }

    res.json({
      ok: true,
      startingStack: appConfig.startingStack,
      smallBlind: appConfig.smallBlind,
      bigBlind: appConfig.bigBlind,
      handDelayMs: appConfig.handDelayMs,
      actionDelayMs: appConfig.actionDelayMs,
      llmTimeoutMs: appConfig.llmTimeoutMs,
      monteCarloSims: appConfig.monteCarloSims,
    });
  });

  app.post("/feedback", async (req, res) => {
    const normalized = normalizeFeedbackText(req.body?.text);
    if (!normalized) {
      res.status(400).json({ ok: false, error: "text is required" });
      return;
    }
    try {
      const entry = await addFeedbackEntry(normalized);
      res.json({ ok: true, id: entry.id, createdAt: entry.createdAt });
    } catch {
      res.status(500).json({ ok: false, error: "could not save feedback" });
    }
  });

  app.get("/admin/feedback", authLimiter, async (req, res) => {
    const configuredToken = getGameAdminToken();
    const providedToken = extractAdminTokenFromRequest(req);
    if (!providedToken || !secureTokenEqual(providedToken, configuredToken)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    const limit = parsePositiveInt(req.query.limit, 100, 1, 500);
    if (limit === null) {
      res.status(400).json({ ok: false, error: "limit must be a finite number" });
      return;
    }
    try {
      const items = await listFeedbackEntries(limit);
      res.json({ ok: true, items });
    } catch {
      res.status(500).json({ ok: false, error: "could not load feedback inbox" });
    }
  });

  app.post("/game/action", gameControlLimiter, (req, res) => {
    if (!appConfig.enableManualActionApi) {
      res.status(403).json({ ok: false, error: "manual action API is disabled" });
      return;
    }
    if (!paymentRuntimeValid) {
      res.status(503).json({ ok: false, error: "payment runtime is not ready" });
      return;
    }
    const body = validateGameActionBody(req.body);
    if (!body) {
      res.status(400).json({
        ok: false,
        error:
          "invalid body: expected { agentId, action, amount?, raiseIncrement? } with finite non-negative numeric amounts",
      });
      return;
    }
    const policyError = validateGameActionPolicy(body, {
      allowBlind: false,
      enforceTurn: true,
    });
    if (policyError) {
      res.status(400).json({ ok: false, error: policyError });
      return;
    }

    try {
      const result = applyGameAction(body, {
        allowBlind: false,
        enforceTurn: true,
      });
      if (!result) {
        res.status(400).json({
          ok: false,
          error: "action could not be applied",
        });
        return;
      }
      res.json({
        ok: true,
        gameState: result.gameState ?? serializeState(engine.state),
        executedAction: result.action,
        executedAmount: result.amount,
        executedRaiseIncrement: result.raiseIncrement,
      });
    } catch (e) {
      res.status(400).json({
        ok: false,
        error: e instanceof Error ? e.message : "bad request",
      });
    }
  });

  app.post("/game/start", gameControlLimiter, async (_req, res) => {
    await stopLoopAndWait();
    resetTournament();
    broadcast({ type: "tournament_reset" });
    const started = await startLoop();
    res.json({ ok: true, started: started.started });
  });

  app.post("/game/reset", gameControlLimiter, async (_req, res) => {
    await stopLoopAndWait();
    resetTournament();
    broadcast({ type: "tournament_reset" });
    res.json({ ok: true });
  });

  const server = createServer(app);

  const wss = new WebSocketServer({ server, path: "/ws" });
  setBroadcaster((payload) => {
    wss.clients.forEach((c) => {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    });
  });

  server.listen(appConfig.port, "0.0.0.0", () => {
    console.log("🃏 NeetPoker — AI Poker Tournament");
    console.log("─".repeat(50));
    for (const agent of AGENTS) {
      const baseUrl = resolveBaseUrl(agent);
      const model = resolveModel(agent);
      const via = baseUrl.includes("openrouter.ai") ? "OpenRouter" : "Direct";
      console.log(`  ${agent.displayName.padEnd(10)} ${model.padEnd(45)} [${via}]`);
    }
    console.log("─".repeat(50));
    console.log(`NeetPoker API http://localhost:${appConfig.port}`);
    console.log(`WebSocket ws://localhost:${appConfig.port}/ws`);
    console.log(`Manual action API: ${appConfig.enableManualActionApi ? "enabled" : "disabled"}`);
    console.log(`CORS allowlist: ${appConfig.corsAllowedOrigins.join(", ")}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
