export const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export type ImageValidationError = "type" | "size";

export function isAcceptableImageType(type: string): boolean {
  return (acceptedImageTypes as readonly string[]).includes(type);
}

/**
 * Computes target dimensions that fit within `maxEdge` while preserving aspect
 * ratio. Never upscales: images already within bounds are returned unchanged.
 */
export function computeScaledDimensions(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= 0 || maxEdge <= 0) {
    return { width: 0, height: 0 };
  }
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Approximate decoded byte size of a base64 data URL. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function validateImageFile(file: { type: string; size: number }, options: { maxBytes: number }): { ok: true } | { ok: false; error: ImageValidationError } {
  if (!isAcceptableImageType(file.type)) {
    return { ok: false, error: "type" };
  }
  if (file.size > options.maxBytes) {
    return { ok: false, error: "size" };
  }
  return { ok: true };
}

/**
 * Downscales and re-encodes an image File to a compressed JPEG data URL using a
 * canvas. Browser-only (relies on createImageBitmap + canvas).
 */
export async function fileToCompressedDataUrl(file: File, { maxEdge = 1280, quality = 0.7 } = {}): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = computeScaledDimensions(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable");
    }
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    bitmap.close?.();
  }
}
