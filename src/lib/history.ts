import type { AnalysisResult, HistoryItem } from "./types";

const STORAGE_KEY = "qa_finder_history_v1";
const MAX_ITEMS = 50;

function isValidItem(item: unknown): item is HistoryItem {
  if (!item || typeof item !== "object") return false;
  const it = item as Record<string, unknown>;
  return (
    typeof it.id === "string" &&
    typeof it.createdAt === "number" &&
    typeof it.title === "string" &&
    !!it.result &&
    typeof it.result === "object"
  );
}

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidItem).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function persistHistory(items: HistoryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // storage full or unavailable (private mode) — history just won't persist
  }
}

export function makeHistoryItem(result: AnalysisResult): HistoryItem {
  const base = result.question.trim();
  const title =
    base.length === 0 ? "Unclear question" : base.length > 44 ? `${base.slice(0, 44).trimEnd()}…` : base;
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
    title,
    result,
  };
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
