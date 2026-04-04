import * as React from "react";
import { motion } from "framer-motion";
import { AlertCircle, Check, Copy } from "lucide-react";
import { usePlaySound } from "@/components/ui/sensory-ui/config/use-play-sound";
import type { TransactionEntry } from "../hooks/useGameSocket";
import { formatHandTransactionsMarkdown } from "../lib/handClipboard";

export function TransactionFeed(props: {
  items: TransactionEntry[];
  handNumber: number | null;
}) {
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "failed">("idle");
  const resetTimerRef = React.useRef<number | null>(null);
  const { play: playTapSound } = usePlaySound({ sound: "interaction.subtle", volume: 0.9 });
  const { play: playSuccessSound } = usePlaySound({ sound: "notification.success", volume: 0.75 });
  const { play: playFailedSound } = usePlaySound({ sound: "notification.error", volume: 0.75 });

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const displayItems = React.useMemo(() => [...props.items].reverse(), [props.items]);

  const setCopyStateTemporarily = React.useCallback((state: "copied" | "failed") => {
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
    setCopyState(state);
    resetTimerRef.current = window.setTimeout(() => setCopyState("idle"), 1500);
  }, []);

  const handleCopy = React.useCallback(async () => {
    if (props.handNumber == null) return;
    playTapSound();
    try {
      const markdown = formatHandTransactionsMarkdown(props.handNumber, props.items);
      await navigator.clipboard.writeText(markdown);
      playSuccessSound();
      setCopyStateTemporarily("copied");
    } catch {
      playFailedSound();
      setCopyStateTemporarily("failed");
    }
  }, [props.handNumber, props.items, playTapSound, playSuccessSound, playFailedSound, setCopyStateTemporarily]);

  const copyTitle =
    copyState === "copied" ? "Copied" : copyState === "failed" ? "Failed" : "Copy hand transactions";

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/30 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-white/10 px-2 py-1">
        <span className="text-white/60">TX FEED</span>
        <button
          type="button"
          aria-label="Copy hand transactions"
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
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2">
        {displayItems.map((t) => (
          <motion.div
            key={t.id}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="min-w-0 rounded border border-white/5 bg-white/5 px-2 py-1"
          >
            <div className="break-words text-amber-200/90 [overflow-wrap:anywhere]">{t.label}</div>
            <div className="break-words text-white/50 [overflow-wrap:anywhere]">{t.amount}</div>
            {t.txHash || t.explorerUrl ? (
              <a
                href={t.explorerUrl || `https://sepolia.basescan.org/tx/${t.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-amber-300 transition-colors hover:text-amber-200"
              >
                {t.txHash ? `${t.txHash.slice(0, 6)}...${t.txHash.slice(-4)}` : "View TX"}
              </a>
            ) : null}
          </motion.div>
        ))}
      </div>
    </aside>
  );
}
