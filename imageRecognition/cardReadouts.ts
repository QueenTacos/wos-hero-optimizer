// ============================================================================
// Non-identity readouts from a roster card: star/tier and the level label box.
//
// Stars: each star is a 6-petal snowflake and each lit (cyan) petal is one
// tier (spec §12: 6 tiers per star). On the reference screenshots one petal
// ≈ 25 cyan pixels and a full star ≈ 150, so partial stars fall on clean
// multiples. We count cyan pixels per star slot and divide by the full-star
// area measured from the same card set (or a fallback ratio).
//
// Level: returned as a box for OCR (the "Lv. 12" label). The number is read
// by the OCR engine, never by portrait matching.
// ============================================================================

import { Box, RGBAImage } from "./pixels";
import { TIERS_PER_STAR } from "../lib/data/shardTable";

/** Star strip, as fractions of the card box (measured on reference cards). */
const STAR_STRIP = { x0: 0.06, x1: 0.94, y0: 0.88, y1: 0.985 };
/** "Lv. N" label, as fractions of the card box. */
export const LEVEL_LABEL = { x0: 0.06, x1: 0.62, y0: 0.76, y1: 0.875 };
/** Fallback: full-star cyan area as a fraction of one star slot's box. */
const FULL_STAR_FILL = 0.195;

function isCyan(r: number, g: number, b: number) {
  return b > 170 && g > 150 && r < 170 && b - r > 60 && g - r > 40;
}

/** Cyan pixel count in each of the 5 star slots, plus the slot box area. */
export function starSlotAreas(card: RGBAImage): { areas: number[]; slotArea: number } {
  const x0 = Math.round(card.width * STAR_STRIP.x0);
  const x1 = Math.round(card.width * STAR_STRIP.x1);
  const y0 = Math.round(card.height * STAR_STRIP.y0);
  const y1 = Math.min(card.height, Math.round(card.height * STAR_STRIP.y1));
  const slotW = (x1 - x0) / 5;
  const areas = [0, 0, 0, 0, 0];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * card.width + x) * 4;
      if (isCyan(card.data[i], card.data[i + 1], card.data[i + 2])) {
        areas[Math.min(4, Math.floor((x - x0) / slotW))]++;
      }
    }
  }
  return { areas, slotArea: slotW * (y1 - y0) };
}

export interface StarReadout {
  stars: number; // 0-5 full stars
  tier: number; // 0-5 petals into the next star
  confidence: number;
  petalsPerSlot: number[];
}

/**
 * @param fullStarArea cyan pixels in one full star for this screenshot's
 *   card size. Pass the value measured across all cards of the screenshot
 *   (see `estimateFullStarArea`); falls back to a fixed ratio otherwise.
 */
export function readStars(card: RGBAImage, fullStarArea?: number): StarReadout {
  const { areas, slotArea } = starSlotAreas(card);
  const full = fullStarArea && fullStarArea > 0 ? fullStarArea : slotArea * FULL_STAR_FILL;
  const ratio = areas.map((a) => a / full);

  // Stars always fill left to right. Slots at ≥ 87% of a full star count as
  // full (5 petals would be 83%); the first slot below that is the partial
  // star, counted in petals; anything after it should be empty.
  const FULL_THRESHOLD = 0.87;
  let partialIdx = ratio.findIndex((r) => r < FULL_THRESHOLD);
  if (partialIdx < 0) partialIdx = 5;
  const petals = ratio.map((r, i) =>
    i < partialIdx ? TIERS_PER_STAR : i === partialIdx ? Math.min(TIERS_PER_STAR - 1, Math.round(r * TIERS_PER_STAR)) : 0
  );
  const trailing = ratio.slice(partialIdx + 1).reduce((s, r) => s + r, 0);

  const stars = partialIdx;
  const tier = stars >= 5 ? 0 : petals[partialIdx];

  // Lower confidence when the partial star sits between two petal counts,
  // or when "empty" slots after it aren't empty (unexpected layout).
  const partialRatio = partialIdx < 5 ? ratio[partialIdx] * TIERS_PER_STAR : 0;
  const residual = Math.abs(partialRatio - Math.round(partialRatio));
  const confidence = trailing > 0.15 ? 0.2 : Math.max(0.3, Math.min(0.9, 0.9 - residual));
  return { stars, tier, confidence, petalsPerSlot: petals };
}

/** Median cyan area of the clearly-full star slots across a screenshot's cards. */
export function estimateFullStarArea(cards: RGBAImage[]): number | undefined {
  const all = cards.flatMap((c) => starSlotAreas(c).areas).filter((a) => a > 0);
  if (all.length === 0) return undefined;
  const max = Math.max(...all);
  const fullish = all.filter((a) => a >= max * 0.85).sort((a, b) => a - b);
  return fullish.length >= 3 ? fullish[Math.floor(fullish.length / 2)] : undefined;
}

export function levelLabelBox(cardBox: Box): Box {
  return {
    x: cardBox.x + cardBox.width * LEVEL_LABEL.x0,
    y: cardBox.y + cardBox.height * LEVEL_LABEL.y0,
    width: cardBox.width * (LEVEL_LABEL.x1 - LEVEL_LABEL.x0),
    height: cardBox.height * (LEVEL_LABEL.y1 - LEVEL_LABEL.y0),
  };
}

/** "Lv. 12" / "Lv.12" / "LV 7" -> 12 / 12 / 7. Level must be 1-80. */
export function parseLevelText(text: string): number | null {
  const m = text.replace(/\s+/g, " ").match(/l\s*v\s*\.?\s*(\d{1,2})/i) ?? text.match(/^\s*(\d{1,2})\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 80 ? n : null;
}
