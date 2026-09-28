// ============================================================================
// Minimal RGBA pixel helpers shared by the roster segmenter, portrait matcher
// and star reader. Pure functions on plain arrays so the exact same code runs
// in the browser (from a canvas) and in Node unit tests (from decoded files).
// ============================================================================

export interface RGBAImage {
  data: Uint8ClampedArray | Uint8Array; // RGBA, row-major
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function crop(img: RGBAImage, box: Box): RGBAImage {
  const x0 = Math.max(0, Math.round(box.x));
  const y0 = Math.max(0, Math.round(box.y));
  const w = Math.max(1, Math.min(img.width - x0, Math.round(box.width)));
  const h = Math.max(1, Math.min(img.height - y0, Math.round(box.height)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * img.width + x0) * 4;
    out.set(img.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { data: out, width: w, height: h };
}

/**
 * Area-averaging downscale (falls back to bilinear sampling when upscaling).
 * Alpha is composited onto black so transparent portrait corners behave the
 * same as the opaque ones.
 */
export function resize(img: RGBAImage, w: number, h: number): RGBAImage {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy, y1 = y0 + sy;
    for (let x = 0; x < w; x++) {
      const x0 = x * sx, x1 = x0 + sx;
      let r = 0, g = 0, b = 0, wt = 0;
      const iy0 = Math.floor(y0), iy1 = Math.min(img.height - 1, Math.ceil(y1) - 1);
      const ix0 = Math.floor(x0), ix1 = Math.min(img.width - 1, Math.ceil(x1) - 1);
      for (let yy = iy0; yy <= Math.max(iy0, iy1); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0) || 1;
        for (let xx = ix0; xx <= Math.max(ix0, ix1); xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0) || 1;
          const i = (yy * img.width + xx) * 4;
          const a = img.data[i + 3] / 255;
          const k = Math.max(0, wx * wy);
          r += img.data[i] * a * k;
          g += img.data[i + 1] * a * k;
          b += img.data[i + 2] * a * k;
          wt += k;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / wt;
      out[o + 1] = g / wt;
      out[o + 2] = b / wt;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** RGB channels as Float32 (alpha dropped), length w*h*3. */
export function toRgbFloat(img: RGBAImage): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n * 3);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    out[p * 3] = img.data[i];
    out[p * 3 + 1] = img.data[i + 1];
    out[p * 3 + 2] = img.data[i + 2];
  }
  return out;
}

/** Browser-only: decode a Blob/URL into an RGBAImage via canvas. */
export async function loadRGBAImage(source: Blob | string): Promise<RGBAImage> {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: d.data, width: d.width, height: d.height };
}

/** Browser-only: RGBAImage -> PNG Blob (used for card thumbnails and per-region OCR). */
export async function rgbaToBlob(img: RGBAImage): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  const id = ctx.createImageData(img.width, img.height);
  id.data.set(img.data);
  ctx.putImageData(id, 0, 0);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png"));
}
