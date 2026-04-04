import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { brandImageForAgent } from "../brands";
import { PlayingCard } from "./PlayingCard";

type LatestAction = {
  action: string;
  amount: number | null;
  timestamp: number;
};

function actionVerb(action: string): string {
  const normalized = action.toLowerCase();
  if (normalized === "allin" || normalized === "all-in") return "goes all-in";
  if (normalized === "raise") return "raises";
  if (normalized === "bet") return "bets";
  if (normalized === "call") return "calls";
  if (normalized === "check") return "checks";
  if (normalized === "fold") return "folds";
  return action;
}

function agentLabel(agentId: string): string {
  if (agentId.length === 0) return agentId;
  return agentId[0].toUpperCase() + agentId.slice(1);
}

function bubbleTone(action: LatestAction | undefined): "normal" | "high" | "allin" {
  if (!action) return "normal";
  const normalized = action.action.toLowerCase();
  if (normalized === "allin" || normalized === "all-in" || (action.amount ?? 0) >= 3) {
    return "allin";
  }
  if ((normalized === "raise" || normalized === "bet") && (action.amount ?? 0) >= 1) {
    return "high";
  }
  return "normal";
}

function actionText(agentId: string, latestAction: LatestAction): string {
  const amountText = latestAction.amount != null ? ` $${latestAction.amount.toFixed(2)}` : "";
  return `${agentLabel(agentId)} ${actionVerb(latestAction.action)}${amountText}`;
}

export function AgentSeat(props: {
  agentId: string;
  stack: number;
  folded: boolean;
  holeCards: string[];
  revealCards: boolean;
  isRoundStarter?: boolean;
  latestAction?: LatestAction;
}) {
  const [display, setDisplay] = useState(props.stack);
  const [visibleAction, setVisibleAction] = useState<LatestAction | undefined>(props.latestAction);

  useEffect(() => {
    setDisplay(props.stack);
  }, [props.stack]);

  useEffect(() => {
    if (!props.latestAction) return;
    setVisibleAction(props.latestAction);
    const timeout = setTimeout(() => {
      setVisibleAction((current) => {
        if (!current || current.timestamp !== props.latestAction?.timestamp) return current;
        return undefined;
      });
    }, 3000);
    return () => clearTimeout(timeout);
  }, [props.latestAction]);

  const src = brandImageForAgent(props.agentId);
  const tone = bubbleTone(visibleAction);
  const bubbleClassName =
    tone === "allin"
      ? "animate-pulse rounded-xl border-2 border-fuchsia-300/80 bg-black/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-[0_0_26px_rgba(255,0,180,0.85)]"
      : tone === "high"
        ? "animate-pulse rounded-xl border border-cyan-300/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white"
        : "rounded-xl border border-emerald-300/40 bg-black/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-100";
  const bubbleStyle =
    tone === "normal"
      ? undefined
      : {
          background: "linear-gradient(135deg, #ff007f, #a855f7, #00f0ff)",
          textShadow: "0 0 8px #ff00ff",
          boxShadow:
            tone === "allin" ? "0 0 30px rgba(236, 72, 153, 0.95)" : "0 0 18px rgba(56, 189, 248, 0.85)",
        };

  return (
    <div className="relative">
      <AnimatePresence>
        {visibleAction ? (
          <motion.div
            key={visibleAction.timestamp}
            initial={{ opacity: 0, y: 10, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: tone === "allin" ? 1.08 : 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.9 }}
            transition={{ duration: 0.24 }}
            className="pointer-events-none absolute -top-14 left-1/2 z-20 -translate-x-1/2"
          >
            <div className={bubbleClassName} style={bubbleStyle}>
              {actionText(props.agentId, visibleAction)}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {props.isRoundStarter ? (
        <span
          title="Round starter (small blind auto-bet)"
          className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[55%]"
        >
          <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/80 bg-amber-400/15 text-[11px] leading-none text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.55)]">
            <span className="absolute inset-0 rounded-full border border-amber-100/40" />
            <span className="relative">★</span>
          </span>
        </span>
      ) : null}
      <div
        className={`flex w-[140px] flex-col items-center gap-1.5 rounded-md border p-2.5 text-center backdrop-blur-sm ${
          props.folded
            ? "opacity-45 grayscale border-white/10 bg-black/20"
            : "border-white/20 bg-black/25 shadow-[0_0_14px_rgba(34,197,94,0.25)]"
        }`}
      >
        <img src={src} alt="" className="h-10 w-10 object-contain" />
        <span className="text-[11px] text-white/80 uppercase">{props.agentId}</span>
        <motion.span
          className="font-mono text-base text-stack"
          key={display}
          initial={{ scale: 1.05 }}
          animate={{ scale: 1 }}
        >
          ${display.toFixed(2)}
        </motion.span>
        <div className="mt-1 flex gap-2">
          <PlayingCard
            cardCode={props.holeCards[0]}
            faceDown={!props.revealCards}
            className="h-[78px] w-[56px]"
          />
          <PlayingCard
            cardCode={props.holeCards[1]}
            faceDown={!props.revealCards}
            className="h-[78px] w-[56px]"
          />
        </div>
      </div>
    </div>
  );
}
