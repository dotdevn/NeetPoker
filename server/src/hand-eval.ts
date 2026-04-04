import { randomInt } from "node:crypto";
import { createRequire } from "node:module";
import { appConfig } from "./config.js";
export type CardCode = string;

const require = createRequire(import.meta.url);
const { Hand } = require("pokersolver");

function parseCard(code: CardCode): { rank: number; suit: string } {
  const rankChar = code.slice(0, -1);
  const suit = code.slice(-1);
  const order = "23456789TJQKA";
  const r = order.indexOf(rankChar);
  return { rank: r, suit };
}

function cardKey(a: CardCode, b: CardCode): string {
  const pa = parseCard(a);
  const pb = parseCard(b);
  const hi = pa.rank >= pb.rank ? a : b;
  const lo = pa.rank >= pb.rank ? b : a;
  return `${hi},${lo}`;
}

/** Simple preflop equity table by hand category (approximate for 6-max) */
const PREFLOP_EQUITY: Record<string, number> = {};

function preflopEquityForPair(hole: CardCode[]): number {
  const r1 = hole[0].slice(0, -1);
  if (hole[0].slice(0, -1) === hole[1].slice(0, -1)) {
    const pr = "23456789TJQKA".indexOf(r1);
    return 0.5 + pr * 0.035;
  }
  return -1;
}

export function evaluateHandStrength(
  holeCards: CardCode[],
  communityCards: CardCode[],
): { rankName: string; percentile: number } {
  const all = [...holeCards, ...communityCards];
  if (all.length < 2) {
    return { rankName: "Unknown", percentile: 50 };
  }
  if (communityCards.length === 0) {
    const pe = preflopEquityForPair(holeCards);
    if (pe > 0) {
      return { rankName: `Pair (${holeCards[0].slice(0, -1)}s)`, percentile: pe * 100 };
    }
    const k = cardKey(holeCards[0], holeCards[1]);
    const rough = PREFLOP_EQUITY[k] ?? 52;
    return { rankName: "High card / suited", percentile: rough };
  }
  const solved = Hand.solve(all);
  const name = solved.descr || solved.name || "Hand";
  const rankVal = typeof solved.rank === "number" ? solved.rank : 5;
  const percentile = Math.min(99, Math.max(1, rankVal * 7 + communityCards.length * 5));
  return { rankName: name, percentile };
}

function shuffle<T>(
  arr: T[],
  rng: (upperExclusive: number) => number = (upperExclusive) => randomInt(0, upperExclusive),
): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function monteCarloEquity(
  holeCards: CardCode[],
  communityCards: CardCode[],
  opponents: number,
  rng: (upperExclusive: number) => number = (upperExclusive) => randomInt(0, upperExclusive),
): number {
  const sims = appConfig.monteCarloSims;
  if (opponents <= 0) return 100;

  const ranks = "23456789TJQKA";
  const suits = "shdc";
  const deck: CardCode[] = [];
  for (const r of ranks) {
    for (const s of suits) {
      const c = `${r}${s}` as CardCode;
      if (holeCards.includes(c) || communityCards.includes(c)) continue;
      deck.push(c);
    }
  }

  let equityShares = 0;
  for (let i = 0; i < sims; i++) {
    const d = shuffle(deck, rng);
    const need = 5 - communityCards.length;
    const board = [...communityCards, ...d.slice(0, need)];
    const rest = d.slice(need);
    const solvedHands = [Hand.solve([...holeCards, ...board])];
    for (let o = 0; o < opponents; o++) {
      const oc = [rest[o * 2], rest[o * 2 + 1]] as CardCode[];
      solvedHands.push(Hand.solve([...oc, ...board]));
    }
    const winners = Hand.winners(solvedHands);
    if (winners.includes(solvedHands[0])) {
      equityShares += 1 / winners.length;
    }
  }
  return Math.round((equityShares / sims) * 1000) / 10;
}

export function potOddsRatio(
  pot: number,
  callAmount: number,
): { ratio: string; breakEvenPct: number } {
  if (callAmount <= 0) return { ratio: "0:1", breakEvenPct: 0 };
  const denom = pot + callAmount;
  const be = (callAmount / denom) * 100;
  const r = pot / callAmount;
  return { ratio: `${r.toFixed(1)}:1`, breakEvenPct: Math.round(be * 10) / 10 };
}
