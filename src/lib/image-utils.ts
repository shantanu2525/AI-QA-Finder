export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function isAcceptedImageType(type: string): boolean {
  return ACCEPTED_TYPES.has(type.toLowerCase());
}

/** Returns an error message, or null when the file is valid. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!isAcceptedImageType(file.type)) {
    return "Unsupported format. Please use JPG, PNG, or WEBP.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "Image is too large. Maximum size is 10 MB.";
  }
  if (file.size === 0) {
    return "That file appears to be empty.";
  }
  return null;
}

interface BitmapSource {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  revoke: () => void;
}

async function loadBitmapSource(blob: Blob): Promise<BitmapSource> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob);
      return {
        width: bmp.width,
        height: bmp.height,
        draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
        revoke: () => bmp.close(),
      };
    } catch {
      // fall through to <img> decoding (older Safari)
    }
  }
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode image"));
    el.src = url;
  });
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    revoke: () => URL.revokeObjectURL(url),
  };
}

/**
 * Downscales any image blob to a compact JPEG data URL that is safe to send
 * to the vision API (fast upload, small request body).
 */
export async function blobToOptimizedDataUrl(blob: Blob, maxDim = 1600): Promise<string> {
  const src = await loadBitmapSource(blob);
  try {
    const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser");
    ctx.imageSmoothingQuality = "high";
    src.draw(ctx, w, h);
    for (const q of [0.87, 0.78, 0.68, 0.58]) {
      const url = canvas.toDataURL("image/jpeg", q);
      if (url.length < 3_400_000) return url;
    }
    return canvas.toDataURL("image/jpeg", 0.55);
  } finally {
    src.revoke();
  }
}

export const delay = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
