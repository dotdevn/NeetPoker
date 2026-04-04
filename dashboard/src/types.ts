export type ThinkingContext = {
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
};

export type HandResultWinner = {
  winner: string;
  winnerDisplayName: string;
  amount: number;
  winningHand: string;
};

export type WsMessage =
  | {
      type: "thinking";
      agentId: string;
      reasoning: string;
      decision?: {
        action: string;
        amount: number | null;
        confidence?: number | null;
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
      gameState: GameStatePayload | null;
      totalTransacted?: number;
      txHash?: string;
      explorerUrl?: string;
    }
  | {
      type: "hand_start";
      gameState: GameStatePayload | null;
    }
  | {
      type: "tournament_reset";
    }
  | {
      type: "payment_mode_changed";
      mode: "real" | "mock_degraded";
      reason: string;
    }
  | {
      type: "hand_result";
      handNumber: number;
      winners: HandResultWinner[];
    }
  | {
      type: "transaction";
      id: string;
      from: string;
      to: string;
      amount: number;
      txHash: string;
      explorerUrl?: string;
      status: string;
      action: string;
      handNumber: number;
      totalTransacted?: number;
    }
  | {
      type: "tournament_end";
      winner: string;
      stacks: Record<string, number>;
    }
  | { type: "error"; message: string }
  | { type: "loop_stopped" };

export type GameStatePayload = {
  handNumber: number;
  street: string;
  pot: number;
  communityCards: string[];
  dealerId: string;
  smallBlindId?: string;
  bigBlindId?: string;
  seatOrder: string[];
  activeOrder: string[];
  handComplete: boolean;
  stacks: Record<string, number>;
  players: Record<
    string,
    {
      stack: number;
      folded: boolean;
      holeCards: string[];
      allIn: boolean;
    }
  >;
};
