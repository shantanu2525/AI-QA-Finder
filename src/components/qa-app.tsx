"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardPaste,
  CloudUpload,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { AnalysisResult, CapturedImage, HistoryItem, ImageSource } from "@/lib/types";
import { blobToOptimizedDataUrl, delay, validateImageFile } from "@/lib/image-utils";
import { loadHistory, makeHistoryItem, persistHistory } from "@/lib/history";
import CameraModal from "@/components/camera-modal";
import AnalyzingLoader from "@/components/analyzing-loader";
import ResultView from "@/components/result-view";
import HistoryList from "@/components/history-list";
import PasteZone from "@/components/paste-zone";

type Stage = "home" | "ready" | "analyzing" | "result" | "error";
type ToastKind = "ok" | "err";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const SOURCE_META: Record<ImageSource, { label: string; icon: typeof Camera }> = {
  camera: { label: "Camera", icon: Camera },
  upload: { label: "Upload", icon: CloudUpload },
  paste: { label: "Pasted", icon: ClipboardPaste },
};

export default function QAApp() {
  const [stage, setStage] = useState<Stage>("home");
  const [image, setImage] = useState<CapturedImage | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [processing, setProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const analyzingRef = useRef(false);
  const cameraOpenRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- toast ---------- */

  const showToast = useCallback((message: string, kind: ToastKind = "ok") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message, kind });
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  /* ---------- lifecycle ---------- */

  useEffect(() => {
    setHistory(loadHistory());
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    cameraOpenRef.current = cameraOpen;
  }, [cameraOpen]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [stage]);

  /* ---------- image intake ---------- */

  const acceptImage = useCallback(
    async (file: File, source: ImageSource) => {
      if (analyzingRef.current) return;
      const validationError = validateImageFile(file);
      if (validationError) {
        showToast(validationError, "err");
        return;
      }
      setProcessing(true);
      try {
        const dataUrl = await blobToOptimizedDataUrl(file);
        setImage({ dataUrl, source });
        setResult(null);
        setError("");
        setStage("ready");
        if (source === "paste") showToast("Image pasted successfully");
      } catch {
        showToast("Could not read that image. Try a different one.", "err");
      } finally {
        setProcessing(false);
      }
    },
    [showToast],
  );

  // Global Ctrl+V / Cmd+V image paste (works anywhere on the page).
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (cameraOpenRef.current || analyzingRef.current) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            void acceptImage(file, "paste");
          }
          return;
        }
      }
      // Clipboard holds text or something else — ignore it.
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptImage]);

  const onFilePicked = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void acceptImage(file, "upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openCamera = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("Camera is not supported in this browser — upload or paste instead.", "err");
      return;
    }
    setCameraOpen(true);
  }, [showToast]);

  const onCameraConfirm = useCallback((dataUrl: string) => {
    setCameraOpen(false);
    setImage({ dataUrl, source: "camera" });
    setResult(null);
    setError("");
    setStage("ready");
  }, []);

  /* ---------- analysis ---------- */

  const analyze = useCallback(async () => {
    const current = image;
    if (!current || analyzingRef.current) return;
    analyzingRef.current = true;
    setStage("analyzing");
    setError("");
    try {
      const [response] = await Promise.all([
        fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: current.dataUrl }),
        }),
        delay(1500), // let the staged loader breathe
      ]);

      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const message =
          (data as { error?: string } | null)?.error ?? `Analysis failed (HTTP ${response.status})`;
        throw new Error(message);
      }

      const parsed = data as AnalysisResult;
      setResult(parsed);
      setHistory((prev) => {
        const next = [makeHistoryItem(parsed), ...prev].slice(0, 50);
        persistHistory(next);
        return next;
      });
      setStage("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setStage("error");
    } finally {
      analyzingRef.current = false;
    }
  }, [image]);

  /* ---------- navigation ---------- */

  const resetToHome = useCallback(() => {
    setImage(null);
    setResult(null);
    setError("");
    setStage("home");
  }, []);

  const retakeOrReplace = useCallback(() => {
    if (!image || image.source === "camera") {
      openCamera();
    } else if (image.source === "paste") {
      showToast("Press Ctrl+V / Cmd+V anywhere to paste a new image");
    } else {
      fileInputRef.current?.click();
    }
  }, [image, openCamera, showToast]);

  const openHistoryItem = useCallback((item: HistoryItem) => {
    setResult(item.result);
    setImage(null);
    setError("");
    setStage("result");
  }, []);

  const deleteHistoryItem = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      persistHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    if (!window.confirm("Delete all saved results?")) return;
    setHistory([]);
    persistHistory([]);
    showToast("History cleared");
  }, [showToast]);

  /* ---------- render ---------- */

  const showAnalyzeBar = (stage === "ready" || stage === "error") && !!image;

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="anim-drift absolute -top-28 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/25 blur-[110px]" />
        <div
          className="anim-drift absolute -right-24 bottom-[-7rem] h-96 w-96 rounded-full bg-accent-2/12 blur-[130px]"
          style={{ animationDelay: "2.6s" }}
        />
        <div
          className="anim-drift absolute -left-28 top-1/3 h-72 w-72 rounded-full bg-mint/8 blur-[120px]"
          style={{ animationDelay: "5s" }}
        />
        <div className="dotgrid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-5">
        {/* header */}
        <header className="flex items-center justify-between pt-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 shadow-lg shadow-accent/30">
              <ScanSearch className="h-5 w-5 text-white" />
            </span>
            <span>
              <span className="block font-display text-sm font-bold tracking-wide">
                AI Question Answer Finder
              </span>
              <span className="block text-[10px] uppercase tracking-[0.24em] text-white/40">
                Snap · Analyze · Answer
              </span>
            </span>
          </div>
        </header>

        <main className={`flex-1 pt-7 ${showAnalyzeBar ? "pb-44" : "pb-10"}`}>
          {/* ============ HOME ============ */}
          {stage === "home" && (
            <div>
              <section className="anim-fade-up">
                <h1 className="font-display text-[clamp(2.1rem,9.5vw,2.9rem)] font-bold leading-[1.04] tracking-tight">
                  Snap it.
                  <br />
                  <span className="text-gradient">Know it.</span>
                </h1>
                <p className="mt-3.5 max-w-[34ch] text-[15px] leading-relaxed text-white/55">
                  Capture or paste any multiple-choice question. The AI reads it, solves it, and shows
                  the correct answer.
                </p>
              </section>

              <section className="anim-fade-up d1 mt-7 space-y-3">
                <button
                  type="button"
                  onClick={openCamera}
                  className="btn btn-primary h-14 w-full text-base"
                >
                  <Camera className="h-5 w-5" />
                  Use Camera
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-ghost h-14 w-full justify-start px-5 text-base"
                >
                  <CloudUpload className="h-5 w-5 shrink-0 text-accent-2" />
                  <span className="flex-1 text-left">Upload Image</span>
                  <span className="text-[10px] font-normal uppercase tracking-wider text-white/35">
                    JPG · PNG · WEBP
                  </span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => onFilePicked(e.target.files)}
                />

                <PasteZone onActivate={() => showToast("Now press Ctrl+V / Cmd+V to paste your screenshot")} />
              </section>

              <p className="anim-fade-up d2 mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/35">
                <ShieldCheck className="h-3.5 w-3.5 text-mint/70" />
                Answered by AI — API keys never leave the server
              </p>

              <HistoryList
                items={history}
                onOpen={openHistoryItem}
                onDelete={deleteHistoryItem}
                onClear={clearHistory}
              />
            </div>
          )}

          {/* ============ PREVIEW / ANALYZING / ERROR ============ */}
          {image && (stage === "ready" || stage === "analyzing" || stage === "error") && (
            <div className="anim-fade-up">
              <div className="flex items-center justify-between">
                <p className="section-label">
                  <ImageIcon className="h-3.5 w-3.5 text-accent-2" />
                  Image Preview
                </p>
                <span className="chip">
                  {(() => {
                    const Meta = SOURCE_META[image.source];
                    const Icon = Meta.icon;
                    return (
                      <>
                        <Icon className="h-3 w-3" />
                        {Meta.label}
                      </>
                    );
                  })()}
                </span>
              </div>

              <div className="card mt-3 overflow-hidden p-2">
                <div className="dotgrid grid max-h-[52dvh] place-items-center overflow-hidden rounded-2xl bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.dataUrl}
                    alt="Question preview"
                    className="max-h-[52dvh] w-auto max-w-full rounded-xl object-contain"
                  />
                </div>
              </div>

              {stage === "error" && (
                <div className="anim-pop mt-4 flex items-start gap-3 rounded-2xl border border-danger/35 bg-danger/10 px-4 py-3.5">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#ffb3b3]">Analysis failed</p>
                    <p className="mt-0.5 break-words text-sm leading-relaxed text-white/60">{error}</p>
                  </div>
                </div>
              )}

              {stage !== "analyzing" && (
                <div className="anim-fade-up mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={retakeOrReplace}
                    className="btn btn-ghost h-[52px] text-sm"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    {image.source === "camera" ? "Retake" : "Replace"}
                  </button>
                  <button
                    type="button"
                    onClick={resetToHome}
                    className="btn btn-ghost h-[52px] text-sm"
                  >
                    <X className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              )}

              {stage === "analyzing" && <AnalyzingLoader imageUrl={image.dataUrl} />}
            </div>
          )}

          {/* ============ RESULT ============ */}
          {stage === "result" && result && (
            <ResultView
              result={result}
              canRetake={!!image && image.source === "camera"}
              onRetake={openCamera}
              onNewQuestion={resetToHome}
            />
          )}
        </main>

        <footer className="pb-safe mt-auto pt-2 text-center text-[11px] leading-relaxed text-white/25">
          Camera requires HTTPS · Ctrl+V / Cmd+V pastes screenshots on desktop
        </footer>
      </div>

      {/* sticky analyze action */}
      {showAnalyzeBar && (
        <div className="anim-fade-in fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-ink via-ink/92 to-transparent px-5 pb-safe pt-12">
          <div className="mx-auto w-full max-w-md">
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={!image || analyzingRef.current}
              className="btn btn-primary h-14 w-full text-base"
            >
              <Sparkles className="h-5 w-5" />
              Analyze Question
            </button>
          </div>
        </div>
      )}

      {/* camera */}
      <CameraModal open={cameraOpen} onClose={() => setCameraOpen(false)} onConfirm={onCameraConfirm} />

      {/* processing overlay */}
      {processing && (
        <div className="anim-fade-in fixed inset-0 z-[80] grid place-items-center bg-ink/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-accent-2" />
            <p className="text-sm text-white/70">Preparing image…</p>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex justify-center px-4">
          <div
            key={toast.id}
            role="status"
            className={`anim-pop flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-md ${
              toast.kind === "ok"
                ? "border-mint/40 bg-mint/15 text-mint"
                : "border-danger/40 bg-danger/15 text-[#ffb3b3]"
            }`}
          >
            {toast.kind === "ok" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
