"use client";

import { useEffect, useState } from "react";
import { Check, Gauge, ListChecks, ScanSearch } from "lucide-react";

const STEPS = [
  { icon: ScanSearch, label: "Reading question" },
  { icon: ListChecks, label: "Finding answer" },
  { icon: Gauge, label: "Calculating confidence" },
];

export default function AnalyzingLoader({ imageUrl }: { imageUrl: string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCurrent((c) => Math.min(c + 1, STEPS.length - 1));
    }, 1100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="anim-fade-up card mt-4 p-5" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        <p className="font-display text-base font-semibold">
          Analyzing
          <span className="animate-pulse">…</span>
        </p>
      </div>

      <div className="dotgrid relative mt-4 h-28 overflow-hidden rounded-xl border border-white/8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-50 blur-[3px]"
        />
        <div className="anim-scan absolute inset-x-0 top-1/2 h-14 -translate-y-1/2 bg-gradient-to-b from-transparent via-accent/45 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-ink/40" />
      </div>

      <ul className="mt-4 space-y-2.5">
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const Icon = done ? Check : step.icon;
          return (
            <li
              key={step.label}
              className={`flex items-center gap-3 text-sm transition-colors ${
                done ? "text-mint" : active ? "text-white" : "text-white/35"
              }`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition ${
                  done
                    ? "border-mint/40 bg-mint/10"
                    : active
                      ? "animate-pulse border-accent/50 bg-accent/15 text-accent-2"
                      : "border-white/8 bg-white/[0.03]"
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="font-medium">{step.label}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="shimmer h-full w-full rounded-full" />
      </div>
    </div>
  );
}
