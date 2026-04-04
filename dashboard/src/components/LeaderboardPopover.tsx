"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, X, Skull } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";
import { usePlaySound } from "@/components/ui/sensory-ui/config/use-play-sound";
import { brandImageForAgent } from "../brands";
import type { GameStatePayload } from "../types";
import type { HandHistoryEntry } from "../hooks/useGameSocket";

// ─── Agent colors for sparklines ─────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  gpt: "#10b981",
  claude: "#f59e0b",
  gemini: "#3b82f6",
  grok: "#ef4444",
  mistral: "#8b5cf6",
  deepseek: "#06b6d4",
};

function agentColor(id: string): string {
  return AGENT_COLORS[id] ?? "#6b7280";
}

function agentLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// ─── SVG Sparkline ───────────────────────────────────────────────────────────

function Sparkline({
  data,
  color,
  width = 140,
  height = 32,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.4} />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });

  const lastVal = data[data.length - 1];
  const firstVal = data[0];
  const trending = lastVal >= firstVal;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Gradient fill */}
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <polygon
        points={`${pad},${height} ${points.join(" ")} ${width - pad},${height}`}
        fill={`url(#grad-${color.replace("#", "")})`}
      />
      {/* Line */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={Number(points[points.length - 1].split(",")[0])}
        cy={Number(points[points.length - 1].split(",")[1])}
        r={2.5}
        fill={trending ? color : "#ef4444"}
        stroke="#0e0e0e"
        strokeWidth={1}
      />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LeaderboardPopover({
  gameState,
  handHistory,
}: {
  gameState: GameStatePayload | null;
  handHistory: HandHistoryEntry[];
}) {
  const [open, setOpen] = React.useState(false);
  const [hoveredAgent, setHoveredAgent] = React.useState<string | null>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const { play: playOpen } = usePlaySound({ sound: "overlay.open", volume: 1 });
  const { play: playClose } = usePlaySound({ sound: "overlay.close", volume: 1 });
  const { play: playHover } = usePlaySound({ sound: "interaction.subtle", volume: 0.7 });

  // Click-outside to close
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
        playClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, playClose]);

  // Build balance history from hand results + current state
  const agentData = React.useMemo(() => {
    const agents = gameState?.seatOrder ?? ["gpt", "claude", "gemini", "grok", "mistral", "deepseek"];
    const startingStack = 10; // from config

    // Sort hands chronologically
    const sortedHands = [...handHistory].sort((a, b) => a.handNumber - b.handNumber);

    // Build balance snapshots per agent per hand
    const balanceHistory: Record<string, number[]> = {};
    for (const id of agents) {
      balanceHistory[id] = [startingStack];
    }

    // We don't have per-hand stacks directly, but we can use the gameState stacks from actions
    // For now, track from hand_result winners and work backwards
    // Simpler approach: use current stacks + build history from transactions
    for (const hand of sortedHands) {
      // After each hand, we can estimate stacks from transaction amounts
      // But the most accurate is the live gameState.stacks
      for (const id of agents) {
        const prev = balanceHistory[id][balanceHistory[id].length - 1];
        // Check if this agent won or lost in this hand
        const winAmount = hand.winners.find((w) => w.agentId === id)?.amount ?? 0;
        // Estimate: winners gain, everyone else who played loses their contributions
        // This is approximate — for truly accurate we'd need per-hand stack snapshots
        if (winAmount > 0) {
          balanceHistory[id].push(prev + winAmount * 0.3); // approximate gain
        } else if (hand.transactions.some((t) => t.agentId === id)) {
          // They participated but didn't win
          const txTotal = hand.transactions
            .filter((t) => t.agentId === id)
            .reduce((sum, t) => {
              const match = t.amount.match(/\$([0-9.]+)/);
              return sum + (match ? parseFloat(match[1]) : 0);
            }, 0);
          balanceHistory[id].push(Math.max(0, prev - txTotal * 0.5)); // approximate loss
        } else {
          balanceHistory[id].push(prev);
        }
      }
    }

    // Override the last point with actual live stacks
    const liveStacks = gameState?.stacks ?? {};
    for (const id of agents) {
      if (typeof liveStacks[id] === "number") {
        balanceHistory[id][balanceHistory[id].length - 1] = liveStacks[id];
      }
    }

    // Find elimination hand
    const eliminatedAt: Record<string, number | null> = {};
    for (const id of agents) {
      const stack = typeof liveStacks[id] === "number" ? liveStacks[id] : 0;
      if (stack <= 0 && sortedHands.length > 0) {
        // Find which hand they went to 0
        for (const hand of [...sortedHands].reverse()) {
          const hadTx = hand.transactions.some((t) => t.agentId === id);
          if (hadTx) {
            eliminatedAt[id] = hand.handNumber;
            break;
          }
        }
        if (!eliminatedAt[id]) {
          eliminatedAt[id] = sortedHands[sortedHands.length - 1]?.handNumber ?? null;
        }
      } else {
        eliminatedAt[id] = null;
      }
    }

    return agents
      .map((id) => ({
        id,
        label: agentLabel(id),
        stack: typeof liveStacks[id] === "number" ? liveStacks[id] : 0,
        color: agentColor(id),
        history: balanceHistory[id],
        eliminatedAt: eliminatedAt[id],
        src: brandImageForAgent(id),
      }))
      .sort((a, b) => b.stack - a.stack);
  }, [gameState, handHistory]);

  return (
    <div ref={popoverRef} className="relative">
      {/* Leaderboard Button */}
      <Button
        type="button"
        sound="interaction.tap"
        volume={1}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) playOpen();
          else playClose();
        }}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-200 ${
          open
            ? "border-amber-400/50 bg-amber-400/15 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
            : "border-white/15 bg-white/[0.03] text-white/50 hover:border-amber-300/40 hover:bg-amber-400/10 hover:text-amber-200 hover:shadow-[0_0_10px_rgba(245,158,11,0.15)] hover:scale-110"
        }`}
        aria-label="Leaderboard"
        id="leaderboard-btn"
      >
        <Trophy className="h-4 w-4" />
      </Button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="absolute right-0 top-full z-50 mt-2 w-[360px] origin-top-right rounded-xl border border-white/10 bg-[#0e0e0e]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
            id="leaderboard-panel"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-mono text-xs font-semibold tracking-tight text-white/80">
                  LEADERBOARD
                </span>
              </div>
              <Button
                type="button"
                sound="overlay.close"
                volume={1}
                onClick={() => { setOpen(false); playClose(); }}
                className="rounded-md p-0.5 text-white/30 transition hover:bg-white/5 hover:text-white/60"
                aria-label="Close"
                id="leaderboard-close-btn"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            {/* Agent rows */}
            <div className="max-h-[50vh] overflow-y-auto px-1 py-1">
              {agentData.map((agent, idx) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  onMouseEnter={() => {
                    setHoveredAgent(agent.id);
                    playHover();
                  }}
                  onMouseLeave={() => setHoveredAgent(null)}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-150 ${
                    hoveredAgent === agent.id
                      ? "bg-white/[0.04]"
                      : "hover:bg-white/[0.02]"
                  } ${agent.stack <= 0 ? "opacity-50" : ""}`}
                >
                  {/* Rank */}
                  <span className={`w-4 text-center font-mono text-[10px] font-bold ${
                    idx === 0 ? "text-amber-400" : idx === 1 ? "text-white/50" : idx === 2 ? "text-amber-700" : "text-white/25"
                  }`}>
                    {idx + 1}
                  </span>

                  {/* Avatar */}
                  <img
                    src={agent.src}
                    alt=""
                    className={`h-6 w-6 rounded-md object-contain ${agent.stack <= 0 ? "grayscale" : ""}`}
                  />

                  {/* Name + status */}
                  <div className="min-w-0 flex-shrink-0 w-[60px]">
                    <div className="font-mono text-[11px] font-semibold text-white/80 truncate">
                      {agent.label}
                    </div>
                    {agent.stack <= 0 && agent.eliminatedAt != null ? (
                      <div className="flex items-center gap-0.5 font-mono text-[9px] text-rose-400/70">
                        <Skull className="h-2.5 w-2.5" />
                        <span>Hand #{agent.eliminatedAt}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Sparkline */}
                  <div className="flex-1 min-w-0">
                    <Sparkline
                      data={agent.history}
                      color={agent.color}
                      width={140}
                      height={28}
                    />
                  </div>

                  {/* Balance */}
                  <motion.span
                    key={agent.stack}
                    initial={{ scale: 1.05, opacity: 0.7 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`w-[52px] text-right font-mono text-xs font-semibold tabular-nums ${
                      agent.stack <= 0
                        ? "text-rose-400/70"
                        : agent.stack >= 10
                          ? "text-emerald-400"
                          : "text-white/70"
                    }`}
                  >
                    ${agent.stack.toFixed(2)}
                  </motion.span>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-white/6 px-4 py-1.5">
              <p className="font-mono text-[9px] text-white/20">
                Live balances · Updated each hand
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
