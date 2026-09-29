// ============================================================================
// Number crops: preprocessing variants + glyph evidence for the white,
// dark-outlined digits the game draws on item tiles. Pure pixel code (runs
// the same in the browser and in Node tests). Never touches the user's
// original image — every function returns a new buffer.
//
// Why several variants: one binarisation threshold is never right for every
// tile. The glow/outline around a digit can merge strokes (a "5" whose top
// bar touches the bowl looks like a "2"), or a too-strict threshold thins
// strokes until a "5" loses its left vertical. Reading the same crop several
// ways and voting removes most single-pass mistakes.
// ============================================================================

import { Box, RGBAImage, resize } from "./pixels";
import { removeLongHorizontalRuns } from "./preprocess";

export interface CropVariant {
  name: "outlined" | "white-200" | "white-170" | "white-230" | "gray-inverted" | "sharpened";
  image: RGBAImage;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Upscale so digits are ~60–90 px tall for OCR (crops of small screenshots are tiny). */
export function upscaleForOcr(crop: RGBAImage, targetHeight = 180): RGBAImage {
  const f = Math.max(1, Math.min(6, Math.round(targetHeight / Math.max(1, crop.height))));
  return f === 1 ? crop : resize(crop, crop.width * f, crop.height * f);
}

/** Black-on-white: pixels that are bright (≥ threshold) and near-white (saturation ≤ maxSat) become ink. */
export function binarizeWhite(img: RGBAImage, threshold: number, maxSat: number): RGBAImage {
  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const ink = lum(r, g, b) >= threshold && Math.max(r, g, b) - Math.min(r, g, b) <= maxSat;
    const v = ink ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { data: out, width: img.width, height: img.height };
}

/**
 * Game digits are white FILL inside a dark OUTLINE. Keep a bright pixel only if
 * dark outline pixels lie on both sides of it (left+right or above+below)
 * within `reach` px. Large bright areas — tile borders, highlights, glow —
 * have no outline round them and drop out, even where they touch a digit.
 */
export function binarizeOutlined(img: RGBAImage, reach: number, brightMin = 165, darkMax = 115): RGBAImage {
  const { width: w, height: h } = img;
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = lum(img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]);
  const INF = 1e9;
  const left = new Float32Array(w * h), right = new Float32Array(w * h), up = new Float32Array(w * h), down = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -INF;
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (L[p] <= darkMax) last = x;
      left[p] = x - last;
    }
    last = INF;
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x;
      if (L[p] <= darkMax) last = x;
      right[p] = last - x;
    }
  }
  for (let x = 0; x < w; x++) {
    let last = -INF;
    for (let y = 0; y < h; y++) {
      const p = y * w + x;
      if (L[p] <= darkMax) last = y;
      up[p] = y - last;
    }
    last = INF;
    for (let y = h - 1; y >= 0; y--) {
      const p = y * w + x;
      if (L[p] <= darkMax) last = y;
      down[p] = last - y;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const r = img.data[p * 4], g = img.data[p * 4 + 1], b = img.data[p * 4 + 2];
    const bright = L[p] >= brightMin && Math.max(r, g, b) - Math.min(r, g, b) <= 90;
    const enclosed = (left[p] <= reach && right[p] <= reach) || (up[p] <= reach && down[p] <= reach);
    const v = bright && enclosed ? 0 : 255;
    out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = v;
    out[p * 4 + 3] = 255;
  }
  return { data: out, width: w, height: h };
}

/** Grayscale, contrast-stretched, inverted (light text → dark text). */
export function grayInverted(img: RGBAImage): RGBAImage {
  const n = img.width * img.height;
  const L = new Float32Array(n);
  let min = 255, max = 0;
  for (let p = 0; p < n; p++) {
    const v = lum(img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]);
    L[p] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  const out = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    const v = 255 - Math.round(((L[p] - min) / range) * 255);
    out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = v;
    out[p * 4 + 3] = 255;
  }
  return { data: out, width: img.width, height: img.height };
}

/** Unsharp mask on luminance (3×3 box blur), returned as RGB gray. */
export function sharpen(img: RGBAImage, amount = 1): RGBAImage {
  const { width: w, height: h } = img;
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = lum(img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          s += L[yy * w + xx];
          c++;
        }
      const p = y * w + x;
      const v = Math.max(0, Math.min(255, L[p] + amount * (L[p] - s / c)));
      out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = v;
      out[p * 4 + 3] = 255;
    }
  return { data: out, width: w, height: h };
}

/** Adds a white margin (Tesseract reads edge-touching glyphs badly). */
export function pad(img: RGBAImage, m: number): RGBAImage {
  const w = img.width + 2 * m, h = img.height + 2 * m;
  const out = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < img.height; y++) out.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + m) * w + m) * 4);
  return { data: out, width: w, height: h };
}

/**
 * Removes ink that can't be part of the number: long horizontal runs (tile
 * borders — they merge with the bottoms of digits) and any ink region touching
 * the crop edge (icon edges, glow). The crop is taken with a margin round the
 * digits, so real digits never touch the edge. Mutates and returns `bin`.
 */
export function cleanNumberInk(bin: RGBAImage): RGBAImage {
  removeLongHorizontalRuns(bin.data as Uint8ClampedArray, bin.width, bin.height);
  const { width: w, height: h } = bin;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const clear = (start: number) => {
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      bin.data[p * 4] = bin.data[p * 4 + 1] = bin.data[p * 4 + 2] = 255;
      const x = p % w;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || bin.data[q * 4] !== 0) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
  };
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const p = y * w + x;
      if (!seen[p] && bin.data[p * 4] === 0) clear(p);
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const p = y * w + x;
      if (!seen[p] && bin.data[p * 4] === 0) clear(p);
    }
  }
  return bin;
}

/** Keeps only ink whose centre lies inside `box` (the number line); everything else becomes paper. */
export function keepInside(bin: RGBAImage, box: Box): RGBAImage {
  const { width: w, height: h } = bin;
  const out = new Uint8ClampedArray(bin.data);
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || out[s * 4] !== 0) continue;
    const pix: number[] = [];
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      pix.push(p);
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || out[q * 4] !== 0) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (cx < box.x || cx > box.x + box.width || cy < box.y || cy > box.y + box.height) for (const p of pix) out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = 255;
  }
  return { data: out, width: w, height: h };
}

function cropBox(img: RGBAImage, b: Box): RGBAImage {
  const x0 = Math.max(0, Math.floor(b.x)), y0 = Math.max(0, Math.floor(b.y));
  const x1 = Math.min(img.width, Math.ceil(b.x + b.width)), y1 = Math.min(img.height, Math.ceil(b.y + b.height));
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4);
  return { data: out, width: w, height: h };
}

/** Outline-aware binarisation of an (upscaled) quantity area — the default view of the digits. */
export function outlinedView(up: RGBAImage): RGBAImage {
  return binarizeOutlined(up, Math.round(up.height * 0.3));
}

/**
 * The OCR variants tried for every quantity area. Each binary variant is
 * reduced to the number line (found on the outline-aware view: other ink —
 * icon edges, tile border, glow — is erased), cropped to it with a margin,
 * and padded. Returns the variants plus the line box in upscaled coords.
 */
export function quantityVariants(area: RGBAImage): CropVariant[] {
  const up = upscaleForOcr(area);
  const outlined = outlinedView(up);
  const line = locateDigits(outlined) ?? locateDigits(binarizeWhite(up, 200, 60));
  const m = Math.round((line?.height ?? up.height * 0.4) * 0.35);
  const box: Box = line
    ? { x: line.x - m, y: line.y - m, width: line.width + 2 * m, height: line.height + 2 * m }
    : { x: 0, y: 0, width: up.width, height: up.height };
  const inner: Box = line ? { x: line.x - m * 0.5, y: line.y - m * 0.3, width: line.width + m, height: line.height + m * 0.6 } : box;
  const view = (bin: RGBAImage) => pad(cropBox(keepInside(bin, inner), box), m);
  return [
    { name: "outlined", image: view(outlined) },
    { name: "white-200", image: view(binarizeWhite(up, 200, 60)) },
    { name: "white-170", image: view(binarizeWhite(up, 170, 90)) },
    { name: "white-230", image: view(binarizeWhite(up, 230, 45)) },
    { name: "gray-inverted", image: pad(cropBox(grayInverted(up), box), m) },
    { name: "sharpened", image: view(binarizeWhite(sharpen(up, 1.2), 190, 255)) },
  ];
}

// ---------------------------------------------------------------------------
// Glyph evidence
// ---------------------------------------------------------------------------

export interface Glyph {
  box: Box;
  /** Small mark sitting on the baseline, e.g. a thousands comma. */
  isComma: boolean;
}

/**
 * Connected ink regions of a black-on-white image, left to right. Tiny
 * specks are dropped; regions stacked vertically are merged into one glyph.
 * Only glyphs on the main text line (overlapping the tallest glyph's rows)
 * are kept, so bits of the tile icon above the number are ignored.
 */
export function segmentGlyphs(bin: RGBAImage): Glyph[] {
  const { width: w, height: h } = bin;
  const seen = new Uint8Array(w * h);
  const boxes: (Box & { area: number })[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || bin.data[s * 4] !== 0) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p / w) | 0;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || bin.data[q * 4] !== 0) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    boxes.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1, area });
  }
  if (!boxes.length) return [];
  const maxArea = Math.max(...boxes.map((b) => b.area));
  let parts = boxes.filter((b) => b.area >= maxArea * 0.03);
  // Main text line = rows covered by the tallest part.
  const tallest = parts.reduce((a, b) => (b.height > a.height ? b : a));
  const lineTop = tallest.y, lineBottom = tallest.y + tallest.height;
  parts = parts.filter((b) => b.y + b.height > lineTop + tallest.height * 0.3 && b.y < lineBottom);
  // Merge parts that overlap horizontally (e.g. a broken stroke).
  parts.sort((a, b) => a.x - b.x);
  const merged: Box[] = [];
  for (const b of parts) {
    const last = merged[merged.length - 1];
    if (last && b.x < last.x + last.width * 0.6) {
      const x0 = Math.min(last.x, b.x), y0 = Math.min(last.y, b.y);
      const x1 = Math.max(last.x + last.width, b.x + b.width), y1 = Math.max(last.y + last.height, b.y + b.height);
      merged[merged.length - 1] = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    } else merged.push({ x: b.x, y: b.y, width: b.width, height: b.height });
  }
  const hs = merged.map((b) => b.height).sort((a, b) => a - b);
  const med = hs[hs.length >> 1];
  return merged.map((b) => ({ box: b, isComma: b.height < med * 0.5 && b.y + b.height > lineBottom - med * 0.35 }));
}

/**
 * "5" vs "2" from shape, for glyphs OCR is unsure about. A 5 has a vertical
 * stroke down the LEFT side of its upper half (top bar → bowl); a 2's upper
 * half is an arch whose left side is open between the top and the diagonal.
 * Returns > 0 for "5", < 0 for "2", ~0 when unclear.
 */
export function fiveVersusTwo(bin: RGBAImage, g: Box): number {
  const leftBand = (y: number) => {
    // Is there ink in the left 30% of the glyph on this row?
    const y0 = Math.round(g.y + y * g.height);
    const xs = Math.round(g.x + g.width * 0.3);
    for (let x = g.x; x < xs; x++) if (bin.data[(y0 * bin.width + x) * 4] === 0) return 1;
    return 0;
  };
  const rightBand = (y: number) => {
    const y0 = Math.round(g.y + y * g.height);
    const xs = Math.round(g.x + g.width * 0.7);
    for (let x = xs; x < g.x + g.width; x++) if (bin.data[(y0 * bin.width + x) * 4] === 0) return 1;
    return 0;
  };
  // Rows 25–45% down: 5 → ink left, not right. 2 → ink right, not left.
  let score = 0;
  for (const t of [0.25, 0.3, 0.35, 0.4, 0.45]) score += leftBand(t) - rightBand(t);
  return score / 5;
}

/**
 * Finds the number inside a tile's quantity area, so OCR only sees the
 * digits (not the icon, the glow or the tile border). Works on a
 * black-on-white binarisation. Digit-shaped ink regions (not too flat, not
 * too small) that share a text line are grouped; the line with the most
 * digits wins (ties → the right-most, where tile quantities sit). Commas
 * between/after the digits are included. Returns null if nothing digit-like.
 */
export function locateDigits(bin: RGBAImage): Box | null {
  const { width: w, height: h } = bin;
  const seen = new Uint8Array(w * h);
  const comps: Box[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || bin.data[s * 4] !== 0) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || bin.data[q * 4] !== 0) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    comps.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
  }
  const digitLike = comps.filter((b) => b.height >= h * 0.22 && b.height <= h * 0.95 && b.width / b.height <= 1.3 && b.width / b.height >= 0.12);
  if (!digitLike.length) return null;
  // For each anchor, the chain of similar-height digits on its line, walking left from the
  // right-most one with gaps under ~1.2 digit heights. Most digits wins; ties → right-most.
  let line: Box[] = [];
  let bestScore = -1;
  for (const a of digitLike) {
    const same = digitLike
      .filter((b) => {
        const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        return overlap >= Math.min(a.height, b.height) * 0.5 && b.height >= a.height * 0.6 && b.height <= a.height * 1.4;
      })
      .sort((p, q) => q.x - p.x);
    const chain = [same[0]];
    for (const b of same.slice(1)) {
      const leftmost = chain[chain.length - 1];
      if (leftmost.x - (b.x + b.width) <= a.height * 1.2) chain.push(b);
    }
    const score = chain.length * 10000 + chain[0].x + chain[0].width;
    if (score > bestScore) {
      bestScore = score;
      line = chain;
    }
  }
  const x0 = Math.min(...line.map((b) => b.x));
  const y0 = Math.min(...line.map((b) => b.y));
  const x1 = Math.max(...line.map((b) => b.x + b.width));
  const y1 = Math.max(...line.map((b) => b.y + b.height));
  // Commas: small marks near the baseline between or just after the digits.
  const lh = y1 - y0;
  let right = x1;
  for (const c of comps) {
    const isComma = c.height < lh * 0.5 && c.height > lh * 0.1 && c.y + c.height > y1 - lh * 0.1 && c.y + c.height < y1 + lh * 0.45;
    if (isComma && c.x > x0 && c.x < x1 + lh * 0.3) right = Math.max(right, c.x + c.width);
  }
  return { x: x0, y: y0, width: right - x0, height: y1 - y0 };
}
