export type { AgentId } from "./config.js";
export type { AgentDecision } from "./llm-agent.js";
import type { ThinkingContext } from "./llm-agent.js";

export const BASESCAN_TX_URL = "https://sepolia.basescan.org/tx/";

export interface TransactionInfo {
  id: string;
  from: string;
  to: string;
  amount: number;
  txHash: string;
  explorerUrl?: string;
  status: "pending" | "settled" | "failed" | "mock";
  timestamp: number;
  action: string;
  handNumber: number;
  totalTransacted?: number;
}

export interface HandResultPayload {
  handNumber: number;
  winners: {
    winner: string;
    winnerDisplayName: string;
    amount: number;
    winningHand: string;
  }[];
}

type GameStatePayload = Record<string, unknown> | null;

export type WsMessage =
  | {
      type: "thinking";
      agentId: string;
      reasoning: string;
      decision?: {
        action: string;
        amount: number | null;
        confidence: number | null;
        reasoning: string;
      };
      context?: ThinkingContext;
    }
  | {
      type: "action";
      agentId: string;
      action: string;
      amount: number | null;
      confidence?: number | null;
      reasoning: string;
      gameState: GameStatePayload;
      totalTransacted?: number;
      txHash?: string;
      explorerUrl?: string;
    }
  | {
      type: "hand_start";
      gameState: GameStatePayload;
    }
  | {
      type: "tournament_reset";
    }
  | {
      type: "payment_mode_changed";
      mode: "real" | "mock_degraded";
      reason: string;
    }
  | ({ type: "hand_result" } & HandResultPayload)
  | ({ type: "transaction" } & TransactionInfo)
  | {
      type: "tournament_end";
      winner: string;
      stacks: Record<string, number>;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "loop_stopped";
    };
