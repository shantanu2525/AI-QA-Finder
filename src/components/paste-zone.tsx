"use client";

import { useEffect, useState } from "react";
import { ClipboardPaste } from "lucide-react";

export default function PasteZone({ onActivate }: { onActivate: () => void }) {
  const [isMac, setIsMac] = useState<boolean | null>(null);

  useEffect(() => {
    setIsMac(/mac|iphone|ipad|ipod/i.test(`${navigator.platform} ${navigator.userAgent}`));
  }, []);

  return (
    <button
      type="button"
      onClick={onActivate}
      className="group flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-center transition hover:border-accent/50 hover:bg-accent/[0.06]"
      aria-label="Paste area — click, then press Ctrl+V or Command+V to paste a screenshot"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/[0.06] text-white/70 transition group-hover:scale-105 group-hover:text-accent-2">
        <ClipboardPaste className="h-5 w-5" />
      </span>
      <span className="font-display text-[15px] font-semibold text-white/85">
        Paste Screenshot Here
      </span>
      <span className="flex items-center gap-1.5 text-xs text-white/40">
        {isMac === null ? (
          <>
            Press <span className="kbd">Ctrl</span> / <span className="kbd">Cmd</span> +{" "}
            <span className="kbd">V</span>
          </>
        ) : isMac ? (
          <>
            Press <span className="kbd">Cmd</span> + <span className="kbd">V</span>
          </>
        ) : (
          <>
            Press <span className="kbd">Ctrl</span> + <span className="kbd">V</span>
          </>
        )}
      </span>
    </button>
  );
}
