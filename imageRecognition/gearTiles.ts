// ============================================================================
// Rarity-coloured tiles (backpack items, gear icons). Pure pixel code.
//
// Colour calibration: the real Backpack screenshot in
// docs/package/reference-screenshots/06_real_test_cases shows purple (Epic),
// green (Uncommon), blue (Rare) and orange tiles on the navy backpack
// background. Orange is taken as Mythic. Grey (Common) and red (Legendary)
// have NOT been seen on a real screenshot yet, so those readings are always
// low confidence — the user picks the quality on the review screen.
// ============================================================================

import type { GearRarity } from "../lib/types";
import type { Box, RGBAImage } from "./pixels";

export type TileColour = "grey" | "green" | "blue" | "purple" | "orange" | "red";

export const TILE_COLOUR_QUALITY: Record<TileColour, GearRarity> = {
  grey: "common",
  green: "uncommon",
  blue: "rare",
  purple: "epic",
  orange: "mythic",
  red: "legendary",
};

/** How much a colour → quality reading can be trusted (seen on a real screenshot or not). */
export const TILE_COLOUR_CONFIDENCE: Record<TileColour, number> = {
  green: 0.7,
  blue: 0.6, // light blue also appears in screen backgrounds
  purple: 0.75,
  orange: 0.45, // Mythic vs Legendary not verified on a real gear screenshot → never pre-filled
  grey: 0.35,
  red: 0.4,
};

export function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

/** The navy backpack / panel background (hue ~215, saturated, dark). */
export function isPanelNavy(r: number, g: number, b: number) {
  const [h, s, v] = hsv(r, g, b);
  return h >= 195 && h <= 235 && s > 0.5 && v < 0.62;
}

/** Rarity colour of one pixel, or null for background / art / text. */
export function pixelTileColour(r: number, g: number, b: number): TileColour | null {
  const [h, s, v] = hsv(r, g, b);
  if (isPanelNavy(r, g, b)) return null;
  if (v < 0.3) return null;
  if (s < 0.12) return v > 0.45 && v < 0.85 ? "grey" : null;
  if (s < 0.22) return null;
  if (h >= 245 && h <= 300) return "purple";
  if (h >= 75 && h <= 160) return "green";
  if (h >= 185 && h < 245) return v > 0.7 ? "blue" : null;
  if (h >= 18 && h <= 50) return "orange";
  if (h >= 345 || h < 12) return s > 0.45 ? "red" : null;
  return null;
}

export interface ColourVote {
  colour: TileColour | null;
  /** Share of the region's pixels with that colour. */
  share: number;
  votes: Partial<Record<TileColour, number>>;
}

/** Dominant rarity colour in a region (ignores background, art and text pixels). */
export function dominantTileColour(img: RGBAImage, box: Box, ignore: TileColour[] = []): ColourVote {
  const votes: Partial<Record<TileColour, number>> = {};
  let n = 0;
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.width, Math.ceil(box.x + box.width)), y1 = Math.min(img.height, Math.ceil(box.y + box.height));
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 60));
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      const i = (y * img.width + x) * 4;
      const c = pixelTileColour(img.data[i], img.data[i + 1], img.data[i + 2]);
      n++;
      if (c && !ignore.includes(c)) votes[c] = (votes[c] ?? 0) + 1;
    }
  let best: TileColour | null = null;
  for (const k of Object.keys(votes) as TileColour[]) if (!best || votes[k]! > votes[best]!) best = k;
  return { colour: best, share: best && n ? votes[best]! / n : 0, votes };
}

export interface FoundTile {
  box: Box;
  /** Rarity colour, or "empty" for a dark navy empty gear slot. */
  colour: TileColour | "empty";
  /** Share of the tile box covered by its colour (0–1). */
  fill: number;
}

type TileClass = TileColour | "empty";
const CLASSES: TileClass[] = ["grey", "green", "blue", "purple", "orange", "red", "empty"];

/**
 * Finds roughly square tiles of one colour class. Works on a downscaled
 * colour mask: connected regions whose bounding box is square-ish and at
 * least `minSizeFrac` of the image width. Tiles cut by the image edge are dropped.
 */
function findTiles(
  img: RGBAImage,
  classify: (r: number, g: number, b: number) => TileClass | null,
  opts: { minSizeFrac?: number; maxSizeFrac?: number; sameSize?: boolean } = {}
): FoundTile[] {
  const minSizeFrac = opts.minSizeFrac ?? 0.08;
  const maxSizeFrac = opts.maxSizeFrac ?? 0.45;
  const scale = Math.max(1, Math.round(Math.max(img.width, img.height) / 240));
  const W = Math.floor(img.width / scale), H = Math.floor(img.height / scale);
  const cls = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = ((y * scale + (scale >> 1)) * img.width + x * scale + (scale >> 1)) * 4;
      const c = classify(img.data[i], img.data[i + 1], img.data[i + 2]);
      if (c) cls[y * W + x] = CLASSES.indexOf(c);
    }
  const seen = new Uint8Array(W * H);
  const out: FoundTile[] = [];
  const stack: number[] = [];
  const ref = Math.min(W, H);
  for (let start = 0; start < W * H; start++) {
    if (cls[start] < 0 || seen[start]) continue;
    const c = cls[start];
    let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W, y = (p / W) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H || seen[q] || cls[q] !== c) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const aspect = w / h;
    const fill = count / (w * h);
    const touchesEdge = minX === 0 || minY === 0 || maxX === W - 1 || maxY === H - 1;
    if (touchesEdge || aspect < 0.75 || aspect > 1.33 || fill < 0.25) continue;
    if (w < ref * minSizeFrac || w > ref * maxSizeFrac) continue;
    out.push({ box: { x: minX * scale, y: minY * scale, width: w * scale, height: h * scale }, colour: CLASSES[c], fill });
  }
  const sorted = out.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  // Keep tiles of the common size (drops stray blobs like buttons or banners).
  if (opts.sameSize !== false && sorted.length >= 3) {
    const sizes = sorted.map((t) => t.box.width).sort((a, b) => a - b);
    const med = sizes[sizes.length >> 1];
    return sorted.filter((t) => t.box.width > med * 0.7 && t.box.width < med * 1.35);
  }
  return sorted;
}

/**
 * Backpack / inventory item tiles. Tiles are separated by the navy backpack
 * background, so a tile is a square-ish region of "not background" pixels;
 * its rarity is the dominant colour of its border ring (the icon in the
 * middle is ignored — e.g. the light-blue component nut on a purple tile).
 */
export function findRarityTiles(img: RGBAImage, opts: { minSizeFrac?: number; maxSizeFrac?: number } = {}): FoundTile[] {
  const tiles = findTiles(
    img,
    (r, g, b) => (isPanelNavy(r, g, b) || hsv(r, g, b)[2] < 0.25 ? null : "grey"), // "grey" = any non-background pixel here
    { minSizeFrac: opts.minSizeFrac ?? 0.12, maxSizeFrac: opts.maxSizeFrac ?? 0.6, sameSize: true }
  );
  const out: FoundTile[] = [];
  for (const t of tiles) {
    const ring = ringColour(img, t.box);
    if (ring.colour) out.push({ box: t.box, colour: ring.colour, fill: ring.share });
  }
  return out;
}

/** Dominant rarity colour in the outer ring (≈18%) of a box. */
export function ringColour(img: RGBAImage, box: Box): ColourVote {
  const m = Math.max(2, Math.round(Math.min(box.width, box.height) * 0.18));
  const parts: Box[] = [
    { x: box.x, y: box.y, width: box.width, height: m },
    { x: box.x, y: box.y + box.height - m, width: box.width, height: m },
    { x: box.x, y: box.y + m, width: m, height: box.height - 2 * m },
    { x: box.x + box.width - m, y: box.y + m, width: m, height: box.height - 2 * m },
  ];
  const votes: Partial<Record<TileColour, number>> = {};
  for (const p of parts) {
    const v = dominantTileColour(img, p);
    for (const [k, c] of Object.entries(v.votes)) votes[k as TileColour] = (votes[k as TileColour] ?? 0) + (c ?? 0);
  }
  let best: TileColour | null = null;
  for (const k of Object.keys(votes) as TileColour[]) if (!best || votes[k]! > votes[best]!) best = k;
  const sum = Object.values(votes).reduce((a, b) => a + (b ?? 0), 0);
  return { colour: best, share: best && sum ? votes[best]! / sum : 0, votes };
}

export type GearSlotPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface GearSlotTile extends FoundTile {
  position: GearSlotPosition;
}

/**
 * Hero Gear screen: the four slot tiles sit in a column on each side of the
 * hero model (Goggles top-left, Gloves top-right, Belt bottom-left, Boots
 * bottom-right). Only the outer strips are searched, so the hero art in the
 * middle is never mistaken for a tile. Empty slots are dark navy squares.
 * Light-blue (Rare) tiles can blend into the light-blue page background and
 * may be missed — the review screen always lets the user set the quality.
 */
export function findGearSlotTiles(img: RGBAImage): GearSlotTile[] {
  const out: GearSlotTile[] = [];
  const stripW = Math.round(img.width * 0.36);
  for (const side of ["left", "right"] as const) {
    const x0 = side === "left" ? 0 : img.width - stripW;
    const strip = cropView(img, { x: x0, y: 0, width: stripW, height: img.height });
    const tiles = findTiles(
      strip,
      (r, g, b) => {
        if (isPanelNavy(r, g, b)) return "empty";
        const c = pixelTileColour(r, g, b);
        return c && c !== "blue" && c !== "grey" ? c : null;
      },
      { minSizeFrac: 0.35, maxSizeFrac: 0.95, sameSize: false }
    )
      .filter((t) => t.box.width >= img.width * 0.08 && t.box.width <= img.width * 0.3)
      .map((t) => ({ ...t, box: { ...t.box, x: t.box.x + x0 } }));
    // The two slot tiles on each side are the same size and stacked vertically.
    const pairs = pickStackedPair(tiles);
    pairs.forEach((t, i) => out.push({ ...t, position: `${i === 0 ? "top" : "bottom"}-${side}` as GearSlotPosition }));
  }
  return out;
}

function pickStackedPair(tiles: FoundTile[]): FoundTile[] {
  let best: [FoundTile, FoundTile] | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < tiles.length; i++)
    for (let j = 0; j < tiles.length; j++) {
      const a = tiles[i], b = tiles[j];
      if (b.box.y <= a.box.y + a.box.height * 0.8) continue;
      const sizeDiff = Math.abs(a.box.width - b.box.width) / Math.max(a.box.width, b.box.width);
      const xDiff = Math.abs(a.box.x + a.box.width / 2 - (b.box.x + b.box.width / 2)) / a.box.width;
      const gap = (b.box.y - (a.box.y + a.box.height)) / a.box.height;
      if (sizeDiff > 0.25 || xDiff > 0.3 || gap > 2.5) continue;
      const score = sizeDiff + xDiff + Math.abs(gap - 0.8) * 0.2;
      if (score < bestScore) { bestScore = score; best = [a, b]; }
    }
  return best ?? [];
}

/** Row-copy crop (kept local so this file has no imports beyond types). */
function cropView(img: RGBAImage, box: Box): RGBAImage {
  const w = box.width, h = box.height;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((box.y + y) * img.width + box.x) * 4;
    out.set(img.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { data: out, width: w, height: h };
}
