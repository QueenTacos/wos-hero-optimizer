// ============================================================================
// Enhancement Component tiles, read TILE BY TILE (not whole-screen OCR).
//
//   screenshot
//   → find item tiles (square regions separated by the navy backpack background)
//   → keep tiles that show the component (light-blue nut) icon
//   → per tile:  TOP ~28%    → denomination, must read exactly 10 or 100
//                BOTTOM ~36% → quantity owned, read with 5 preprocessing variants
//   → consensus + glyph evidence → value, confidence, alternates
//
// Position inside the tile decides the role of each number, so the top value
// (10 / 100) and the quantity can never swap. Tile colour (purple = 100,
// green = 10) is only a cross-check / fallback, never the sole classifier.
// ============================================================================

import type { Box, RGBAImage } from "../../imageRecognition/pixels";
import { crop } from "../../imageRecognition/pixels";
import { findRarityTiles, TileColour } from "../../imageRecognition/gearTiles";
import { binarizeWhite, fiveVersusTwo, outlinedView, locateDigits, pad, quantityVariants, segmentGlyphs, upscaleForOcr } from "../../imageRecognition/numberCrops";
import { decideQuantity, OcrReading, QuantityDecision, QuantityEvidence } from "./numberConsensus";
import type { OcrWord } from "./quantityTokens";

/** OCR of an already-prepared crop (black text on white). */
export type ReadCrop = (img: RGBAImage, opts: { whitelist: string; singleLine: boolean }) => Promise<OcrWord[]>;

export const COMPONENT_DENOMINATIONS = [10, 100] as const;
export type Denomination = (typeof COMPONENT_DENOMINATIONS)[number];

const COLOUR_DENOMINATION: Partial<Record<TileColour, Denomination>> = { purple: 100, green: 10 };

export interface ComponentTileReading {
  denomination: Denomination;
  denominationSource: "ocr" | "colour";
  denominationConfidence: number;
  colour: TileColour | "empty";
  /** Tile colour matches the denomination (purple 100 / green 10). */
  colourAgrees: boolean;
  tileBox: Box;
  quantityBox: Box;
  quantity: QuantityDecision;
  /** Raw OCR of each variant, kept for the local debug log. */
  readings: OcrReading[];
}

export interface ComponentTilesResult {
  tiles: ComponentTileReading[];
  notes: string[];
}

/** Share of light-blue "nut" pixels in the middle of a tile. */
export function nutIconShare(img: RGBAImage, tile: Box): number {
  const x0 = Math.round(tile.x + tile.width * 0.2), x1 = Math.round(tile.x + tile.width * 0.8);
  const y0 = Math.round(tile.y + tile.height * 0.25), y1 = Math.round(tile.y + tile.height * 0.75);
  let hit = 0, n = 0;
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      if (b > 190 && g > 150 && r < 200 && b - r > 30) hit++;
      n++;
    }
  return n ? hit / n : 0;
}

export function denominationRegion(t: Box): Box {
  return { x: t.x + t.width * 0.15, y: t.y + t.height * 0.02, width: t.width * 0.7, height: t.height * 0.28 };
}
export function quantityRegion(t: Box): Box {
  return { x: t.x + t.width * 0.04, y: t.y + t.height * 0.62, width: t.width * 0.93, height: t.height * 0.35 };
}

const digitsOnly = (words: OcrWord[]) => words.map((w) => w.text).join("").replace(/[^\d,]/g, "");

async function readDenomination(img: RGBAImage, t: Box, readCrop: ReadCrop): Promise<{ value: Denomination | null; confidence: number }> {
  const up = upscaleForOcr(crop(img, denominationRegion(t)), 150);
  const m = Math.round(up.height * 0.15);
  let best: { value: Denomination | null; confidence: number } = { value: null, confidence: 0 };
  for (const [thr, sat] of [[200, 60], [170, 90]] as const) {
    const words = await readCrop(pad(binarizeWhite(up, thr, sat), m), { whitelist: "0123456789", singleLine: true });
    const text = digitsOnly(words);
    const v = Number(text);
    // Validated against the known denominations — anything else is not a denomination.
    if ((v === 10 || v === 100) && text.length === String(v).length) {
      const conf = Math.min(...words.map((w) => w.confidence), 1);
      if (!best.value) best = { value: v, confidence: conf };
      else if (best.value === v) return { value: v, confidence: Math.max(best.confidence, conf, 0.9) };
      else return { value: null, confidence: 0 }; // two passes disagree: don't trust either
    }
  }
  return best;
}

/**
 * Tight box around the digits inside the tile's quantity area (image coords),
 * found on a white-text binarisation. Falls back to the whole area.
 */
export function locateQuantityDigits(img: RGBAImage, t: Box): { box: Box; located: boolean } {
  const area = quantityRegion(t);
  const region = crop(img, area);
  const up = upscaleForOcr(region);
  const f = up.width / region.width;
  const found =
    locateDigits(outlinedView(up)) ?? locateDigits(binarizeWhite(up, 200, 60)) ?? locateDigits(binarizeWhite(up, 170, 90));
  if (!found) return { box: area, located: false };
  const m = (found.height / f) * 0.3;
  const x = Math.max(area.x, area.x + found.x / f - m);
  const y = Math.max(area.y, area.y + found.y / f - m);
  const x1 = Math.min(area.x + area.width, area.x + (found.x + found.width) / f + m);
  const y1 = Math.min(area.y + area.height, area.y + (found.y + found.height) / f + m);
  return { box: { x, y, width: x1 - x, height: y1 - y }, located: true };
}

async function readQuantity(img: RGBAImage, t: Box, readCrop: ReadCrop): Promise<{ decision: QuantityDecision; readings: OcrReading[]; box: Box }> {
  // The whole bottom area goes in; quantityVariants isolates the number line itself.
  const region = crop(img, quantityRegion(t));
  const { box } = locateQuantityDigits(img, t); // for highlighting on the review screen
  const readings: OcrReading[] = [];
  const variants = quantityVariants(region);
  for (const v of variants) {
    const words = await readCrop(v.image, { whitelist: "0123456789,", singleLine: true });
    if (!words.length) continue;
    readings.push({ variant: v.name, text: words.map((w) => w.text).join(""), confidence: Math.min(...words.map((w) => w.confidence)) });
  }
  // Too little agreement → also read the clean variants in sparse mode (a different page-layout guess).
  const agreeing = (t: string) => readings.filter((r) => r.text.replace(/\D/g, "") === t.replace(/\D/g, "")).length;
  if (!readings.length || Math.max(...readings.map((r) => agreeing(r.text))) < 2) {
    for (const v of variants.filter((x) => x.name.startsWith("white"))) {
      const words = await readCrop(v.image, { whitelist: "0123456789,", singleLine: false });
      if (!words.length) continue;
      const main = [...words].sort((a, b) => b.bbox.height * b.bbox.width - a.bbox.height * a.bbox.width)[0];
      readings.push({ variant: `${v.name}-sparse`, text: main.text, confidence: main.confidence });
    }
  }
  // Glyph evidence from the main binarised variant.
  const bin = variants[0].image;
  const glyphs = segmentGlyphs(bin).filter((g) => !g.isComma);
  const evidence: QuantityEvidence = {};
  if (glyphs.length >= 1 && glyphs.length <= 7) {
    evidence.digitCount = glyphs.length;
    evidence.fiveTwo = glyphs.map((g) => fiveVersusTwo(bin, g.box));
  }
  let decision = decideQuantity(readings, evidence);
  // Glyph evidence that contradicts every reading's length is probably icon pixels — decide without it.
  if (evidence.digitCount && !decision.candidates.some((c) => String(c.value).length === evidence.digitCount)) decision = decideQuantity(readings);
  return { decision, readings, box };
}

export async function readComponentTiles(img: RGBAImage, readCrop: ReadCrop): Promise<ComponentTilesResult> {
  const notes: string[] = [];
  const candidates = findRarityTiles(img).filter((t) => nutIconShare(img, t.box) >= 0.08);
  const byDenom = new Map<Denomination, ComponentTileReading>();
  for (const tile of candidates) {
    const colourDenom = tile.colour === "empty" ? undefined : COLOUR_DENOMINATION[tile.colour];
    const d = await readDenomination(img, tile.box, readCrop);
    let denomination: Denomination | null = d.value;
    let source: ComponentTileReading["denominationSource"] = "ocr";
    let dConf = d.confidence;
    if (!denomination && colourDenom) {
      denomination = colourDenom;
      source = "colour";
      dConf = 0.5;
      notes.push(`The top number of the ${tile.colour} tile couldn't be read as 10 or 100; its colour says ${colourDenom} XP — please check.`);
    }
    if (!denomination) continue;
    const colourAgrees = colourDenom === denomination;
    if (source === "ocr" && colourDenom && !colourAgrees) notes.push(`A ${tile.colour} tile reads “${denomination}” at the top — unusual colour for that component.`);
    const q = await readQuantity(img, tile.box, readCrop);
    const reading: ComponentTileReading = {
      denomination,
      denominationSource: source,
      denominationConfidence: dConf,
      colour: tile.colour,
      colourAgrees,
      tileBox: tile.box,
      quantityBox: q.box,
      quantity: q.decision,
      readings: q.readings,
    };
    const prev = byDenom.get(denomination);
    if (prev) {
      notes.push(`Found more than one ${denomination} XP tile; kept the clearer one.`);
      if (prev.quantity.confidence >= reading.quantity.confidence) continue;
    }
    byDenom.set(denomination, reading);
  }
  for (const v of COMPONENT_DENOMINATIONS) if (!byDenom.has(v)) notes.push(`Couldn't find a complete ${v} XP component tile.`);
  return { tiles: [...byDenom.values()].sort((a, b) => b.denomination - a.denomination), notes };
}
