import { SEAT_ORDER, type AgentId } from "./config.js";
import { engine } from "./game-state.js";
import type { EngineActionResult, PokerEngineState } from "./poker-engine.js";

export type GameActionBody = {
  agentId: AgentId;
  action: "blind" | "fold" | "check" | "call" | "raise";
  /** USDC amount for x402 (blind, call, raise total chip add) */
  amount?: number;
  /** Raise increment above facing (NLHE) — required for raise */
  raiseIncrement?: number;
};

export interface AppliedGameActionResult extends EngineActionResult {
  gameState: ReturnType<typeof serializeState>;
}

export type GameActionOptions = {
  allowBlind?: boolean;
  enforceTurn?: boolean;
};

export function serializeState(st: PokerEngineState | null) {
  if (!st) return null;
  const stacks: Record<string, number> = {};
  for (const id of st.seatOrder ?? SEAT_ORDER) {
    stacks[id] = st.players[id]?.stack ?? 0;
  }
  return {
    handNumber: st.handNumber,
    street: st.street,
    pot: st.pot,
    communityCards: st.communityCards,
    dealerId: st.dealerId,
    smallBlindId: st.smallBlindId,
    bigBlindId: st.bigBlindId,
    seatOrder: st.seatOrder ?? [...SEAT_ORDER],
    activeOrder: st.activeOrder,
    handComplete: st.handComplete,
    winners: st.winners,
    stacks,
    players: Object.fromEntries(
      Object.entries(st.players).map(([id, p]) => [
        id,
        {
          stack: p.stack,
          folded: p.folded,
          holeCards: p.holeCards,
          allIn: p.allIn,
        },
      ]),
    ),
  };
}

export function validateGameActionPolicy(
  body: GameActionBody,
  options: GameActionOptions = {},
): string | null {
  const allowBlind = options.allowBlind ?? false;
  const enforceTurn = options.enforceTurn ?? false;
  const state = engine.state;
  if (!state || state.handComplete) return "no active hand";

  if (body.action === "blind") {
    if (!allowBlind) return "blind action is server-managed only";
    if (state.street !== "preflop") return "blind action is only valid preflop";
    if (body.agentId !== state.smallBlindId && body.agentId !== state.bigBlindId) {
      return "blind action is only valid for small/big blind seats";
    }
    if ((state.roundContribution[body.agentId] ?? 0) > 0) {
      return "blind already posted for this seat";
    }
    return null;
  }

  if (enforceTurn) {
    const actor = engine.currentActor();
    if (!actor) return "no actor available";
    if (actor !== body.agentId) return `out of turn: expected ${actor}`;
  }

  return null;
}

export function previewGameAction(
  body: GameActionBody,
  options: GameActionOptions = {},
): EngineActionResult | null {
  const { agentId, action, amount = 0, raiseIncrement } = body;
  if (!engine.state) return null;
  if (validateGameActionPolicy(body, options)) return null;

  if (action === "blind") {
    return engine.previewBlind(agentId, amount);
  }

  if (action === "fold" || action === "check" || action === "call") {
    return engine.previewAction(agentId, action, raiseIncrement);
  }

  const inc = raiseIncrement ?? amount ?? 0;
  return engine.previewAction(agentId, "raise", inc);
}

export function applyGameAction(
  body: GameActionBody,
  options: GameActionOptions = {},
): AppliedGameActionResult | null {
  const { agentId, action, amount = 0, raiseIncrement } = body;
  if (!engine.state) return null;
  if (validateGameActionPolicy(body, options)) return null;

  const result =
    action === "blind"
      ? engine.postBlind(agentId, amount)
      : action === "fold" || action === "check" || action === "call"
        ? engine.applyAction(agentId, action, raiseIncrement)
        : engine.applyAction(agentId, "raise", raiseIncrement ?? amount ?? 0);

  if (!result) return null;

  return {
    ...result,
    gameState: serializeState(engine.state),
  };
}
