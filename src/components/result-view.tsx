"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Gauge,
  HelpCircle,
  ImageOff,
  ListChecks,
  RefreshCcw,
  ScanLine,
} from "lucide-react";
import type { AnalysisResult } from "@/lib/types";

/* ---------- helpers ---------- */

function labelOf(text: string): string | null {
  const m = text.match(/^\s*([a-z0-9]{1,2})\s*[.)\]:-]/i);
  return m ? m[1].toLowerCase() : null;
}

export function optionIsAnswer(option: string, answer: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  if (norm(option) === norm(answer)) return true;
  const lo = labelOf(option);
  const la = labelOf(answer);
  if (lo && la) return lo === la;
  return false;
}

function splitOption(option: string, index: number): { chip: string; text: string } {
  const m = option.match(/^\s*([A-Za-z0-9]{1,2})\s*[.)\]:-]\s*(.+)$/);
  if (m) return { chip: m[1].toUpperCase(), text: m[2] };
  return { chip: String.fromCharCode(65 + index), text: option };
}

type Tier = { label: string; color: string };

function confidenceTier(confidence: number): Tier {
  if (confidence >= 90) return { label: "Very High", color: "#3ddc97" };
  if (confidence >= 75) return { label: "High", color: "#4fd1ff" };
  if (confidence >= 55) return { label: "Moderate", color: "#fbbf24" };
  return { label: "Low", color: "#ff6b6b" };
}

function useCountUp(target: number, duration = 1000): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/* ---------- confidence ring ---------- */

function ConfidenceRing({ confidence }: { confidence: number }) {
  const displayed = useCountUp(confidence);
  const tier = confidenceTier(confidence);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - displayed / 100);

  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          stroke={tier.color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 80ms linear", filter: `drop-shadow(0 0 10px ${tier.color}55)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="font-display text-[2rem] font-bold leading-none">{displayed}%</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- main view ---------- */

interface ResultViewProps {
  result: AnalysisResult;
  canRetake: boolean;
  onRetake: () => void;
  onNewQuestion: () => void;
}

export default function ResultView({ result, canRetake, onRetake, onNewQuestion }: ResultViewProps) {
  const tier = confidenceTier(result.confidence);

  if (result.status === "uncertain") {
    return (
      <div className="anim-fade-up">
        <div className="card mt-2 flex flex-col items-center gap-4 p-7 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-amber-400/10 text-amber-300">
            <ImageOff className="h-8 w-8" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold">Couldn&apos;t read that clearly</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              Get closer, keep the photo sharp and well lit, and make sure the full question and all
              options are visible.
            </p>
          </div>
          {result.confidence > 0 && (
            <span className="chip" style={{ color: tier.color, borderColor: `${tier.color}44` }}>
              <Gauge className="h-3.5 w-3.5" />
              Confidence {result.confidence}%
            </span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {canRetake ? (
            <>
              <button type="button" onClick={onNewQuestion} className="btn btn-ghost h-14 text-sm">
                Home
              </button>
              <button type="button" onClick={onRetake} className="btn btn-primary h-14 text-sm">
                <RefreshCcw className="h-4 w-4" />
                Try Again
              </button>
            </>
          ) : (
            <button type="button" onClick={onNewQuestion} className="btn btn-primary col-span-2 h-14 text-base">
              <ScanLine className="h-5 w-5" />
              New Question
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="anim-fade-up">
      {/* QUESTION */}
      <section className="card anim-fade-up p-5">
        <p className="section-label">
          <HelpCircle className="h-3.5 w-3.5 text-accent-2" />
          Question
        </p>
        <p className="mt-3 whitespace-pre-wrap text-[17px] font-medium leading-relaxed text-white/92">
          {result.question}
        </p>
      </section>

      {/* OPTIONS */}
      {result.options.length > 0 && (
        <section className="card anim-fade-up d1 mt-4 p-5">
          <p className="section-label">
            <ListChecks className="h-3.5 w-3.5 text-accent-2" />
            Options
          </p>
          <ul className="mt-3 space-y-2">
            {result.options.map((option, index) => {
              const correct = optionIsAnswer(option, result.answer);
              const { chip, text } = splitOption(option, index);
              return (
                <li
                  key={`${index}-${option}`}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 transition ${
                    correct
                      ? "border-mint/50 bg-mint/10 shadow-[0_0_24px_-8px_rgba(61,220,151,0.45)]"
                      : "border-white/8 bg-white/[0.03]"
                  }`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-sm font-bold ${
                      correct ? "bg-mint text-ink" : "bg-white/8 text-white/60"
                    }`}
                  >
                    {chip}
                  </span>
                  <span
                    className={`flex-1 text-[15px] leading-snug ${
                      correct ? "font-semibold text-white" : "text-white/75"
                    }`}
                  >
                    {text}
                  </span>
                  {correct && <CheckCircle2 className="h-5 w-5 shrink-0 text-mint" />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* CORRECT ANSWER */}
      <section className="anim-fade-up d2 mt-4 rounded-3xl bg-gradient-to-br from-accent via-accent-2/70 to-mint p-[1.5px]">
        <div className="rounded-[calc(1.5rem-1.5px)] bg-panel px-5 py-6 text-center">
          <p className="section-label justify-center">
            <BadgeCheck className="h-3.5 w-3.5 text-mint" />
            Correct Answer
          </p>
          <p className="mt-3 font-display text-[clamp(1.5rem,6vw,2rem)] font-bold leading-tight tracking-tight">
            {result.answer}
          </p>
        </div>
      </section>

      {/* AI CONFIDENCE */}
      <section className="card anim-fade-up d3 mt-4 flex items-center gap-5 p-5">
        <ConfidenceRing confidence={result.confidence} />
        <div className="min-w-0">
          <p className="section-label">
            <Gauge className="h-3.5 w-3.5 text-accent-2" />
            AI Confidence
          </p>
          <p className="mt-2.5 font-display text-2xl font-bold" style={{ color: tier.color }}>
            {result.confidence}%
          </p>
          <span
            className="chip mt-2"
            style={{ color: tier.color, borderColor: `${tier.color}44`, background: `${tier.color}14` }}
          >
            {tier.label}
          </span>
        </div>
      </section>

      {/* actions */}
      <div className="anim-fade-up d4 mt-5 grid grid-cols-2 gap-3">
        {canRetake ? (
          <>
            <button type="button" onClick={onRetake} className="btn btn-ghost h-14 text-sm">
              <RefreshCcw className="h-4 w-4" />
              Retake
            </button>
            <button type="button" onClick={onNewQuestion} className="btn btn-primary h-14 text-sm">
              <ScanLine className="h-4 w-4" />
              New Question
            </button>
          </>
        ) : (
          <button type="button" onClick={onNewQuestion} className="btn btn-primary col-span-2 h-14 text-base">
            <ScanLine className="h-5 w-5" />
            New Question
          </button>
        )}
      </div>
    </div>
  );
}
