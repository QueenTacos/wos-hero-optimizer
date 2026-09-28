// ============================================================================
// Image preprocessing for OCR. The pixel math is pure (works on RGBA arrays)
// so it's unit-testable without a browser; `preprocessImage` is the thin
// canvas wrapper used at runtime.
// ============================================================================

export type PreprocessMode =
  /** WOS quantities are white text with a dark outline: keep only bright pixels, as black-on-white. */
  | "bright-text"
  /** Bright text of any colour (e.g. white OR yellow "Lv. 12" labels): luminance only, no saturation limit. */
  | "bright-any"
  /** Fallback: grayscale + contrast stretch, inverted on dark screens so text ends up dark-on-light. */
  | "grayscale"
  /** Grayscale for dark text on a light panel (never inverted), e.g. the resource list. */
  | "grayscale-dark-text"
  /** Grayscale for light text on a dark background (always inverted). */
  | "grayscale-light-text";

export interface PixelBuffer {
  data: Uint8ClampedArray; // RGBA
  width: number;
  height: number;
}

function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Returns a new RGBA buffer prepared for OCR. Does not mutate the input.
 *  - bright-text: pixels that are both bright and low-saturation (white-ish)
 *    become black, everything else white.
 *  - grayscale: luminance, contrast-stretched to the full 0-255 range, and
 *    inverted when the image is mostly dark (Tesseract prefers dark text on
 *    a light background).
 */
export function preprocessPixels(
  src: PixelBuffer,
  mode: PreprocessMode,
  opts: { brightThreshold?: number; maxSaturation?: number } = {}
): PixelBuffer {
  const { data, width, height } = src;
  const out = new Uint8ClampedArray(data.length);

  if (mode === "bright-text" || mode === "bright-any") {
    const threshold = opts.brightThreshold ?? 200;
    const maxSat = mode === "bright-any" ? 255 : opts.maxSaturation ?? 60;
    for (let i = 0; i < data.length; i += 4) {
      // Transparent pixels are never text.
      const opaque = data[i + 3] >= 128;
      const r = opaque ? data[i] : 0, g = opaque ? data[i + 1] : 0, b = opaque ? data[i + 2] : 0;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const isText = luminance(r, g, b) >= threshold && sat <= maxSat;
      const v = isText ? 0 : 255;
      out[i] = out[i + 1] = out[i + 2] = v;
      out[i + 3] = 255;
    }
    removeLongHorizontalRuns(out, width, height);
    return { data: out, width, height };
  }

  let min = 255, max = 0, sum = 0;
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Transparent pixels (e.g. cut-out PNG crops) become white paper, not black.
    const l = data[i + 3] < 128 ? 255 : luminance(data[i], data[i + 1], data[i + 2]);
    lum[p] = l;
    sum += l;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  const range = Math.max(1, max - min);
  const invert =
    mode === "grayscale-dark-text" ? false : mode === "grayscale-light-text" ? true : sum / Math.max(1, width * height) < 128;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const stretched = Math.round(((lum[p] - min) / range) * 255);
    const v = invert ? 255 - stretched : stretched;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { data: out, width, height };
}

/**
 * Erases black horizontal runs longer than a quarter of the image width (and
 * at least 40 px). Those are UI edges (e.g. the bottom border of a backpack
 * tile), never text — and when they touch digits, Tesseract misreads the
 * number (seen on the real components screenshot: "171" read as "mm").
 */
export function removeLongHorizontalRuns(data: Uint8ClampedArray, width: number, height: number) {
  const maxRun = Math.max(40, Math.floor(width * 0.25));
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const black = x < width && data[(y * width + x) * 4] === 0;
      if (black && start < 0) start = x;
      if (!black && start >= 0) {
        if (x - start > maxRun) {
          for (let k = start; k < x; k++) {
            const i = (y * width + k) * 4;
            data[i] = data[i + 1] = data[i + 2] = 255;
          }
        }
        start = -1;
      }
    }
  }
}

/** Upscale factor so small phone screenshots give Tesseract enough pixels per glyph. */
export function chooseScale(width: number): number {
  if (width < 800) return 3;
  if (width < 1500) return 2;
  return 1;
}

/**
 * Browser-only: decodes an image Blob, upscales it, applies `mode`, and
 * returns a canvas ready to hand to the OCR engine plus the scale used
 * (so bounding boxes can be mapped back to original image coordinates).
 */
export async function preprocessImage(
  image: Blob,
  mode: PreprocessMode
): Promise<{ canvas: HTMLCanvasElement; scale: number; width: number; height: number }> {
  const bitmap = await createImageBitmap(image);
  const scale = chooseScale(bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context is not available in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const processed = preprocessPixels({ data: img.data, width: img.width, height: img.height }, mode);
  img.data.set(processed.data);
  ctx.putImageData(img, 0, 0);

  const result = { canvas, scale, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return result;
}
