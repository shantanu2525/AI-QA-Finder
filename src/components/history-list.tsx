"use client";

import { Gauge, History, Trash2 } from "lucide-react";
import type { HistoryItem } from "@/lib/types";
import { relativeTime } from "@/lib/history";

interface HistoryListProps {
  items: HistoryItem[];
  onOpen: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

function confidenceColor(c: number): string {
  if (c >= 90) return "#3ddc97";
  if (c >= 75) return "#4fd1ff";
  if (c >= 55) return "#fbbf24";
  return "#ff6b6b";
}

export default function HistoryList({ items, onOpen, onDelete, onClear }: HistoryListProps) {
  if (items.length === 0) return null;

  return (
    <section className="anim-fade-up d3 mt-8" aria-label="History">
      <div className="flex items-center justify-between">
        <p className="section-label">
          <History className="h-3.5 w-3.5 text-accent-2" />
          History
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-bold tracking-normal text-white/50">
            {items.length}
          </span>
        </p>
        <button
          type="button"
          onClick={onClear}
          className="min-h-[44px] rounded-lg px-2 text-xs font-medium text-white/40 transition hover:text-danger"
        >
          Clear all
        </button>
      </div>

      <ul className="thin-scroll mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
        {items.map((item) => {
          const color = confidenceColor(item.result.confidence);
          return (
            <li
              key={item.id}
              className="card flex items-center gap-1 rounded-2xl p-1.5 pl-4 transition hover:border-white/20"
            >
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
                aria-label={`Open result: ${item.title}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white/85">{item.title}</span>
                  <span className="mt-0.5 block text-[11px] text-white/35">{relativeTime(item.createdAt)}</span>
                </span>
                {item.result.status === "answered" ? (
                  <span
                    className="chip shrink-0"
                    style={{ color, borderColor: `${color}44`, background: `${color}12` }}
                  >
                    <Gauge className="h-3 w-3" />
                    {item.result.confidence}%
                  </span>
                ) : (
                  <span className="chip shrink-0 text-white/45">unclear</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                aria-label={`Delete ${item.title}`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white/35 transition hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
