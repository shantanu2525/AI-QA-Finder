"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, RefreshCcw, X } from "lucide-react";
import { blobToOptimizedDataUrl } from "@/lib/image-utils";

interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
}

type Phase = "starting" | "live" | "still" | "error";

export default function CameraModal({ open, onClose, onConfirm }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState("");
  const [still, setStill] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setPhase("starting");
    setError("");
    setStill(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not supported in this browser. Try uploading or pasting an image instead.");
      setPhase("error");
      return;
    }

    try {
      stopStream();
      let stream: MediaStream;
      try {
        // Prefer the rear camera on phones/tablets.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch (firstError) {
        const name = (firstError as DOMException)?.name;
        if (name === "OverconstrainedError" || name === "NotFoundError") {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } else {
          throw firstError;
        }
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play().catch(() => {});
      }
      setPhase("live");
    } catch (e) {
      const name = (e as DOMException)?.name;
      let message = "Could not access the camera.";
      if (name === "NotAllowedError") {
        message =
          "Camera permission was denied. Allow camera access in your browser settings, or upload / paste an image instead.";
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        message = "No camera was found on this device. Try uploading or pasting an image instead.";
      } else if (name === "NotReadableError") {
        message = "The camera is being used by another app. Close it and try again.";
      }
      setError(message);
      setPhase("error");
    }
  }, [stopStream]);

  useEffect(() => {
    if (!open) return;
    void start();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      stopStream();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, start, stopStream]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Capture failed"))),
          "image/jpeg",
          0.95,
        ),
      );
      const dataUrl = await blobToOptimizedDataUrl(blob);
      setStill(dataUrl);
      setPhase("still");
    } catch {
      setError("Could not capture the photo. Please try again.");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    setStill(null);
    setPhase("live");
    void videoRef.current?.play().catch(() => {});
  };

  const confirm = () => {
    if (!still) return;
    stopStream();
    onConfirm(still);
  };

  if (!open) return null;

  return (
    <div
      className="anim-fade-in fixed inset-0 z-[70] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
    >
      {/* top bar */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <p className="font-display text-sm font-semibold tracking-wide text-white/80">
          Capture Question
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* viewfinder */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            phase === "live" || phase === "starting" ? "opacity-100" : "opacity-0"
          }`}
        />

        {phase === "still" && still && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={still}
            alt="Captured question"
            className="anim-pop absolute inset-0 h-full w-full object-contain"
          />
        )}

        {phase === "live" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="aspect-[4/3] w-[82%] max-w-[560px] rounded-2xl border-2 border-dashed border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
            <p className="absolute bottom-6 left-1/2 w-max max-w-[90%] -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-center text-xs font-medium text-white/90 backdrop-blur-sm">
              Align the question inside the frame
            </p>
          </div>
        )}

        {phase === "starting" && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-white/70">
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-accent-2" />
              <p className="text-sm">Starting camera…</p>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="anim-pop flex w-full max-w-sm flex-col items-center gap-4 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-danger/15 text-danger">
                <AlertTriangle className="h-7 w-7" />
              </span>
              <p className="text-sm leading-relaxed text-white/75">{error}</p>
              <div className="grid w-full grid-cols-2 gap-3">
                <button type="button" onClick={onClose} className="btn btn-ghost h-13 min-h-[52px] text-sm">
                  Close
                </button>
                <button type="button" onClick={() => void start()} className="btn btn-primary h-13 min-h-[52px] text-sm">
                  <RefreshCcw className="h-4 w-4" />
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* controls */}
      <div className="pb-safe shrink-0 px-5 pt-4">
        {phase === "still" ? (
          <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3">
            <button type="button" onClick={retake} className="btn btn-ghost h-14 text-base">
              <RefreshCcw className="h-5 w-5" />
              Retake
            </button>
            <button type="button" onClick={confirm} className="btn btn-primary h-14 text-base">
              <Check className="h-5 w-5" />
              Use This Image
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center pb-1">
            <button
              type="button"
              onClick={() => void capture()}
              disabled={phase !== "live" || busy}
              aria-label="Capture photo"
              className="grid h-[76px] w-[76px] place-items-center rounded-full border-4 border-white/90 bg-transparent transition enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40"
            >
              <span className="h-[58px] w-[58px] rounded-full bg-white" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
