import { appConfig } from "./config.js";
import type { AgentId } from "./config.js";
import { createRequire } from "node:module";
import { getAgentAction, type AgentDecision, type ThinkingContext } from "./llm-agent.js";
import {
  monteCarloEquity,
  evaluateHandStrength,
  potOddsRatio,
} from "./hand-eval.js";
import { engine, broadcast, addTransacted, getTotalTransacted } from "./game-state.js";
import { displayName } from "./wallet-manager.js";
import { agentPayToPot, buildTransactionInfo, potPayToWinner } from "./x402-setup.js";
import { applyGameAction, previewGameAction, serializeState, type GameActionBody } from "./game-actions.js";
import type { HandResultPayload, TransactionInfo } from "./types.js";
import type { PokerEngineState } from "./poker-engine.js";

const require = createRequire(import.meta.url);
const { Hand } = require("pokersolver");

let running = false;
let shouldStop = false;
let runAbort: AbortController | null = null;
let loopPromise: Promise<void> | null = null;


export function isRunning(): boolean {
  return running;
}

export function stopLoop(): void {
  shouldStop = true;
  runAbort?.abort();
}

export async function stopLoopAndWait(): Promise<void> {
  stopLoop();
  if (loopPromise) {
    await loopPromise;
  }
}

export async function startLoop(): Promise<{ ok: true; started: boolean }> {
  if (loopPromise || running) {
    return { ok: true, started: false };
  }
  loopPromise = runTournamentLoop()
    .catch((err) => {
      const message = compactError(err);
      console.error("Tournament loop crashed:", err);
      broadcast({
        type: "error",
        message: `loop crashed: ${message}`,
      });
    })
    .finally(() => {
      loopPromise = null;
    });
  return { ok: true, started: true };
}

function broadcastTransaction(txInfo: TransactionInfo): void {
  broadcast({
    type: "transaction",
    ...txInfo,
    totalTransacted: getTotalTransacted(),
  });
}

function applyOrThrow(body: GameActionBody, options?: { allowBlind?: boolean; enforceTurn?: boolean }) {
  const applied = applyGameAction(body, options);
  if (!applied) {
    throw new Error(`Could not apply ${body.action} for ${body.agentId}`);
  }
  return applied;
}

function compactError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, " ").slice(0, 160);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// Per-agent failure tracking to log warnings without poisoning other agents.
const agentPaymentFailures = new Map<string, number>();
const PAYMENT_FAILURE_WARN_THRESHOLD = 2;

async function payAgentToPotResilient(params: {
  agentId: AgentId;
  amount: number;
  handNumber: number;
  action: "blind" | "call" | "raise";
}): Promise<TransactionInfo> {
  const attempts = appConfig.paymentRetryCount + 1;
  const pauseMs = Math.min(500, Math.max(50, Math.floor(appConfig.paymentRetryTimeoutMs / 4)));
  const failedFallback = () =>
    buildTransactionInfo({
      from: params.agentId,
      to: "pot",
      amount: params.amount,
      status: "failed",
      action: params.action,
      handNumber: params.handNumber,
    });

  for (let i = 0; i < attempts; i++) {
    try {
      const tx = await withTimeout(
        agentPayToPot(params.agentId, params.amount, params.handNumber, params.action),
        appConfig.paymentRetryTimeoutMs,
        `${params.agentId} ${params.action} payment`,
      );
      if (tx.status !== "failed") {
        // Reset failure counter on success
        agentPaymentFailures.delete(params.agentId);
        return tx;
      }
    } catch {
      /* retry */
    }
    if (i < attempts - 1) await sleep(pauseMs);
  }

  // Track per-agent failures and warn, but do NOT degrade all agents to mock.
  const count = (agentPaymentFailures.get(params.agentId) ?? 0) + 1;
  agentPaymentFailures.set(params.agentId, count);
  const reason = `${params.agentId} ${params.action} payment failed after ${attempts} attempt${attempts === 1 ? "" : "s"} (failure #${count})`;
  console.warn(reason);
  if (count >= PAYMENT_FAILURE_WARN_THRESHOLD) {
    console.warn(`${params.agentId} has ${count} consecutive payment failures — wallet may be out of USDC or gas.`);
  }

  return failedFallback();
}

async function payPotToWinnerResilient(params: {
  winnerId: AgentId;
  amount: number;
  handNumber: number;
}): Promise<TransactionInfo> {
  const attempts = appConfig.paymentRetryCount + 1;
  const pauseMs = Math.min(500, Math.max(50, Math.floor(appConfig.paymentRetryTimeoutMs / 4)));
  const failedFallback = () =>
    buildTransactionInfo({
      from: "pot",
      to: params.winnerId,
      amount: params.amount,
      status: "failed",
      action: "win",
      handNumber: params.handNumber,
    });

  for (let i = 0; i < attempts; i++) {
    try {
      const tx = await withTimeout(
        potPayToWinner(params.winnerId, params.amount, params.handNumber),
        appConfig.paymentRetryTimeoutMs,
        `pot payout to ${params.winnerId}`,
      );
      if (tx.status !== "failed") return tx;
    } catch {
      /* retry */
    }
    if (i < attempts - 1) await sleep(pauseMs);
  }

  console.warn(`pot payout to ${params.winnerId} failed after ${attempts} attempts`);
  return failedFallback();
}

const TURBO_HEURISTIC_REASONS = [
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

function turboHeuristicDecision(
  equity: number,
  toCall: number,
  potSize: number,
  stackSize: number,
  percentile: number,
): AgentDecision {
  const breakEvenEquity = toCall > 0 ? (toCall / (potSize + toCall)) * 100 : 0;
  const pick = TURBO_HEURISTIC_REASONS[Math.floor(Math.random() * TURBO_HEURISTIC_REASONS.length)];

  if (toCall === 0) {
    if (equity > 55 && stackSize > 0) {
      const raiseAmt = Math.min(Math.max(potSize * 0.5, 0.1), stackSize);
      return { action: "raise", amount: Math.round(raiseAmt * 100) / 100, confidence: Math.min(95, Math.round(equity)), reasoning: pick };
    }
    return { action: "check", amount: null, confidence: Math.round(equity * 0.8), reasoning: pick };
  }
  if (equity > breakEvenEquity + 15 && stackSize > toCall) {
    const raiseAmt = Math.min(Math.max(toCall * 2, potSize * 0.6), stackSize);
    return { action: "raise", amount: Math.round(raiseAmt * 100) / 100, confidence: Math.min(95, Math.round(equity)), reasoning: pick };
  }
  if (equity > breakEvenEquity) {
    return { action: "call", amount: null, confidence: Math.round(equity * 0.9), reasoning: pick };
  }
  if (percentile > 60 && toCall < stackSize * 0.15) {
    return { action: "call", amount: null, confidence: Math.round(equity * 0.7), reasoning: "Marginal hand but good implied odds, calling." };
  }
  return { action: "fold", amount: null, confidence: Math.round((100 - equity) * 0.8), reasoning: "Equity doesn't justify the call, folding to preserve stack." };
}

/** Mirrors PokerEngine private roundComplete() for debug logging only. */
function dbgRoundComplete(s: PokerEngineState): boolean {
  const alive = s.activeOrder.filter((id) => !s.players[id].folded);
  if (alive.length <= 1) return true;
  return alive.every((id) => {
    const c = s.roundContribution[id] ?? 0;
    const acted = s.hasActed[id] ?? false;
    return (acted && c >= s.currentBet) || s.players[id].allIn;
  });
}

const DEBUG_INGEST_URL = process.env.DEBUG_INGEST_URL?.trim();
const DEBUG_SESSION_ID = process.env.DEBUG_SESSION_ID?.trim() || "local";

// #region agent log
function agentDbgLog(payload: {
  hypothesisId: string;
  message: string;
  data: Record<string, unknown>;
  location: string;
}): void {
  if (!DEBUG_INGEST_URL) return;
  fetch(DEBUG_INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION_ID,
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      location: payload.location,
      message: payload.message,
      hypothesisId: payload.hypothesisId,
      data: payload.data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

function winningHandDescription(winnerId: AgentId): string {
  const state = engine.state;
  if (!state) return "Winning hand";
  const solved = Hand.solve([
    ...state.players[winnerId].holeCards,
    ...state.communityCards,
  ]);
  return solved.descr || solved.name || "Winning hand";
}

export async function runTournamentLoop(): Promise<void> {
  if (running) return;
  running = true;
  shouldStop = false;
  runAbort = new AbortController();
  const ABSOLUTE_MAX_DURATION_MS = 30 * 60 * 1000;
  const loopStartTime = Date.now();

  try {
    // Notify frontend that we're using real payments.
    if (!appConfig.mockPayments) {
      broadcast({
        type: "payment_mode_changed",
        mode: "real",
        reason: "Tournament using real on-chain payments",
      });
    }
    // #region agent log
    agentDbgLog({
      hypothesisId: "H3",
      location: "game-loop.ts:runTournamentLoop:entry",
      message: "loop started",
      data: { shouldStop, running: true },
    });
    // #endregion
    while (!shouldStop) {
      if (Date.now() - loopStartTime > ABSOLUTE_MAX_DURATION_MS) {
        console.log("⚠️ Absolute max game duration (30min) reached — stopping to protect credits.");
        break;
      }

      const winner = engine.tournamentWinner();
      if (winner) {
        broadcast({
          type: "tournament_end",
          winner,
          stacks: { ...engine.stacks },
        });
        break;
      }

      const started = engine.startHand();
      if (!started) break;

      const { state, smallBlind, bigBlind } = started;
      const { smallBlindId, bigBlindId } = state;

      const sbBody: GameActionBody = {
        agentId: smallBlindId,
        action: "blind",
        amount: smallBlind,
      };
      const sbPreview = previewGameAction(sbBody, { allowBlind: true });
      if (!sbPreview) {
        throw new Error(`Could not preview blind for ${smallBlindId}`);
      }
      if (sbPreview.amount > 0) {
        const sbTx = await payAgentToPotResilient({
          agentId: smallBlindId,
          amount: sbPreview.amount,
          handNumber: state.handNumber,
          action: "blind",
        });
        broadcastTransaction(sbTx);
        if (sbTx.status === "failed") {
          broadcast({
            type: "error",
            message: `${smallBlindId}: blind payment failed after retries`,
          });
        } else {
          addTransacted(sbPreview.amount);
        }
      }
      applyOrThrow(sbBody, { allowBlind: true });

      const bbBody: GameActionBody = {
        agentId: bigBlindId,
        action: "blind",
        amount: bigBlind,
      };
      const bbPreview = previewGameAction(bbBody, { allowBlind: true });
      if (!bbPreview) {
        throw new Error(`Could not preview blind for ${bigBlindId}`);
      }
      if (bbPreview.amount > 0) {
        const bbTx = await payAgentToPotResilient({
          agentId: bigBlindId,
          amount: bbPreview.amount,
          handNumber: state.handNumber,
          action: "blind",
        });
        broadcastTransaction(bbTx);
        if (bbTx.status === "failed") {
          broadcast({
            type: "error",
            message: `${bigBlindId}: blind payment failed after retries`,
          });
        } else {
          addTransacted(bbPreview.amount);
        }
      }
      applyOrThrow(bbBody, { allowBlind: true });

      if (shouldStop) break;

      broadcast({
        type: "hand_start",
        gameState: serializeState(engine.state),
      });

      const history: string[] = [];

      while (engine.state && !engine.state.handComplete && !shouldStop) {
        const st = engine.state;
        let actor = engine.currentActor();
        // #region agent log
        agentDbgLog({
          hypothesisId: "H1",
          location: "game-loop.ts:betting:currentActor1",
          message: "first currentActor",
          data: {
            actor,
            actingIndex: st.actingIndex,
            street: st.street,
            currentBet: st.currentBet,
            handNumber: st.handNumber,
            dbgRoundComplete: dbgRoundComplete(st),
            activeOrder: st.activeOrder,
            contributions: { ...st.roundContribution },
            allIn: Object.fromEntries(
              st.activeOrder.map((id) => [id, st.players[id]?.allIn ?? false]),
            ),
          },
        });
        // #endregion
        if (!actor) {
          engine.advanceIfRoundComplete();
          actor = engine.currentActor();
          // #region agent log
          agentDbgLog({
            hypothesisId: "H2",
            location: "game-loop.ts:betting:afterAdvance",
            message: "after advanceIfRoundComplete",
            data: {
              actorAfter: actor,
              actingIndex: engine.state?.actingIndex,
              street: engine.state?.street,
              dbgRoundComplete: engine.state ? dbgRoundComplete(engine.state) : null,
            },
          });
          // #endregion
        }
        if (!actor) {
          // #region agent log
          agentDbgLog({
            hypothesisId: "H1",
            location: "game-loop.ts:betting:noActorBreak",
            message: "breaking inner while: no actor",
            data: { handNumber: st.handNumber },
          });
          // #endregion
          break;
        }

        if (shouldStop) break;

        let agentResponse: Awaited<ReturnType<typeof getAgentAction>>;
        try {
          agentResponse = await getAgentAction(actor, st, history, runAbort.signal);
        } catch (err) {
          const errMessage = compactError(err);
          // #region agent log
          agentDbgLog({
            hypothesisId: "H3",
            location: "game-loop.ts:betting:getAgentActionCatch",
            message: "getAgentAction threw",
            data: {
              actor,
              err: errMessage,
              stack: err instanceof Error ? err.stack : undefined,
            },
          });
          // #endregion

          // In turbo mode, silently generate a heuristic decision instead of broadcasting errors
          if (appConfig.turboMode) {
            const hole = st.players[actor].holeCards;
            const comm = st.communityCards;
            const { rankName, percentile } = evaluateHandStrength(hole, comm);
            const alive = st.activeOrder.filter((id) => !st.players[id].folded);
            const oppCount = Math.max(0, alive.length - 1);
            const equity = monteCarloEquity(hole, comm, oppCount);
            const cur = st.roundContribution[actor] ?? 0;
            const facing = Math.max(0, st.currentBet - cur);
            const { ratio, breakEvenPct } = potOddsRatio(st.pot, facing);
            agentResponse = {
              decision: turboHeuristicDecision(equity, facing, st.pot, st.players[actor].stack, percentile),
              context: {
                holeCards: [...hole],
                communityCards: [...comm],
                handStrength: { rankName, percentile },
                equity,
                potOdds: { ratio, breakEvenPct: `${breakEvenPct.toFixed(1)}%` },
                toCall: facing,
                potSize: st.pot,
                stackSize: st.players[actor].stack,
                position: st.activeOrder.indexOf(actor),
              },
            };
          } else {
            broadcast({
              type: "error",
              message: `${actor}: ${errMessage}`,
            });
            agentResponse = {
              decision: {
                action: "fold",
                amount: null,
                confidence: null,
                reasoning: `[LLM ERROR: ${errMessage} → fold]`,
              },
              context: {
                holeCards: [...st.players[actor].holeCards],
                communityCards: [...st.communityCards],
                handStrength: { rankName: "Unknown", percentile: 0 },
                equity: 0,
                potOdds: { ratio: "0:1", breakEvenPct: "0%" },
                toCall: 0,
                potSize: st.pot,
                stackSize: st.players[actor].stack,
                position: st.activeOrder.indexOf(actor),
              },
            };
          }
        }

        const { decision, context } = agentResponse;

        if (shouldStop || decision.reasoning === "[STOPPED]") {
          // #region agent log
          agentDbgLog({
            hypothesisId: "H4",
            location: "game-loop.ts:betting:stoppedDecision",
            message: "stop or STOPPED reasoning",
            data: { shouldStop, reasoning: decision.reasoning },
          });
          // #endregion
          break;
        }

        broadcast({
          type: "thinking",
          agentId: actor,
          reasoning: decision.reasoning,
          decision: {
            action: decision.action,
            amount: decision.amount,
            confidence: decision.confidence,
            reasoning: decision.reasoning,
          },
          context: {
            holeCards: context.holeCards,
            communityCards: context.communityCards,
            handStrength: context.handStrength,
            equity: context.equity,
            potOdds: context.potOdds,
            toCall: context.toCall,
            potSize: context.potSize,
            stackSize: context.stackSize,
            position: context.position,
          },
        });

        const requestedAction: GameActionBody = {
          agentId: actor,
          action: decision.action,
          amount: decision.amount ?? 0,
          raiseIncrement: decision.amount ?? undefined,
        };
        const preview = previewGameAction(requestedAction, { enforceTurn: true });
        if (!preview) {
          throw new Error(`Could not preview action for ${actor}`);
        }

        let actionTxInfo: TransactionInfo | undefined;
        if (
          (preview.action === "blind" || preview.action === "call" || preview.action === "raise") &&
          preview.amount > 0
        ) {
          const paidAction: "blind" | "call" | "raise" =
            preview.action === "raise" ? "raise" : preview.action === "call" ? "call" : "blind";
          actionTxInfo = await payAgentToPotResilient({
            agentId: actor,
            amount: preview.amount,
            handNumber: st.handNumber,
            action: paidAction,
          });
          broadcastTransaction(actionTxInfo);
          if (actionTxInfo.status === "failed") {
            const folded = applyOrThrow({
              agentId: actor,
              action: "fold",
            }, { enforceTurn: true });
            history.push(`${actor}: fold (payment failed)`);
            broadcast({
              type: "action",
              agentId: actor,
              action: folded.action,
              amount: folded.amount,
              confidence: decision.confidence,
              reasoning: `${decision.reasoning} [PAYMENT FAILED → fold]`,
              gameState: folded.gameState ?? serializeState(engine.state),
              totalTransacted: getTotalTransacted(),
              txHash: actionTxInfo.txHash,
              explorerUrl: actionTxInfo.explorerUrl,
            });
            await new Promise((res) => setTimeout(res, appConfig.actionDelayMs));
            continue;
          }
          addTransacted(preview.amount);
        }

        const applied = applyOrThrow(requestedAction, { enforceTurn: true });

        history.push(
          `${actor}: ${applied.action}${applied.amount > 0 ? ` ($${applied.amount})` : ""}`,
        );

        broadcast({
          type: "action",
          agentId: actor,
          action: applied.action,
          amount: applied.amount,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
          gameState: applied.gameState ?? serializeState(engine.state),
          totalTransacted: getTotalTransacted(),
          txHash: actionTxInfo?.txHash,
          explorerUrl: actionTxInfo?.explorerUrl,
        });

        await new Promise((res) => setTimeout(res, appConfig.actionDelayMs));
      }

      // #region agent log
      agentDbgLog({
        hypothesisId: "H1",
        location: "game-loop.ts:hand:endInnerWhile",
        message: "exited inner betting while",
        data: {
          shouldStop,
          handComplete: engine.state?.handComplete ?? null,
          handNumber: engine.state?.handNumber,
        },
      });
      // #endregion

      if (shouldStop) break;

      if (engine.state?.handComplete) {
        const finishedState = engine.state;
        const winners = finishedState.winners ?? [];
        const payout = finishedState.payout ?? {};
        const winnerSummaries: HandResultPayload["winners"] = [];

        for (const winnerId of winners) {
          const amount = payout[winnerId] ?? 0;
          const txInfo = await payPotToWinnerResilient({
            winnerId,
            amount,
            handNumber: finishedState.handNumber,
          });
          if (txInfo.status !== "failed") {
            addTransacted(amount);
          } else {
            broadcast({
              type: "error",
              message: `pot payout to ${winnerId} failed`,
            });
          }
          broadcastTransaction(txInfo);

          winnerSummaries.push({
            winner: winnerId,
            winnerDisplayName: displayName(winnerId),
            amount,
            winningHand: winningHandDescription(winnerId),
          });
        }

        if (winnerSummaries.length > 0) {
          const handResult: HandResultPayload = {
            handNumber: finishedState.handNumber,
            winners: winnerSummaries,
          };
          broadcast({
            type: "hand_result",
            ...handResult,
          });
        }
      }

      await new Promise((res) => setTimeout(res, appConfig.handDelayMs));
    }
  } catch (e) {
    // #region agent log
    agentDbgLog({
      hypothesisId: "H3",
      location: "game-loop.ts:runTournamentLoop:catch",
      message: "runTournamentLoop catch",
      data: {
        err: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      },
    });
    // #endregion
    throw e;
  } finally {
    running = false;
    shouldStop = false;
    runAbort = null;
    // #region agent log
    agentDbgLog({
      hypothesisId: "H3",
      location: "game-loop.ts:runTournamentLoop:finally",
      message: "finally loop_stopped broadcast",
      data: {},
    });
    // #endregion
    broadcast({ type: "loop_stopped" });
  }
}
