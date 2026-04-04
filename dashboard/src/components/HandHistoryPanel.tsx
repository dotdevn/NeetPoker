import * as React from "react";
import type { HandHistoryEntry } from "../hooks/useGameSocket";
import { brandImageForAgent } from "../brands";
import { PlayingCard } from "./PlayingCard";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatUsd(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function confidenceTone(confidence: number | null | undefined) {
  if (confidence == null) {
    return {
      bar: "bg-white/25",
      badge: "border-white/20 text-white/70",
    };
  }
  if (confidence > 70) {
    return {
      bar: "bg-emerald-500",
      badge: "border-emerald-400/50 text-emerald-200",
    };
  }
  if (confidence >= 40) {
    return {
      bar: "bg-amber-400",
      badge: "border-amber-400/50 text-amber-200",
    };
  }
  return {
    bar: "bg-rose-500",
    badge: "border-rose-400/50 text-rose-200",
  };
}

function decisionLabel(action?: string, amount?: number | null) {
  if (!action) return "PENDING";
  const upper = action.toUpperCase();
  return amount != null ? `${upper} ${formatUsd(amount)}` : upper;
}

function compactReasoning(text: string, max = 120) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export function HandHistoryPanel(props: {
  hands: HandHistoryEntry[];
  selectedHandNumber: number | null;
  onSelectHand: (handNumber: number) => void;
}) {
  const selected =
    props.hands.find((hand) => hand.handNumber === props.selectedHandNumber) ?? props.hands[0] ?? null;

  const thinking = React.useMemo(
    () => (selected ? [...selected.thinking].reverse() : []),
    [selected],
  );
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const hintTimeoutRef = React.useRef<number | null>(null);
  const hintTimerStartedRef = React.useRef(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const [hasUserScrolled, setHasUserScrolled] = React.useState(false);
  const [showInitialHint, setShowInitialHint] = React.useState(true);
  const showScrollHint = canScrollRight && !hasUserScrolled && showInitialHint;

  React.useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const epsilon = 2;
    const updateScrollHintState = () => {
      const hasOverflow = node.scrollWidth - node.clientWidth > epsilon;
      const hasHiddenRightContent = node.scrollLeft < node.scrollWidth - node.clientWidth - epsilon;
      setCanScrollRight(hasOverflow && hasHiddenRightContent);

      if (node.scrollLeft > epsilon) {
        setHasUserScrolled(true);
        setShowInitialHint(false);
        if (hintTimeoutRef.current != null) {
          window.clearTimeout(hintTimeoutRef.current);
          hintTimeoutRef.current = null;
        }
      }
    };

    updateScrollHintState();
    node.addEventListener("scroll", updateScrollHintState, { passive: true });

    const observer = new ResizeObserver(updateScrollHintState);
    observer.observe(node);
    const content = node.firstElementChild;
    if (content instanceof HTMLElement) observer.observe(content);

    return () => {
      node.removeEventListener("scroll", updateScrollHintState);
      observer.disconnect();
    };
  }, []);

  React.useEffect(() => {
    if (!showInitialHint || hasUserScrolled || !canScrollRight || hintTimerStartedRef.current) return;
    hintTimerStartedRef.current = true;
    hintTimeoutRef.current = window.setTimeout(() => {
      setShowInitialHint(false);
      hintTimeoutRef.current = null;
    }, 4000);
  }, [showInitialHint, hasUserScrolled, canScrollRight]);

  React.useEffect(
    () => () => {
      if (hintTimeoutRef.current != null) window.clearTimeout(hintTimeoutRef.current);
    },
    [],
  );

  return (
    <section className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-lg bg-black/30 font-mono text-xs">
      {selected ? (
        <>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-1">
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded border border-white/10 bg-black/35">
              <div className="relative min-h-0 min-w-0 flex-1">
                <div
                  ref={scrollContainerRef}
                  className="min-h-0 min-w-0 h-full overflow-x-auto overflow-y-hidden px-2 py-1"
                >
                  <div className="flex h-full min-h-0 min-w-max items-stretch gap-2">
                    {thinking.slice(0, 20).map((entry, idx) => {
                      const confidence = entry.decision?.confidence ?? null;
                      const confidencePct =
                        confidence == null ? null : Math.max(0, Math.min(100, confidence));
                      const tone = confidenceTone(confidencePct);
                      return (
                        <article
                          key={`${entry.agentId}-${idx}`}
                          className="flex h-full w-[220px] shrink-0 flex-col overflow-hidden rounded border border-white/10 bg-white/[0.03] p-2"
                        >
                          <div className="flex items-center gap-2 text-amber-200/90">
                            <img
                              src={brandImageForAgent(entry.agentId)}
                              alt=""
                              className="h-4 w-4 rounded object-contain"
                            />
                            <span className="truncate">{entry.agentId}</span>
                            {entry.decision ? (
                              <span className="ml-auto rounded border border-white/20 px-1 text-[10px] uppercase text-white/70">
                                {decisionLabel(entry.decision.action, entry.decision.amount)}
                              </span>
                            ) : null}
                          </div>

                          {entry.context ? (
                            <div className="mt-2 flex items-center gap-1.5">
                              {entry.context.holeCards.map((card, cardIndex) => (
                                <PlayingCard
                                  key={`${entry.agentId}-${idx}-hole-${cardIndex}`}
                                  cardCode={card}
                                  className="h-[48px] w-[34px]"
                                />
                              ))}
                              <div className="ml-1 text-[10px] text-white/60">
                                Eq {entry.context.equity.toFixed(0)}% · {entry.context.potOdds.ratio}
                              </div>
                            </div>
                          ) : null}

                          <p className="mt-2 text-[11px] leading-snug text-white/75 [overflow-wrap:anywhere]">
                            {compactReasoning(entry.reasoning)}
                          </p>

                          <div className="mt-auto pt-2">
                            <div className="h-1.5 w-full rounded bg-white/10">
                              <div
                                className={`h-full rounded ${tone.bar}`}
                                style={{ width: `${confidencePct ?? 0}%` }}
                              />
                            </div>
                            <div className="mt-1 text-[10px] text-white/45">
                              Confidence {confidencePct == null ? "N/A" : `${confidencePct}%`}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    {thinking.length === 0 && <p className="self-center text-white/35">No thinking entries.</p>}
                  </div>
                </div>
                {showScrollHint ? (
                  <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center pr-2">
                    <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-black/80 via-black/35 to-transparent" />
                    <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-300/50 bg-black/55 text-sm text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.35)] animate-pulse">
                      →
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-white/35">
          Start the game to populate hand history.
        </div>
      )}
    </section>
  );
}
