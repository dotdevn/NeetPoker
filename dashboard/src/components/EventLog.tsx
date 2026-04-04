import * as React from "react";
import { AlertCircle, Check, Copy } from "lucide-react";
import { usePlaySound } from "@/components/ui/sensory-ui/config/use-play-sound";
import type { EventLogEntry } from "../hooks/useGameSocket";
import { brandImageForAgent } from "../brands";
import { formatHandEventsMarkdown } from "../lib/handClipboard";

const PAGE_SIZE = 14;

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function EventLog(props: { entries: EventLogEntry[]; handNumber: number | null }) {
  const [page, setPage] = React.useState(1);
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "failed">("idle");
  const resetTimerRef = React.useRef<number | null>(null);
  const { play: playTapSound } = usePlaySound({ sound: "interaction.subtle", volume: 0.9 });
  const { play: playSuccessSound } = usePlaySound({ sound: "notification.success", volume: 0.75 });
  const { play: playFailedSound } = usePlaySound({ sound: "notification.error", volume: 0.75 });

  /** Newest first so page 1 shows the latest lines (otherwise page 1 felt "stuck" on old timestamps). */
  const ordered = React.useMemo(() => [...props.entries].reverse(), [props.entries]);

  const total = ordered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  React.useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const start = (page - 1) * PAGE_SIZE;
  const slice = ordered.slice(start, start + PAGE_SIZE);

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const setCopyStateTemporarily = React.useCallback((state: "copied" | "failed") => {
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
    setCopyState(state);
    resetTimerRef.current = window.setTimeout(() => setCopyState("idle"), 1500);
  }, []);

  const handleCopy = React.useCallback(async () => {
    if (props.handNumber == null) return;
    playTapSound();
    try {
      const markdown = formatHandEventsMarkdown(props.handNumber, props.entries);
      await navigator.clipboard.writeText(markdown);
      playSuccessSound();
      setCopyStateTemporarily("copied");
    } catch {
      playFailedSound();
      setCopyStateTemporarily("failed");
    }
  }, [props.handNumber, props.entries, playTapSound, playSuccessSound, playFailedSound, setCopyStateTemporarily]);

  const copyTitle = copyState === "copied" ? "Copied" : copyState === "failed" ? "Failed" : "Copy hand events";

  const pageButtons = React.useMemo(() => {
    const maxShown = 5;
    if (totalPages <= maxShown) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const half = Math.floor(maxShown / 2);
    let from = Math.max(1, page - half);
    let to = Math.min(totalPages, from + maxShown - 1);
    if (to - from < maxShown - 1) from = Math.max(1, to - maxShown + 1);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [totalPages, page]);

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/30 font-mono text-xs">
      <div className="shrink-0 flex items-center justify-between border-b border-white/10 px-2 py-1">
        <span className="text-white/60">EVENT LOG</span>
        <button
          type="button"
          aria-label="Copy hand events"
          title={copyTitle}
          onClick={handleCopy}
          disabled={props.handNumber == null}
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-white/10 text-white/50 transition hover:border-white/20 hover:text-white/80 disabled:opacity-35 disabled:cursor-not-allowed"
        >
          {copyState === "copied" ? (
            <Check className="h-3.5 w-3.5" />
          ) : copyState === "failed" ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
        <ul className="space-y-2">
          {slice.map((e) => (
            <li
              key={e.id}
              className="flex gap-2 rounded border border-white/5 bg-white/[0.03] px-2 py-1.5 text-white/85"
            >
              <span className="shrink-0 text-[10px] text-white/35">{formatTime(e.at)}</span>
              {e.agentId ? (
                <img
                  src={brandImageForAgent(e.agentId)}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded object-contain"
                />
              ) : (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/10 text-[9px] text-white/50">
                  ·
                </span>
              )}
              <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                <span className="text-amber-200/85">
                  {e.kind === "system" ? "system" : e.agentId ?? "—"}
                </span>
                <span className="text-white/40"> · </span>
                <span className="text-white/75">{e.message}</span>
                {e.txHash || e.explorerUrl ? (
                  <div className="mt-1">
                    <a
                      href={e.explorerUrl || `https://sepolia.basescan.org/tx/${e.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-[10px] text-amber-300 transition-colors hover:text-amber-200"
                    >
                      {e.txHash ? `View TX ${e.txHash.slice(0, 10)}...` : "View TX"}
                    </a>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {total === 0 && <p className="text-white/35">No events yet.</p>}
      </div>
      <div className="shrink-0 border-t border-white/10 px-2 py-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-white/15 px-2 py-0.5 text-white/70 disabled:opacity-30"
          >
            Prev
          </button>
          <div className="flex flex-wrap items-center gap-1">
            {pageButtons.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`min-w-[1.75rem] rounded px-1.5 py-0.5 ${
                  n === page ? "bg-white/15 text-amber-200" : "text-white/50 hover:bg-white/10"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-white/15 px-2 py-0.5 text-white/70 disabled:opacity-30"
          >
            Next
          </button>
        </div>
        <div className="mt-1 text-center text-[10px] text-white/40">
          Newest first · Page {page} of {totalPages} · {total} events
        </div>
      </div>
    </section>
  );
}
