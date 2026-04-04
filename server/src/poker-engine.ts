import { appConfig } from "./config.js";
import { SEAT_ORDER, type AgentId } from "./config.js";
import { randomInt } from "node:crypto";
import { createRequire } from "node:module";
import type { CardCode } from "./hand-eval.js";

const require = createRequire(import.meta.url);
const { Hand } = require("pokersolver");

const RANKS = "23456789TJQKA";
const SUITS = "shdc";
const CHIP_SCALE = 1_000_000;

function toMicros(amount: number): number {
  return Math.round(amount * CHIP_SCALE);
}

function fromMicros(amountMicros: number): number {
  return amountMicros / CHIP_SCALE;
}

export function makeDeck(): CardCode[] {
  const d: CardCode[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      d.push(`${r}${s}` as CardCode);
    }
  }
  return d;
}

export function shuffleDeck(
  deck: CardCode[],
  rng: (upperExclusive: number) => number = (upperExclusive) => randomInt(0, upperExclusive),
): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

export type Street = "preflop" | "flop" | "turn" | "river";

export interface EnginePlayer {
  stack: number;
  folded: boolean;
  holeCards: CardCode[];
  allIn: boolean;
}

export interface PokerEngineState {
  handNumber: number;
  seatOrder: AgentId[];
  dealerId: AgentId;
  smallBlindId: AgentId;
  bigBlindId: AgentId;
  activeOrder: AgentId[];
  players: Record<AgentId, EnginePlayer>;
  communityCards: CardCode[];
  pot: number;
  street: Street;
  preflopBigBlind: number;
  currentBet: number;
  roundContribution: Partial<Record<AgentId, number>>;
  totalContribution: Partial<Record<AgentId, number>>;
  /** Voluntary actions this street only (not blinds); BB preflop option requires this. */
  hasActed: Partial<Record<AgentId, boolean>>;
  actingIndex: number;
  minRaiseIncrement: number;
  /** Current bet amount that was set by a full raise. */
  lastFullRaiseTo: number;
  deck: CardCode[];
  handComplete: boolean;
  winners?: AgentId[];
  payout?: Partial<Record<AgentId, number>>;
}

export interface EngineActionResult {
  action: "blind" | "fold" | "check" | "call" | "raise";
  amount: number;
  raiseIncrement?: number;
}

export class PokerEngine {
  stacks: Record<AgentId, number>;
  eliminated: Record<AgentId, boolean>;
  private dealerScan = -1;
  handNumber = 0;
  state: PokerEngineState | null = null;

  constructor(starting: number = appConfig.startingStack) {
    this.stacks = Object.fromEntries(SEAT_ORDER.map((id) => [id, starting])) as Record<
      AgentId,
      number
    >;
    this.eliminated = Object.fromEntries(SEAT_ORDER.map((id) => [id, false])) as Record<
      AgentId,
      boolean
    >;
  }

  activePlayers(): AgentId[] {
    return SEAT_ORDER.filter((id) => !this.eliminated[id] && this.stacks[id] > 0);
  }

  tournamentWinner(): AgentId | null {
    const inGame = this.activePlayers();
    if (inGame.length === 1) return inGame[0];
    return null;
  }

  private nextDealer(active: AgentId[]): AgentId {
    for (let k = 0; k < 7; k++) {
      this.dealerScan = (this.dealerScan + 1) % SEAT_ORDER.length;
      const id = SEAT_ORDER[this.dealerScan];
      if (active.includes(id)) return id;
    }
    return active[0];
  }

  startHand(): { state: PokerEngineState; smallBlind: number; bigBlind: number } | null {
    const active = this.activePlayers();
    if (active.length < 2) return null;

    this.handNumber++;
    const sbAmt = appConfig.smallBlind;
    const bbAmt = appConfig.bigBlind;
    const dealerId = this.nextDealer(active) as AgentId;

    let sbIdx: number;
    let bbIdx: number;
    if (active.length === 2) {
      const dIdx = active.indexOf(dealerId);
      sbIdx = dIdx;
      bbIdx = (dIdx + 1) % 2;
    } else {
      const dIdx = active.indexOf(dealerId);
      sbIdx = (dIdx + 1) % active.length;
      bbIdx = (dIdx + 2) % active.length;
    }

    const smallBlindId = active[sbIdx];
    const bigBlindId = active[bbIdx];
    const rotatedActive = [...active.slice(sbIdx), ...active.slice(0, sbIdx)];

    const deck = makeDeck();
    shuffleDeck(deck);

    const players = {} as Record<AgentId, EnginePlayer>;
    for (const id of SEAT_ORDER) {
      players[id] = {
        stack: this.stacks[id],
        folded: !active.includes(id),
        holeCards: [],
        allIn: false,
      };
    }

    for (const id of rotatedActive) {
      players[id].holeCards.push(deck.pop()!);
    }
    for (const id of rotatedActive) {
      players[id].holeCards.push(deck.pop()!);
    }

    const state: PokerEngineState = {
      handNumber: this.handNumber,
      seatOrder: [...SEAT_ORDER],
      dealerId,
      smallBlindId,
      bigBlindId,
      activeOrder: rotatedActive,
      players,
      communityCards: [],
      pot: 0,
      street: "preflop",
      preflopBigBlind: bbAmt,
      currentBet: bbAmt,
      roundContribution: {},
      totalContribution: {},
      hasActed: {},
      actingIndex: 0,
      minRaiseIncrement: bbAmt,
      lastFullRaiseTo: bbAmt,
      deck,
      handComplete: false,
    };

    state.actingIndex = state.activeOrder.length === 2 ? 0 : 2 % state.activeOrder.length;

    this.state = state;
    return { state, smallBlind: sbAmt, bigBlind: bbAmt };
  }

  previewBlind(agentId: AgentId, amt: number): EngineActionResult | null {
    const s = this.state;
    if (!s) return null;
    const p = s.players[agentId];
    return {
      action: "blind",
      amount: Math.min(Math.max(amt, 0), p.stack),
    };
  }

  postBlind(agentId: AgentId, amt: number): EngineActionResult | null {
    const s = this.state;
    const resolved = this.previewBlind(agentId, amt);
    if (!s || !resolved) return null;
    const p = s.players[agentId];
    const pay = resolved.amount;
    p.stack -= pay;
    s.pot += pay;
    s.roundContribution[agentId] = (s.roundContribution[agentId] ?? 0) + pay;
    s.totalContribution[agentId] = (s.totalContribution[agentId] ?? 0) + pay;
    if (p.stack === 0) p.allIn = true;
    this.recomputeCurrentBet();
    this.syncStacksFromState();
    return resolved;
  }

  applyBlinds(smallBlindId: AgentId, bigBlindId: AgentId, sbAmt: number, bbAmt: number): void {
    this.postBlind(smallBlindId, sbAmt);
    this.postBlind(bigBlindId, bbAmt);
  }

  private syncStacksFromState(): void {
    const s = this.state;
    if (!s) return;
    for (const id of SEAT_ORDER) {
      this.stacks[id] = s.players[id].stack;
    }
  }

  private recomputeCurrentBet(): void {
    const s = this.state;
    if (!s) return;
    let m = 0;
    for (const id of s.activeOrder) {
      m = Math.max(m, s.roundContribution[id] ?? 0);
    }
    if (s.street === "preflop") {
      m = Math.max(m, s.preflopBigBlind);
    }
    s.currentBet = m;
  }

  facingBet(agentId: AgentId): number {
    const s = this.state;
    if (!s) return 0;
    const cur = s.roundContribution[agentId] ?? 0;
    return Math.max(0, s.currentBet - cur);
  }

  /** When all active players are all-in or no one can bet, advance the street. */
  advanceIfRoundComplete(): void {
    if (!this.state || this.state.handComplete) return;
    if (this.roundComplete()) {
      this.advanceStreet();
    }
  }

  currentActor(): AgentId | null {
    const s = this.state;
    if (!s || s.handComplete) return null;
    for (let k = 0; k < s.activeOrder.length + 1; k++) {
      const id = s.activeOrder[s.actingIndex];
      if (id && !s.players[id].folded && !s.players[id].allIn) return id;
      s.actingIndex = (s.actingIndex + 1) % s.activeOrder.length;
    }
    return null;
  }

  private moveToNextAfter(lastActor: AgentId): void {
    const s = this.state;
    if (!s) return;
    const idx = s.activeOrder.indexOf(lastActor);
    s.actingIndex = (idx + 1) % s.activeOrder.length;
    for (let k = 0; k < s.activeOrder.length; k++) {
      const id = s.activeOrder[s.actingIndex];
      if (!s.players[id].folded && !s.players[id].allIn) return;
      s.actingIndex = (s.actingIndex + 1) % s.activeOrder.length;
    }
  }

  previewAction(
    agentId: AgentId,
    action: "fold" | "check" | "call" | "raise",
    raiseIncrement?: number,
  ): EngineActionResult | null {
    const s = this.state;
    if (!s || s.handComplete) return null;
    const pl = s.players[agentId];
    if (pl.folded || pl.allIn) return null;

    const facing = this.facingBet(agentId);

    if (action === "fold") {
      return { action: "fold", amount: 0 };
    }

    if (action === "check") {
      if (facing > 0) {
        return {
          action: "call",
          amount: Math.min(facing, pl.stack),
        };
      }
      return { action: "check", amount: 0 };
    }

    if (action === "call") {
      if (facing === 0) {
        return { action: "check", amount: 0 };
      }
      return {
        action: "call",
        amount: Math.min(facing, pl.stack),
      };
    }

    if (
      action === "raise" &&
      (s.hasActed[agentId] ?? false) &&
      facing > 0 &&
      s.currentBet > s.lastFullRaiseTo
    ) {
      return {
        action: "call",
        amount: Math.min(facing, pl.stack),
      };
    }

    const legalIncrement = Math.max(raiseIncrement ?? s.minRaiseIncrement, s.minRaiseIncrement);
    if (pl.stack <= facing) {
      if (facing === 0) {
        return { action: "check", amount: 0 };
      }
      return {
        action: "call",
        amount: Math.min(facing, pl.stack),
      };
    }
    const pay = Math.min(facing + legalIncrement, pl.stack);
    return {
      action: "raise",
      amount: pay,
      raiseIncrement: Math.max(0, pay - facing),
    };
  }

  applyAction(
    agentId: AgentId,
    action: "fold" | "check" | "call" | "raise",
    raiseIncrement?: number,
  ): EngineActionResult | null {
    const s = this.state;
    const resolved = this.previewAction(agentId, action, raiseIncrement);
    if (!s || !resolved) return null;
    const pl = s.players[agentId];
    const cur = s.roundContribution[agentId] ?? 0;
    const prevMax = s.currentBet;

    if (resolved.action === "fold") {
      pl.folded = true;
      s.hasActed[agentId] = true;
      this.afterAction(agentId);
      return resolved;
    }

    if (resolved.action === "check") {
      s.hasActed[agentId] = true;
      this.afterAction(agentId);
      return resolved;
    }

    pl.stack -= resolved.amount;
    s.roundContribution[agentId] = cur + resolved.amount;
    s.pot += resolved.amount;
    s.totalContribution[agentId] = (s.totalContribution[agentId] ?? 0) + resolved.amount;
    this.recomputeCurrentBet();

    if (resolved.action === "raise" && s.currentBet > prevMax) {
      const actualIncrement = s.currentBet - prevMax;
      if (actualIncrement >= s.minRaiseIncrement) {
        s.minRaiseIncrement = actualIncrement;
        s.lastFullRaiseTo = s.currentBet;
      }
    }

    if (pl.stack === 0) pl.allIn = true;
    s.hasActed[agentId] = true;
    this.syncStacksFromState();
    this.afterAction(agentId);
    return resolved;
  }

  private roundComplete(): boolean {
    const s = this.state;
    if (!s) return true;
    const alive = s.activeOrder.filter((id) => !s.players[id].folded);
    if (alive.length <= 1) return true;
    return alive.every((id) => {
      const c = s.roundContribution[id] ?? 0;
      const acted = s.hasActed[id] ?? false;
      return (acted && c >= s.currentBet) || s.players[id].allIn;
    });
  }

  private afterAction(lastActor: AgentId): void {
    const s = this.state;
    if (!s) return;

    const alive = s.activeOrder.filter((id) => !s.players[id].folded);
    if (alive.length === 1) {
      this.awardPot([alive[0]]);
      return;
    }

    if (this.roundComplete()) {
      this.advanceStreet();
      return;
    }

    this.moveToNextAfter(lastActor);
  }

  private advanceStreet(): void {
    const s = this.state;
    if (!s) return;

    for (const id of s.activeOrder) {
      s.roundContribution[id] = 0;
    }
    s.hasActed = {};
    s.currentBet = 0;
    s.minRaiseIncrement = appConfig.bigBlind;
    s.lastFullRaiseTo = 0;

    if (s.street === "preflop") {
      s.street = "flop";
      s.deck.pop();
      s.communityCards.push(s.deck.pop()!, s.deck.pop()!, s.deck.pop()!);
    } else if (s.street === "flop") {
      s.street = "turn";
      s.deck.pop();
      s.communityCards.push(s.deck.pop()!);
    } else if (s.street === "turn") {
      s.street = "river";
      s.deck.pop();
      s.communityCards.push(s.deck.pop()!);
    } else {
      this.showdown();
      return;
    }

    const ordered = this.leftOfDealerOrder();
    const firstToAct = ordered.find((id) => !s.players[id].folded && !s.players[id].allIn);
    s.actingIndex = firstToAct ? s.activeOrder.indexOf(firstToAct) : 0;
    if (s.activeOrder.every((id) => s.players[id].folded || s.players[id].allIn)) {
      this.advanceStreet();
    }
  }

  private showdown(): void {
    const s = this.state;
    if (!s) return;
    const payout: Partial<Record<AgentId, number>> = {};
    const winnerSet = new Set<AgentId>();
    const sidePots = this.buildSidePots();

    for (const sidePot of sidePots) {
      const hands = sidePot.eligible.map((id) => ({
        id,
        hand: Hand.solve([...s.players[id].holeCards, ...s.communityCards]),
      }));
      const winningHands = Hand.winners(hands.map((h) => h.hand));
      const winners = hands
        .filter((h) => winningHands.includes(h.hand))
        .map((h) => h.id) as AgentId[];
      this.distributePotMicros(sidePot.amountMicros, winners, payout);
      for (const winner of winners) {
        winnerSet.add(winner);
      }
    }

    this.finalizeHand(this.orderByActiveOrder([...winnerSet]), payout);
  }

  private awardPot(winners: AgentId[]): void {
    const s = this.state;
    if (!s) return;
    const payout: Partial<Record<AgentId, number>> = {};
    this.distributePotMicros(toMicros(s.pot), winners, payout);
    this.finalizeHand(this.orderByActiveOrder(winners), payout);
  }

  private orderByActiveOrder(ids: AgentId[]): AgentId[] {
    const s = this.state;
    if (!s) return ids;
    const idSet = new Set(ids);
    return this.leftOfDealerOrder().filter((id) => idSet.has(id));
  }

  private leftOfDealerOrder(): AgentId[] {
    const s = this.state;
    if (!s || s.activeOrder.length === 0) return [];
    const startId = s.activeOrder.length === 2 ? s.bigBlindId : s.activeOrder[0];
    const startIndex = s.activeOrder.indexOf(startId);
    if (startIndex <= 0) return [...s.activeOrder];
    return [...s.activeOrder.slice(startIndex), ...s.activeOrder.slice(0, startIndex)];
  }

  private distributePotMicros(
    amountMicros: number,
    winners: AgentId[],
    payout: Partial<Record<AgentId, number>>,
  ): void {
    const s = this.state;
    if (!s || winners.length === 0 || amountMicros <= 0) return;

    const orderedWinners = this.orderByActiveOrder(winners);
    if (orderedWinners.length === 0) return;

    const shareMicros = Math.floor(amountMicros / orderedWinners.length);
    const remainderMicros = amountMicros - shareMicros * orderedWinners.length;

    for (let i = 0; i < orderedWinners.length; i++) {
      const winner = orderedWinners[i];
      const payoutMicros = shareMicros + (i === 0 ? remainderMicros : 0);
      if (payoutMicros <= 0) continue;
      const payoutAmount = fromMicros(payoutMicros);
      s.players[winner].stack += payoutAmount;
      payout[winner] = (payout[winner] ?? 0) + payoutAmount;
    }
  }

  private buildSidePots(): Array<{ amountMicros: number; eligible: AgentId[] }> {
    const s = this.state;
    if (!s) return [];

    const contributionMicros: Partial<Record<AgentId, number>> = {};
    const contributors: AgentId[] = [];
    for (const id of s.activeOrder) {
      const micros = toMicros(s.totalContribution[id] ?? 0);
      contributionMicros[id] = micros;
      if (micros > 0) contributors.push(id);
    }
    if (contributors.length === 0) return [];

    const levels = [...new Set(contributors.map((id) => contributionMicros[id] ?? 0))]
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const sidePots: Array<{ amountMicros: number; eligible: AgentId[] }> = [];
    let prevLevel = 0;

    for (const level of levels) {
      if (level <= prevLevel) continue;
      const participants = contributors.filter((id) => (contributionMicros[id] ?? 0) >= level);
      if (participants.length === 0) continue;
      const amountMicros = (level - prevLevel) * participants.length;
      const eligible = participants.filter((id) => !s.players[id].folded);
      if (amountMicros > 0 && eligible.length > 0) {
        sidePots.push({ amountMicros, eligible });
      }
      prevLevel = level;
    }

    return sidePots;
  }

  private finalizeHand(winners: AgentId[], payout: Partial<Record<AgentId, number>>): void {
    const s = this.state;
    if (!s) return;
    s.payout = payout;
    s.pot = 0;
    s.handComplete = true;
    s.winners = winners;
    this.syncStacksFromState();
    for (const id of SEAT_ORDER) {
      if (this.stacks[id] <= 0) {
        this.eliminated[id] = true;
      }
    }
  }
}
