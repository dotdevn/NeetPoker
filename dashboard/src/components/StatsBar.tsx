import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";
import { usePlaySound } from "@/components/ui/sensory-ui/config/use-play-sound";
import { InfoPopover } from "./InfoPopover";
import { LeaderboardPopover } from "./LeaderboardPopover";
import type { HandHistoryEntry } from "../hooks/useGameSocket";
import type { GameStatePayload } from "../types";

export function StatsBar(props: {
  hands: HandHistoryEntry[];
  selectedHandNumber: number | null;
  onSelectHand: (handNumber: number) => void;
  totalTransacted: number;
  live: boolean;
  loopRunning: boolean;
  turboMode: boolean;
  paymentMode: "real" | "mock_degraded";
  gameState: GameStatePayload | null;
  onStart?: () => void;
  onToggleTurbo: () => void;
  onStop?: () => void;
}) {
  const { play: playHandSelectSound } = usePlaySound({ sound: "navigation.tab", volume: 1 });
  const hands = [...props.hands].sort((a, b) => b.handNumber - a.handNumber);
  const selectedHandNumber = props.selectedHandNumber ?? hands[0]?.handNumber ?? 0;
  const winnerSummary = (hand: HandHistoryEntry) =>
    hand.winners.map((winner) => `${winner.displayName} ($${winner.amount.toFixed(2)})`).join(", ");

  return (
    <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">NeetPoker</h1>
          <span className="text-white/40">·</span>
          <span className="text-sm font-semibold tracking-tight text-white/90">THE $10 TABLE</span>
        </div>
        <select
          value={selectedHandNumber || ""}
          onChange={(event) => {
            playHandSelectSound();
            const handNumber = Number(event.target.value);
            if (Number.isFinite(handNumber) && handNumber > 0) props.onSelectHand(handNumber);
          }}
          className="rounded border border-white/20 bg-black/50 px-2 py-1 text-sm text-white/85 outline-none transition hover:border-amber-300/50 focus:border-amber-300/70"
          aria-label="Select hand"
        >
          {hands.map((hand) => (
            <option key={hand.handNumber} value={hand.handNumber}>
              {`Hand #${hand.handNumber}${
                hand.winners.length > 0
                  ? ` · Winners ${winnerSummary(hand)}`
                  : ""
              }`}
            </option>
          ))}
          {hands.length === 0 ? <option value="">Hand #0</option> : null}
        </select>
        <motion.span
          className="hidden lg:inline-flex items-center rounded border border-amber-300/35 bg-[#0b0b08] px-2 py-1 text-[11px] text-amber-200 shadow-[0_0_14px_rgba(251,191,36,0.18)]"
          animate={{ opacity: [0.82, 1, 0.82] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="mr-1 text-amber-300">$</span>
          Bet on which AI model wins the hand. Coming soon!
        </motion.span>
        <InfoPopover />
        <LeaderboardPopover gameState={props.gameState} handHistory={props.hands} />
      </div>
      <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
        <span className="text-stack">${props.totalTransacted.toFixed(2)} total USDC (est.)</span>
        <span className="flex items-center gap-2">
          {props.live && (
            <motion.span
              className="inline-block h-2 w-2 rounded-full bg-green-500"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
            />
          )}
          LIVE
        </span>
        {props.paymentMode === "mock_degraded" ? (
          <span className="rounded border border-amber-300/60 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
            PAYMENTS: MOCK DEGRADED
          </span>
        ) : null}
        {props.onStart && (
          <Button
            type="button"
            sound="interaction.confirm"
            volume={1}
            onClick={props.onStart}
            disabled={props.loopRunning}
            className="rounded border border-emerald-500/50 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40 disabled:pointer-events-none"
          >
            START
          </Button>
        )}
        <Button
          type="button"
          sound="interaction.toggle"
          volume={1}
          onClick={props.onToggleTurbo}
          className={`rounded border px-3 py-1 text-xs transition ${
            props.turboMode
              ? "animate-pulse border-amber-300/90 text-amber-100 shadow-[0_0_18px_rgba(245,158,11,0.75)] hover:bg-amber-400/20"
              : "border-white/30 text-white/90 hover:bg-white/10"
          }`}
        >
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3.5 w-3.5" />
            {props.turboMode ? "⚡ TURBO ON" : "⚡ TURBO"}
          </span>
        </Button>
        {props.onStop && (
          <Button
            type="button"
            sound="interaction.toggle"
            volume={1}
            onClick={props.onStop}
            disabled={!props.loopRunning}
            className="rounded border border-rose-500/50 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/10 disabled:opacity-40 disabled:pointer-events-none"
          >
            STOP
          </Button>
        )}
      </div>
    </header>
  );
}
