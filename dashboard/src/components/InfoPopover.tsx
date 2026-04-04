"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, Github, MessageSquare, X, Cpu, DollarSign, Users, Zap as ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";
import { usePlaySound } from "@/components/ui/sensory-ui/config/use-play-sound";
import { API_URL, REPO_URL } from "../api";

const INFO_ITEMS = [
  { icon: Users, label: "6 AI agents", detail: "GPT · Claude · Gemini · Grok · Mistral · DeepSeek" },
  { icon: DollarSign, label: "$10 buy-in", detail: "Real USDC on Base Sepolia via x402" },
  { icon: Cpu, label: "Identical prompts", detail: "Same instructions, different model reasoning" },
  { icon: ZapIcon, label: "Monte Carlo equity", detail: "500-sim hand strength evaluation per decision" },
];

type FeedbackInboxItem = {
  id: string;
  text: string;
  createdAt: string;
};

function formatFeedbackTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InfoPopover() {
  const [open, setOpen] = React.useState(false);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [feedbackText, setFeedbackText] = React.useState("");
  const [feedbackSent, setFeedbackSent] = React.useState(false);
  const [feedbackSending, setFeedbackSending] = React.useState(false);
  const [feedbackError, setFeedbackError] = React.useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = React.useState(false);
  const [inboxToken, setInboxToken] = React.useState("");
  const [inboxItems, setInboxItems] = React.useState<FeedbackInboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = React.useState(false);
  const [inboxError, setInboxError] = React.useState<string | null>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const { play: playOpen } = usePlaySound({ sound: "overlay.open", volume: 1 });
  const { play: playClose } = usePlaySound({ sound: "overlay.close", volume: 1 });
  const { play: playConfirm } = usePlaySound({ sound: "interaction.confirm", volume: 1 });
  const { play: playTap } = usePlaySound({ sound: "interaction.tap", volume: 1 });

  // Click-outside to close
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFeedbackOpen(false);
        setInboxOpen(false);
        playClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, playClose]);

  const handleSendFeedback = async () => {
    const text = feedbackText.trim();
    if (!text || feedbackSending) return;
    setFeedbackSending(true);
    setFeedbackError(null);
    try {
      const response = await fetch(`${API_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to send feedback");
      }
      playConfirm();
      setFeedbackSent(true);
      setFeedbackText("");
      setTimeout(() => {
        setFeedbackSent(false);
        setFeedbackOpen(false);
      }, 1800);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Failed to send feedback");
    } finally {
      setFeedbackSending(false);
    }
  };

  const handleLoadInbox = async () => {
    const token = inboxToken.trim();
    if (!token || inboxLoading) return;
    setInboxLoading(true);
    setInboxError(null);
    try {
      const response = await fetch(`${API_URL}/admin/feedback?limit=100`, {
        headers: { "X-Admin-Token": token },
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        items?: FeedbackInboxItem[];
      };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "Failed to load inbox");
      }
      setInboxItems(Array.isArray(body.items) ? body.items : []);
      playConfirm();
    } catch (err) {
      setInboxError(err instanceof Error ? err.message : "Failed to load inbox");
    } finally {
      setInboxLoading(false);
    }
  };

  const openInboxPopup = () => {
    setInboxOpen(true);
    setFeedbackOpen(false);
    setInboxError(null);
    setInboxToken("");
    setInboxItems([]);
    playTap();
  };

  const closeInboxPopup = () => {
    setInboxOpen(false);
    setInboxError(null);
    setInboxToken("");
    playClose();
  };

  const handleInboxTokenKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void handleLoadInbox();
  };

  return (
    <div ref={popoverRef} className="relative inline-flex items-center gap-2">
      {/* ? Button */}
      <Button
        type="button"
        sound="interaction.tap"
        volume={1}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) playOpen();
          else {
            playClose();
            setFeedbackOpen(false);
            setInboxOpen(false);
          }
        }}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-200 ${
          open
            ? "border-amber-400/50 bg-amber-400/15 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
            : "border-white/15 bg-white/[0.03] text-white/50 hover:border-amber-300/40 hover:bg-amber-400/10 hover:text-amber-200 hover:shadow-[0_0_10px_rgba(245,158,11,0.15)] hover:scale-110"
        }`}
        aria-label="About NeetPoker"
        id="info-help-btn"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      {/* GitHub icon */}
      <Button
        type="button"
        sound="interaction.tap"
        volume={1}
        onClick={() => {
          playTap();
          window.open(REPO_URL, "_blank");
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] text-white/50 transition-all duration-200 hover:border-white/40 hover:bg-white/10 hover:text-white hover:shadow-[0_0_10px_rgba(255,255,255,0.08)] hover:scale-110"
        aria-label="GitHub Repository"
        id="github-link-btn"
      >
        <Github className="h-4 w-4" />
      </Button>

      {/* Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="absolute left-0 top-full z-50 mt-2 w-[300px] origin-top-left rounded-xl border border-white/10 bg-[#0e0e0e]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
            id="info-popover-panel"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
              <span className="font-mono text-xs font-semibold tracking-tight text-white/80">
                HOW IT WORKS
              </span>
              <Button
                type="button"
                sound="overlay.close"
                volume={1}
                onClick={() => {
                  setOpen(false);
                  setFeedbackOpen(false);
                  setInboxOpen(false);
                  playClose();
                }}
                className="rounded-md p-0.5 text-white/30 transition hover:bg-white/5 hover:text-white/60"
                aria-label="Close"
                id="info-close-btn"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            {/* Info items */}
            <div className="px-3 py-2 space-y-1.5">
              {INFO_ITEMS.map((item) => (
                <div key={item.label} className="flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition hover:bg-white/[0.02]">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-400/8">
                    <item.icon className="h-3 w-3 text-amber-400/70" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-semibold text-white/70">{item.label}</div>
                    <div className="font-mono text-[10px] leading-relaxed text-white/35">{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-white/6" />

            {/* Suggestion section */}
            <div className="px-3 py-2">
              {!feedbackOpen ? (
                <Button
                  type="button"
                  sound="interaction.tap"
                  volume={1}
                  onClick={() => {
                    setFeedbackOpen(true);
                    setInboxOpen(false);
                    setFeedbackError(null);
                    playTap();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.03]"
                  id="feedback-open-btn"
                >
                  <MessageSquare className="h-3 w-3 text-white/30" />
                  <span className="font-mono text-[10px] text-white/40">
                    Suggestions? Send a private note to the host.
                  </span>
                </Button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  {feedbackSent ? (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center justify-center gap-1.5 py-3 font-mono text-[11px] text-emerald-400/80"
                    >
                      <span>✓</span> Sent privately. Thank you!
                    </motion.div>
                  ) : (
                    <>
                      <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="What would make NeetPoker better?"
                        className="w-full resize-none rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 font-mono text-[11px] text-white/70 placeholder:text-white/20 outline-none transition focus:border-amber-300/30"
                        rows={3}
                        autoFocus
                        id="feedback-textarea"
                      />
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button"
                          sound="overlay.close"
                          volume={1}
                          onClick={() => {
                            setFeedbackOpen(false);
                            setFeedbackError(null);
                            playClose();
                          }}
                          className="rounded border border-white/10 px-2 py-0.5 font-mono text-[10px] text-white/40 transition hover:bg-white/5 hover:text-white/60"
                          id="feedback-cancel-btn"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          sound="interaction.confirm"
                          volume={1}
                          onClick={handleSendFeedback}
                          disabled={!feedbackText.trim() || feedbackSending}
                          className="rounded border border-amber-300/30 bg-amber-400/5 px-2 py-0.5 font-mono text-[10px] text-amber-300/80 transition hover:bg-amber-400/10 hover:text-amber-200 disabled:opacity-30 disabled:pointer-events-none"
                          id="feedback-send-btn"
                        >
                          {feedbackSending ? "Sending..." : "Send"}
                        </Button>
                      </div>
                      {feedbackError ? (
                        <p className="font-mono text-[10px] text-rose-300/75">{feedbackError}</p>
                      ) : null}
                    </>
                  )}
                </motion.div>
              )}

            </div>

            {/* Footer */}
            <div className="border-t border-white/4 px-4 py-1.5">
              <p className="flex items-center justify-center gap-1.5 font-mono text-[9px] text-white/20">
                <span>Built with x402</span>
                <Button
                  type="button"
                  sound="interaction.tap"
                  volume={1}
                  onClick={openInboxPopup}
                  className="mx-0 inline appearance-none border-0 bg-transparent p-0 text-[9px] leading-none text-white/20 transition hover:text-white/45 focus:outline-none"
                  aria-label="Open inbox"
                  id="feedback-inbox-dot-btn"
                >
                  ·
                </Button>
                <span>Base Sepolia · OpenRouter</span>
              </p>
            </div>

            <AnimatePresence>
              {inboxOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  className="absolute bottom-8 left-1/2 z-10 w-[260px] -translate-x-1/2 space-y-2 rounded-lg border border-white/10 bg-[#0b0b0b]/95 p-2 shadow-xl shadow-black/60 backdrop-blur-xl"
                  id="feedback-inbox-popup"
                >
                  <input
                    type="password"
                    value={inboxToken}
                    onChange={(e) => setInboxToken(e.target.value)}
                    onKeyDown={handleInboxTokenKeyDown}
                    placeholder="Token"
                    autoComplete="new-password"
                    className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/70 placeholder:text-white/20 outline-none transition focus:border-amber-300/30"
                    id="feedback-inbox-token"
                    autoFocus
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      type="button"
                      sound="overlay.close"
                      volume={1}
                      onClick={closeInboxPopup}
                      className="rounded border border-white/10 px-2 py-0.5 font-mono text-[10px] text-white/40 transition hover:bg-white/5 hover:text-white/60"
                      id="feedback-inbox-cancel-btn"
                    >
                      Close
                    </Button>
                  </div>
                  {inboxLoading ? (
                    <p className="font-mono text-[10px] text-white/45">Loading...</p>
                  ) : null}
                  {inboxError ? (
                    <p className="font-mono text-[10px] text-rose-300/75">{inboxError}</p>
                  ) : null}
                  <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                    {inboxItems.length === 0 ? (
                      <p className="font-mono text-[10px] text-white/35">No feedback entries yet.</p>
                    ) : (
                      inboxItems.map((item) => (
                        <div key={item.id} className="rounded border border-white/8 bg-black/40 px-2 py-1.5">
                          <p className="font-mono text-[10px] leading-relaxed text-white/75">{item.text}</p>
                          <p className="mt-1 font-mono text-[9px] text-white/35">
                            {formatFeedbackTime(item.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
