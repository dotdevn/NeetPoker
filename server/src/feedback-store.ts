import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { appConfig } from "./config.js";

export type FeedbackEntry = {
  id: string;
  text: string;
  createdAt: string;
};

let ensureStoreDirPromise: Promise<void> | null = null;

async function ensureStoreDir(): Promise<void> {
  if (!ensureStoreDirPromise) {
    ensureStoreDirPromise = mkdir(dirname(appConfig.feedbackStorePath), { recursive: true }).then(() => {});
  }
  await ensureStoreDirPromise;
}

export async function addFeedbackEntry(text: string): Promise<FeedbackEntry> {
  await ensureStoreDir();
  
  const sanitized = String(text)
    // Remove null bytes and control characters
    .replace(/[\x00-\x1F\x7F]/g, "")
    // Ensure no newlines leak through to break the JSONL format
    .replace(/[\r\n\u2028\u2029]/g, " ")
    .trim()
    .slice(0, 1000);
    
  if (!sanitized) {
    throw new Error("Feedback text cannot be empty or solely contain control characters.");
  }

  const entry: FeedbackEntry = {
    id: randomUUID(),
    text: sanitized,
    createdAt: new Date().toISOString(),
  };
  await appendFile(appConfig.feedbackStorePath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export async function listFeedbackEntries(limit = 100): Promise<FeedbackEntry[]> {
  const max = Math.max(1, Math.min(500, Math.floor(limit)));
  try {
    const raw = await readFile(appConfig.feedbackStorePath, "utf8");
    const entries = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as FeedbackEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is FeedbackEntry => Boolean(entry));
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return entries.slice(0, max);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
}
