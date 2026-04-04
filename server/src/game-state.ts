import { WebSocket } from "ws";
import { PokerEngine } from "./poker-engine.js";
import { appConfig } from "./config.js";

export let engine = new PokerEngine(appConfig.startingStack);

let totalUsdcTransacted = 0;
let wssBroadcast: ((data: string) => void) | null = null;

export function setBroadcaster(fn: (data: string) => void): void {
  wssBroadcast = fn;
}

export function broadcast(msg: unknown): void {
  wssBroadcast?.(JSON.stringify(msg));
}

export function addTransacted(amount: number): void {
  totalUsdcTransacted += amount;
}

export function getTotalTransacted(): number {
  return totalUsdcTransacted;
}

export function resetTournament(): void {
  totalUsdcTransacted = 0;
  engine = new PokerEngine(appConfig.startingStack);
}

export type WsClient = WebSocket;
