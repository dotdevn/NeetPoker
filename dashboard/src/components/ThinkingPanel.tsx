import { useState } from "react";
import { brandImageForAgent } from "../brands";

type ThinkingEntry = {
  agentId: string;
  reasoning: string;
  decision?: {
    action: string;
    amount: number | null;
    reasoning: string;
  };
};

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    fold: "bg-red-500/20 text-red-400 border-red-500/30",
    check: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    call: "bg-green-500/20 text-green-400 border-green-500/30",
    raise: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };
  const color = colors[action.toLowerCase()] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase border ${color}`}>
      {action}
    </span>
  );
}

export function ThinkingPanel(props: {
  entries: ThinkingEntry[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden px-2 pb-2">
      <div className="shrink-0 border-t border-white/10 pt-2 text-xs uppercase text-white/40">
        Agent thinking
      </div>
      <div className="mt-2 min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <div className="grid min-w-0 gap-2 md:grid-cols-3">
          {props.entries.map((e, i) => {
            const isExpanded = expanded === `${e.agentId}-${i}`;
            const hasDecision = e.decision !== undefined;
            return (
              <div
                key={`${e.agentId}-${i}`}
                className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-black/40"
              >
                <div
                  className="p-2 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : `${e.agentId}-${i}`)}
                >
                  <div className="flex items-center gap-2 font-mono text-stack text-xs">
                    <img
                      src={brandImageForAgent(e.agentId)}
                      alt=""
                      className="h-5 w-5 shrink-0 rounded object-contain"
                    />
                    <span className="min-w-0 truncate">[{e.agentId}]</span>
                    {hasDecision && e.decision && <ActionBadge action={e.decision.action} />}
                  </div>
                  {hasDecision && e.decision && e.decision.amount !== null && (
                    <div className="mt-1 text-xs font-mono text-white/60">
                      Amount: ${e.decision.amount.toFixed(2)}
                    </div>
                  )}
                  <p className="mt-1 overflow-hidden text-sm leading-snug text-white/80 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] [overflow-wrap:anywhere]">
                    {e.reasoning}
                  </p>
                </div>
                {isExpanded && hasDecision && e.decision && (
                  <div className="px-2 pb-2 border-t border-white/10 pt-2">
                    <div className="text-xs font-mono text-white/60 space-y-1">
                      <div>
                        <span className="text-white/40">Action:</span> {e.decision.action}
                      </div>
                      <div>
                        <span className="text-white/40">Amount:</span>{" "}
                        {e.decision.amount !== null ? `$${e.decision.amount.toFixed(2)}` : "N/A"}
                      </div>
                      <div>
                        <span className="text-white/40">Reasoning:</span>
                      </div>
                      <p className="text-white/70 text-xs leading-relaxed [overflow-wrap:anywhere]">
                        {e.decision.reasoning}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
