import { useEffect, useReducer, useState } from "react";
import type { GameStatePayload, ThinkingContext, WsMessage } from "../types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws";

const MAX_TX = 12;
const MAX_THINKING = (() => {
  const n = Number(import.meta.env.VITE_MAX_THINKING ?? 12);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 12;
})();
const MAX_EVENT_LOG = 800;
const MAX_HAND_HISTORY = 120;
const MAX_HAND_TX = 120;
const MAX_HAND_THINKING = 160;
const MAX_HAND_EVENT_LOG = 300;

export type EventLogEntry = {
  id: string;
  at: number;
  agentId?: string;
  kind: "thinking" | "action" | "system";
  message: string;
  txHash?: string;
  explorerUrl?: string;
};

export type ThinkingEntry = {
  agentId: string;
  reasoning: string;
  decision?: {
    action: string;
    amount: number | null;
    confidence?: number | null;
    reasoning: string;
  };
  context?: ThinkingContext;
};

export type TransactionEntry = {
  id: string;
  agentId: string;
  label: string;
  amount: string;
  status: "ok" | "pending" | "failed" | "mock";
  txHash?: string;
  explorerUrl?: string;
};

export type HandHistoryEntry = {
  handNumber: number;
  startedAt: number;
  completedAt?: number;
  winners: {
    agentId: string;
    displayName: string;
    amount: number;
    winningHand: string;
  }[];
  eventLog: EventLogEntry[];
  transactions: TransactionEntry[];
  thinking: ThinkingEntry[];
};

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const KNOWN_WS_TYPES = new Set([
  "thinking",
  "action",
  "hand_start",
  "tournament_reset",
  "payment_mode_changed",
  "transaction",
  "hand_result",
  "tournament_end",
  "error",
  "loop_stopped",
]);

type State = {
  gameState: GameStatePayload | null;
  totalTransacted: number;
  thinking: ThinkingEntry[];
  transactions: TransactionEntry[];
  eventLog: EventLogEntry[];
  handHistory: HandHistoryEntry[];
  latestActions: Record<string, { action: string; amount: number | null; timestamp: number }>;
  currentHandNumber: number | null;
  tournamentWinner: string | null;
  loopRunning: boolean;
  paymentMode: "real" | "mock_degraded";
};

function createHandHistory(handNumber: number, startedAt = Date.now()): HandHistoryEntry {
  return {
    handNumber,
    startedAt,
    winners: [],
    eventLog: [],
    transactions: [],
    thinking: [],
  };
}

function updateHandHistory(
  history: HandHistoryEntry[],
  handNumber: number,
  updater: (hand: HandHistoryEntry) => HandHistoryEntry,
  startedAt = Date.now(),
): HandHistoryEntry[] {
  const idx = history.findIndex((hand) => hand.handNumber === handNumber);
  if (idx === -1) {
    return [updater(createHandHistory(handNumber, startedAt)), ...history].slice(0, MAX_HAND_HISTORY);
  }
  const next = [...history];
  next[idx] = updater(next[idx]);
  return next.sort((a, b) => b.handNumber - a.handNumber).slice(0, MAX_HAND_HISTORY);
}

function handNumberForState(state: State, explicitHandNumber?: number | null): number | null {
  if (typeof explicitHandNumber === "number" && explicitHandNumber > 0) return explicitHandNumber;
  if (typeof state.currentHandNumber === "number" && state.currentHandNumber > 0) return state.currentHandNumber;
  if (typeof state.gameState?.handNumber === "number" && state.gameState.handNumber > 0) {
    return state.gameState.handNumber;
  }
  return null;
}

function appendHandEvent(history: HandHistoryEntry[], handNumber: number, entry: EventLogEntry) {
  return updateHandHistory(history, handNumber, (hand) => ({
    ...hand,
    eventLog: [...hand.eventLog, entry].slice(-MAX_HAND_EVENT_LOG),
  }), entry.at);
}

function appendHandThinking(history: HandHistoryEntry[], handNumber: number, entry: ThinkingEntry) {
  return updateHandHistory(history, handNumber, (hand) => ({
    ...hand,
    thinking: [...hand.thinking, entry].slice(-MAX_HAND_THINKING),
  }));
}

function appendHandTransaction(history: HandHistoryEntry[], handNumber: number, entry: TransactionEntry) {
  return updateHandHistory(history, handNumber, (hand) => ({
    ...hand,
    transactions: [...hand.transactions, entry].slice(-MAX_HAND_TX),
  }));
}

const initial: State = {
  gameState: null,
  totalTransacted: 0,
  thinking: [],
  transactions: [],
  eventLog: [],
  handHistory: [],
  latestActions: {},
  currentHandNumber: null,
  tournamentWinner: null,
  loopRunning: false,
  paymentMode: "real",
};

type ReducerMessage = WsMessage | { type: "client_warning"; message: string };

function reducer(state: State, msg: ReducerMessage): State {
  switch (msg.type) {
    case "client_warning": {
      const log: EventLogEntry = {
        id: nextId(),
        at: Date.now(),
        kind: "system",
        message: `Socket warning · ${msg.message}`,
      };
      return {
        ...state,
        eventLog: [...state.eventLog, log].slice(-MAX_EVENT_LOG),
      };
    }
    case "thinking": {
      const next = [
        { agentId: msg.agentId, reasoning: msg.reasoning, decision: msg.decision, context: msg.context },
        ...state.thinking.filter((entry) => entry.agentId !== msg.agentId),
      ].slice(0, MAX_THINKING);
      const activeHandNumber = handNumberForState(state);
      const handHistory =
        activeHandNumber == null
          ? state.handHistory
          : appendHandThinking(state.handHistory, activeHandNumber, {
              agentId: msg.agentId,
              reasoning: msg.reasoning,
              decision: msg.decision,
              context: msg.context,
            });
      return { ...state, thinking: next, handHistory };
    }
    case "action": {
      const actionTimestamp = Date.now();
      const log: EventLogEntry = {
        id: nextId(),
        at: actionTimestamp,
        agentId: msg.agentId,
        kind: "action",
        message: `${msg.action}${msg.amount != null ? ` ($${msg.amount.toFixed(2)})` : ""}${msg.txHash ? ` · ${msg.txHash}` : ""} · ${msg.reasoning}`,
      };
      const activeHandNumber = handNumberForState(state, msg.gameState?.handNumber);
      const handHistory =
        activeHandNumber == null ? state.handHistory : appendHandEvent(state.handHistory, activeHandNumber, log);
      return {
        ...state,
        gameState: msg.gameState ?? state.gameState,
        currentHandNumber: activeHandNumber ?? state.currentHandNumber,
        totalTransacted: msg.totalTransacted ?? state.totalTransacted,
        handHistory,
        latestActions: {
          ...state.latestActions,
          [msg.agentId]: {
            action: msg.action,
            amount: msg.amount,
            timestamp: actionTimestamp,
          },
        },
        eventLog: [...state.eventLog, log].slice(-MAX_EVENT_LOG),
      };
    }
    case "hand_start": {
      const hn =
        (typeof msg.gameState?.handNumber === "number" && msg.gameState.handNumber > 0
          ? msg.gameState.handNumber
          : null) ??
        Math.max(1, (state.currentHandNumber ?? state.gameState?.handNumber ?? 0) + 1);
      const log: EventLogEntry = {
        id: nextId(),
        at: Date.now(),
        kind: "system",
        message: `Hand #${hn} started`,
      };
      const handHistory = appendHandEvent(state.handHistory, hn, log);
      return {
        ...state,
        gameState: msg.gameState,
        currentHandNumber: hn,
        loopRunning: true,
        thinking: [],
        handHistory,
        latestActions: {},
        eventLog: [...state.eventLog, log].slice(-MAX_EVENT_LOG),
      };
    }
    case "transaction": {
      const tx = {
        id: msg.id,
        agentId: msg.from,
        label: `${msg.from} → ${msg.to}`,
        amount: `${msg.action} $${msg.amount.toFixed(2)}`,
        status:
          msg.status === "pending"
            ? ("pending" as const)
            : msg.status === "failed"
              ? ("failed" as const)
              : msg.status === "mock"
                ? ("mock" as const)
                : ("ok" as const),
        txHash: msg.txHash,
        explorerUrl: msg.explorerUrl,
      };
      const log: EventLogEntry = {
        id: nextId(),
        at: Date.now(),
        agentId: msg.from,
        kind: "system",
        message: `TX ${msg.from} → ${msg.to} · ${msg.action} ($${msg.amount.toFixed(2)})${msg.txHash ? ` · ${msg.txHash}` : ""}`,
        txHash: msg.txHash,
        explorerUrl: msg.explorerUrl,
      };
      const activeHandNumber = handNumberForState(state, msg.handNumber);
      let handHistory = state.handHistory;
      if (activeHandNumber != null) {
        handHistory = appendHandTransaction(handHistory, activeHandNumber, tx);
        handHistory = appendHandEvent(handHistory, activeHandNumber, log);
      }
      return {
        ...state,
        currentHandNumber: activeHandNumber ?? state.currentHandNumber,
        totalTransacted: msg.totalTransacted ?? state.totalTransacted,
        transactions: [tx, ...state.transactions].slice(0, MAX_TX),
        handHistory,
        eventLog: [...state.eventLog, log].slice(-MAX_EVENT_LOG),
      };
    }
    case "tournament_reset": {
      return {
        ...state,
        gameState: null,
        totalTransacted: 0,
        thinking: [],
        transactions: [],
        eventLog: [],
        handHistory: [],
        latestActions: {},
        currentHandNumber: null,
        tournamentWinner: null,
        loopRunning: false,
        paymentMode: "real",
      };
    }
    case "payment_mode_changed": {
      const modeLabel = msg.mode === "mock_degraded" ? "MOCK DEGRADED" : "REAL";
      const log: EventLogEntry = {
        id: nextId(),
        at: Date.now(),
        kind: "system",
        message: `Payment mode · ${modeLabel}${msg.reason ? ` · ${msg.reason}` : ""}`,
      };
      const activeHandNumber = handNumberForState(state);
      const handHistory =
        activeHandNumber == null ? state.handHistory : appendHandEvent(state.handHistory, activeHandNumber, log);
      return {
        ...state,
        paymentMode: msg.mode,
        handHistory,
        eventLog: [...state.eventLog, log].slice(-MAX_EVENT_LOG),
      };
    }
    case "hand_result": {
      const winnerSummary =
        msg.winners.length === 0
          ? "No winners recorded"
          : msg.winners
              .map((winner) => `${winner.winnerDisplayName} $${winner.amount.toFixed(2)} (${winner.winningHand})`)
              .join(", ");
      const log: EventLogEntry = {
        id: nextId(),
        at: Date.now(),
        agentId: msg.winners[0]?.winner,
        kind: "system",
        message: `Hand #${msg.handNumber} · ${winnerSummary}`,
      };
      const handHistory = updateHandHistory(state.handHistory, msg.handNumber, (hand) => {
        const winners = (() => {
          const merged = new Map(hand.winners.map((winner) => [winner.agentId, winner]));
          for (const winner of msg.winners) {
            merged.set(winner.winner, {
              agentId: winner.winner,
              displayName: winner.winnerDisplayName,
              amount: winner.amount,
              winningHand: winner.winningHand,
            });
          }
          return [...merged.values()];
        })();
        return {
          ...hand,
          completedAt: Date.now(),
          winners,
          eventLog: [...hand.eventLog, log].slice(-MAX_HAND_EVENT_LOG),
        };
      });
      return {
        ...state,
        currentHandNumber: msg.handNumber,
        handHistory,
        eventLog: [...state.eventLog, log].slice(-MAX_EVENT_LOG),
      };
    }
    case "tournament_end": {
      const log: EventLogEntry = {
        id: nextId(),
        at: Date.now(),
        kind: "system",
        message: `Tournament ended · winner: ${msg.winner}`,
      };
      const activeHandNumber = handNumberForState(state);
      const handHistory =
        activeHandNumber == null ? state.handHistory : appendHandEvent(state.handHistory, activeHandNumber, log);
      return {
        ...state,
        loopRunning: false,
        tournamentWinner: msg.winner,
        handHistory,
        gameState: {
          handNumber: state.gameState?.handNumber ?? 0,
          street: "complete",
          pot: 0,
          communityCards: [],
          dealerId: "",
          seatOrder: state.gameState?.seatOrder ?? Object.keys(msg.stacks),
          activeOrder: Object.keys(msg.stacks),
          handComplete: true,
          stacks: msg.stacks,
          players: state.gameState?.players ?? {},
        },
        eventLog: [...state.eventLog, log].slice(-MAX_EVENT_LOG),
      };
    }
    case "error": {
      const log: EventLogEntry = {
        id: nextId(),
        at: Date.now(),
        kind: "system",
        message: `Error · ${msg.message}`,
      };
      const activeHandNumber = handNumberForState(state);
      const handHistory =
        activeHandNumber == null ? state.handHistory : appendHandEvent(state.handHistory, activeHandNumber, log);
      return {
        ...state,
        handHistory,
        eventLog: [...state.eventLog, log].slice(-MAX_EVENT_LOG),
      };
    }
    case "loop_stopped": {
      const log: EventLogEntry = {
        id: nextId(),
        at: Date.now(),
        kind: "system",
        message: "Loop stopped",
      };
      const activeHandNumber = handNumberForState(state);
      const handHistory =
        activeHandNumber == null ? state.handHistory : appendHandEvent(state.handHistory, activeHandNumber, log);
      return {
        ...state,
        loopRunning: false,
        thinking: [],
        handHistory,
        eventLog: [...state.eventLog, log].slice(-MAX_EVENT_LOG),
      };
    }
    default:
      return state;
  }
}

export function useGameSocket() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let backoff = 1000;
    const max = 30000;
    let timer: ReturnType<typeof setTimeout>;

    const go = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        backoff = 1000;
        setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        timer = setTimeout(go, backoff);
        backoff = Math.min(backoff * 2, max);
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as { type?: string };
          if (!data || typeof data !== "object" || typeof data.type !== "string") {
            dispatch({ type: "client_warning", message: "Malformed WS payload dropped" });
            if (import.meta.env.DEV) console.warn("Malformed WS payload", ev.data);
            return;
          }
          if (!KNOWN_WS_TYPES.has(data.type)) {
            dispatch({ type: "client_warning", message: `Unknown WS type "${data.type}" dropped` });
            if (import.meta.env.DEV) console.warn("Unknown WS message type", data);
            return;
          }
          dispatch(data as WsMessage);
        } catch {
          dispatch({ type: "client_warning", message: "Non-JSON WS payload dropped" });
          if (import.meta.env.DEV) console.warn("Non-JSON WS payload", ev.data);
        }
      };
    };
    go();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return { ...state, connected };
}
