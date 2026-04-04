import type { EventLogEntry, TransactionEntry } from "../hooks/useGameSocket";

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatHandTransactionsMarkdown(
  handNumber: number,
  items: TransactionEntry[],
): string {
  const lines: string[] = [`# Hand #${handNumber} Transactions`, ""];

  if (items.length === 0) {
    lines.push("_No transactions for this hand._");
    return lines.join("\n");
  }

  for (const tx of items) {
    const parts = [
      `agent: ${tx.agentId}`,
      `label: ${compact(tx.label)}`,
      `amount: ${compact(tx.amount)}`,
      `status: ${tx.status}`,
    ];
    if (tx.txHash) parts.push(`txHash: ${tx.txHash}`);
    if (tx.explorerUrl) parts.push(`explorer: ${tx.explorerUrl}`);
    lines.push(`- ${parts.join(" | ")}`);
  }

  return lines.join("\n");
}

export function formatHandEventsMarkdown(
  handNumber: number,
  entries: EventLogEntry[],
): string {
  const lines: string[] = [`# Hand #${handNumber} Event Log`, ""];

  if (entries.length === 0) {
    lines.push("_No events for this hand._");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const actor = entry.agentId ?? "system";
    lines.push(
      `- [${formatTime(entry.at)}] ${entry.kind} · ${actor} · ${compact(entry.message)}`,
    );
  }

  return lines.join("\n");
}
