// ============================================================================
// Structured resource readers (Phase 2). Pure functions over OCR words, plus
// optional pixel checks when the image is available.
//
// Hero XP  — find the "Hero XP" label, take the number on the same row
//            (e.g. "143.39M" → 143,390,000). Confirmed by the blue EXP-bottle
//            icon to the left of the label when pixels are available.
// Components — each backpack tile shows the XP PER ITEM at the top ("10" /
//            "100") and the QUANTITY OWNED at the bottom ("40,526" / "171").
//            We pair each value label with the number directly below it in
//            the same tile, so the two are never confused. Confirmed by tile
//            colour (100 = purple, 10 = green) and the blue nut icon.
//
// Calibrated on the real screenshots in
// docs/package/reference-screenshots/06_real_test_cases. Everything still
// goes to the Review screen.
// ============================================================================

import { OcrWord, BBox, parseQuantityText } from "./quantityTokens";
import type { RGBAImage } from "../../imageRecognition/pixels";

/** "143.39M" → 143390000 · "40,526" → 40526 · "10.42K" → 10420 · "6.49M" → 6490000. Null if not a number. */
export const parseGameNumber = parseQuantityText;

const cy = (b: BBox) => b.y + b.height / 2;
const cx = (b: BBox) => b.x + b.width / 2;

function sameRow(a: BBox, b: BBox) {
  const h = Math.max(a.height, b.height);
  return Math.abs(cy(a) - cy(b)) <= h * 0.6;
}

function avgColor(img: RGBAImage, box: BBox): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.width, Math.floor(box.x + box.width)), y1 = Math.min(img.height, Math.floor(box.y + box.height));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.width + x) * 4;
    r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}

function fraction(img: RGBAImage, box: BBox, test: (r: number, g: number, b: number) => boolean): number {
  let hit = 0, n = 0;
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.width, Math.floor(box.x + box.width)), y1 = Math.min(img.height, Math.floor(box.y + box.height));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.width + x) * 4;
    if (test(img.data[i], img.data[i + 1], img.data[i + 2])) hit++;
    n++;
  }
  return n ? hit / n : 0;
}

// ---------------------------------------------------------------------------
// Hero XP
// ---------------------------------------------------------------------------

export interface HeroXpReading {
  value: number | null;
  rawText: string;
  confidence: number;
  labelFound: boolean;
  /** true/false when pixels were checked, null when not available. */
  iconConfirmed: boolean | null;
  valueBox?: BBox;
  notes: string[];
}

export function readHeroXpTotal(words: OcrWord[], img?: RGBAImage): HeroXpReading {
  const notes: string[] = [];
  // Find "Hero" followed by "XP"/"EXP" on the same row (OCR sometimes splits or joins them).
  let label: BBox | null = null;
  for (let i = 0; i < words.length; i++) {
    const t = words[i].text.replace(/[^a-z]/gi, "").toLowerCase();
    if (t === "heroxp" || t === "heroexp") { label = words[i].bbox; break; }
    if (t === "hero") {
      const next = words.find((w) => w !== words[i] && /^e?xp$/i.test(w.text.replace(/[^a-z]/gi, "")) && sameRow(w.bbox, words[i].bbox) && w.bbox.x > words[i].bbox.x);
      if (next) {
        const a = words[i].bbox;
        label = { x: a.x, y: Math.min(a.y, next.bbox.y), width: next.bbox.x + next.bbox.width - a.x, height: Math.max(a.height, next.bbox.height) };
        break;
      }
    }
  }
  if (!label) return { value: null, rawText: "", confidence: 0, labelFound: false, iconConfirmed: null, notes: ["Couldn't find the “Hero XP” label."] };

  // The amount is the right-most number on the label's row, to the right of the label.
  const onRow = words
    .filter((w) => sameRow(w.bbox, label!) && w.bbox.x > label!.x + label!.width && parseGameNumber(w.text) !== null)
    .sort((a, b) => b.bbox.x - a.bbox.x);
  const hit = onRow[0];
  if (!hit) return { value: null, rawText: "", confidence: 0.2, labelFound: true, iconConfirmed: null, notes: ["Found “Hero XP” but no amount on the same row."] };

  let iconConfirmed: boolean | null = null;
  if (img) {
    const h = label.height;
    const iconBox = { x: label.x - h * 4.5, y: cy(label) - h * 2, width: h * 4, height: h * 4 };
    iconConfirmed = fraction(img, iconBox, (r, g, b) => b > 170 && b - r > 90 && g < 200) > 0.02;
    if (!iconConfirmed) notes.push("The Hero XP bottle icon wasn't recognised next to the label.");
  }
  if (onRow.length > 1) notes.push(`Several numbers on the Hero XP row; used the right-most (“${hit.text}”).`);
  const value = parseGameNumber(hit.text);
  const confidence = value === null ? 0 : iconConfirmed === false ? 0.6 : 0.9;
  return { value, rawText: hit.text, confidence, labelFound: true, iconConfirmed, valueBox: hit.bbox, notes };
}

// ---------------------------------------------------------------------------
// Enhancement Components
// ---------------------------------------------------------------------------

export interface ComponentReading {
  xpPerItem: 10 | 100;
  quantity: number;
  rawQuantityText: string;
  confidence: number;
  valueBox: BBox;
  quantityBox: BBox;
  /** true/false when tile colour + nut icon were checked, null when not available. */
  tileConfirmed: boolean | null;
}

export interface ComponentsReading {
  xp10: ComponentReading | null;
  xp100: ComponentReading | null;
  /** Value labels found (tile confirmed when pixels were available) but no quantity read under them —
   *  the caller should OCR `quantityRegion` on its own and call `completeComponentReading`. */
  unpaired: { xpPerItem: 10 | 100; valueBox: BBox; quantityRegion: BBox; tileConfirmed: boolean | null }[];
  notes: string[];
}

const TILE_COLOR: Record<10 | 100, (c: [number, number, number]) => boolean> = {
  100: ([r, g, b]) => b > g + 40 && r > g + 20, // purple
  10: ([r, g, b]) => g > r + 25 && g > b + 25, // green
};

export function readEnhancementComponents(words: OcrWord[], img?: RGBAImage): ComponentsReading {
  const notes: string[] = [];
  const numbers = words.map((w) => ({ w, v: parseGameNumber(w.text) })).filter((x): x is { w: OcrWord; v: number } => x.v !== null);
  const labels = numbers.filter((n) => n.v === 10 || n.v === 100);
  const used = new Set<OcrWord>();
  const unpaired: ComponentsReading["unpaired"] = [];
  const found: Partial<Record<10 | 100, ComponentReading>> = {};

  // Largest labels first isn't meaningful; go top-to-bottom, left-to-right.
  labels.sort((a, b) => a.w.bbox.y - b.w.bbox.y || a.w.bbox.x - b.w.bbox.x);
  for (const L of labels) {
    if (used.has(L.w)) continue;
    const h = L.w.bbox.height;
    // Quantity sits lower in the same tile: 2.5–8 label-heights below, roughly under it.
    const below = numbers
      .filter((n) => n.w !== L.w && !used.has(n.w))
      .map((n) => ({ n, dy: cy(n.w.bbox) - cy(L.w.bbox), dx: cx(n.w.bbox) - cx(L.w.bbox) }))
      .filter(({ dy, dx }) => dy >= h * 2.5 && dy <= h * 8 && Math.abs(dx) <= h * 4)
      .sort((a, b) => a.dy + Math.abs(a.dx) - (b.dy + Math.abs(b.dx)));
    const q = below[0]?.n;
    const xpPerItem = L.v as 10 | 100;
    if (!q) {
      // Either a quantity OCR missed, or this "10"/"100" is itself a quantity. Only a
      // correctly coloured tile with a nut icon counts as a component label.
      if (img && !found[xpPerItem] && !unpaired.some((u) => u.xpPerItem === xpPerItem)) {
        const { colorOk, nutOk } = tileChecks(img, L.w.bbox, xpPerItem, L.w.bbox.y + h * 7.4);
        if (colorOk && nutOk) {
          unpaired.push({
            xpPerItem,
            valueBox: L.w.bbox,
            quantityRegion: { x: cx(L.w.bbox) - h * 2.2, y: L.w.bbox.y + h * 4.2, width: h * 7.4, height: h * 4.4 },
            tileConfirmed: true,
          });
        }
      }
      continue;
    }
    let tileConfirmed: boolean | null = null;
    if (img) {
      const { colorOk, nutOk } = tileChecks(img, L.w.bbox, xpPerItem, cy(q.w.bbox));
      tileConfirmed = colorOk && nutOk;
      if (!colorOk) notes.push(`The “${xpPerItem}” tile isn't the expected colour (${xpPerItem === 100 ? "purple" : "green"}).`);
      if (!nutOk) notes.push(`No component (nut) icon recognised in the “${xpPerItem}” tile.`);
    }
    if (found[xpPerItem]) {
      notes.push(`Found more than one “${xpPerItem}” component tile; using the first.`);
      continue;
    }
    used.add(L.w);
    used.add(q.w);
    found[xpPerItem] = {
      xpPerItem,
      quantity: q.v,
      rawQuantityText: q.w.text,
      confidence: tileConfirmed === false ? 0.5 : 0.85,
      valueBox: L.w.bbox,
      quantityBox: q.w.bbox,
      tileConfirmed,
    };
  }
  for (const v of [10, 100] as const) {
    if (!found[v] && !unpaired.some((u) => u.xpPerItem === v)) notes.push(`Couldn't find the ${v} XP component tile.`);
  }
  return { xp10: found[10] ?? null, xp100: found[100] ?? null, unpaired, notes };
}

function tileChecks(img: RGBAImage, label: BBox, xpPerItem: 10 | 100, quantityCenterY: number) {
  const h = label.height;
  const tileBody: BBox = { x: cx(label) - h * 3, y: label.y + h * 1.2, width: h * 6, height: Math.max(h, quantityCenterY - label.y - h * 1.6) };
  const edge: BBox = { x: tileBody.x, y: label.y, width: h * 1.2, height: h }; // tile background next to the label
  return {
    colorOk: TILE_COLOR[xpPerItem](avgColor(img, edge)),
    nutOk: fraction(img, tileBody, (r, g, b) => b > 190 && g > 150 && r < 200 && b - r > 30) > 0.2,
  };
}

/**
 * Fills in a component whose quantity the full-screen OCR missed, from OCR of
 * a close-up of just that tile's quantity area. Words are in CROP coordinates.
 */
export function completeComponentReading(
  reading: ComponentsReading,
  unpaired: ComponentsReading["unpaired"][number],
  cropWords: OcrWord[]
): ComponentsReading {
  const nums = cropWords
    .map((w) => ({ w, v: parseGameNumber(w.text) }))
    .filter((x): x is { w: OcrWord; v: number } => x.v !== null)
    .sort((a, b) => b.w.bbox.width * b.w.bbox.height - a.w.bbox.width * a.w.bbox.height);
  const key = unpaired.xpPerItem === 10 ? "xp10" : "xp100";
  const rest = { ...reading, unpaired: reading.unpaired.filter((u) => u !== unpaired) };
  if (!nums[0]) return { ...rest, notes: [...rest.notes, `Found the ${unpaired.xpPerItem} XP tile but couldn't read how many you own.`] };
  const q = nums[0];
  const R = unpaired.quantityRegion;
  return {
    ...rest,
    [key]: {
      xpPerItem: unpaired.xpPerItem,
      quantity: q.v,
      rawQuantityText: q.w.text,
      confidence: 0.7,
      valueBox: unpaired.valueBox,
      quantityBox: { x: R.x + q.w.bbox.x, y: R.y + q.w.bbox.y, width: q.w.bbox.width, height: q.w.bbox.height },
      tileConfirmed: unpaired.tileConfirmed,
    },
    notes: [...rest.notes, `The ${unpaired.xpPerItem} XP quantity was re-read from a close-up of its tile — please check it.`],
  };
}

export function enhancementXpFrom(xp10Qty: number | null, xp100Qty: number | null) {
  const a = (xp10Qty ?? 0) * 10;
  const b = (xp100Qty ?? 0) * 100;
  return { fromXp10: a, fromXp100: b, total: a + b };
}
