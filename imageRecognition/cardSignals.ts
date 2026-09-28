// ============================================================================
// Secondary card signal: the troop-type icon (top-left). Used to CROSS-CHECK
// the portrait match and to tell duplicates apart when merging overlapping
// screenshots — never as the primary identity signal.
//
// Measured: 26/26 correct on the held-out real screenshots
// (06_real_test_cases), 16/16 on the originals.
//
// Not included: the corner badge ("S3"/"S4"). A colour-based detector was
// tried and gave false positives on bright orange card art (Flint, Jeronimo,
// Zinman, Philly), so it was left out rather than shipped unreliable.
//
// Troop icon: the white symbol (spear / shield / crossbow) is extracted as a
// 20×20 "whiteness" map and compared (NCC) with templates averaged from cards
// of known heroes. Templates are generated from the ORIGINAL reference
// screenshots only (scripts/buildTroopIconTemplates.ts) so the newer real
// screenshots stay an independent test set.
// ============================================================================

import { RGBAImage } from "./pixels";
import { TroopType } from "../lib/types";
import { TROOP_ICON_TEMPLATES } from "../lib/data/troopIconTemplates";

export const ICON_REGION = { x0: 0.05, x1: 0.27, y0: 0.025, y1: 0.155 };
export const ICON_GRID = 20;

/** Whiteness (bright + unsaturated) of each cell in the icon region, 20×20, zero-mean unit-norm. */
export function troopIconVector(card: RGBAImage): Float32Array {
  const x0 = card.width * ICON_REGION.x0, x1 = card.width * ICON_REGION.x1;
  const y0 = card.height * ICON_REGION.y0, y1 = card.height * ICON_REGION.y1;
  const v = new Float32Array(ICON_GRID * ICON_GRID);
  const cw = (x1 - x0) / ICON_GRID, ch = (y1 - y0) / ICON_GRID;
  for (let gy = 0; gy < ICON_GRID; gy++) {
    for (let gx = 0; gx < ICON_GRID; gx++) {
      let s = 0, n = 0;
      for (let y = Math.floor(y0 + gy * ch); y < Math.floor(y0 + (gy + 1) * ch); y++) {
        for (let x = Math.floor(x0 + gx * cw); x < Math.floor(x0 + (gx + 1) * cw); x++) {
          const i = (y * card.width + x) * 4;
          const r = card.data[i], g = card.data[i + 1], b = card.data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          s += Math.max(0, Math.min(1, (lum - 150) / 80)) * (sat < 70 ? 1 : 0);
          n++;
        }
      }
      v[gy * ICON_GRID + gx] = n ? s / n : 0;
    }
  }
  return normalize(v);
}

function normalize(v: Float32Array): Float32Array {
  let m = 0;
  for (const x of v) m += x;
  m /= v.length;
  let ss = 0;
  for (let i = 0; i < v.length; i++) {
    v[i] -= m;
    ss += v[i] * v[i];
  }
  const n = Math.sqrt(ss) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export interface TroopIconReading {
  troopType: TroopType | null;
  confidence: number;
  scores: Record<TroopType, number>;
}

export function readTroopIcon(card: RGBAImage, templates: Record<TroopType, number[]> = TROOP_ICON_TEMPLATES): TroopIconReading {
  const v = troopIconVector(card);
  const scores = {} as Record<TroopType, number>;
  for (const t of Object.keys(templates) as TroopType[]) {
    const tpl = templates[t];
    let d = 0;
    for (let i = 0; i < v.length; i++) d += v[i] * tpl[i];
    scores[t] = d;
  }
  const sorted = (Object.entries(scores) as [TroopType, number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = sorted;
  if (!best || best[1] < 0.3) return { troopType: null, confidence: 0, scores };
  const confidence = Math.max(0, Math.min(1, (best[1] - second[1]) / 0.3)) * Math.min(1, best[1] / 0.7);
  return { troopType: best[0], confidence, scores };
}

/** Builds averaged templates from cards with known troop types (used by the template script and tests). */
export function buildTroopIconTemplates(samples: { card: RGBAImage; troopType: TroopType }[]): Record<TroopType, number[]> {
  const acc: Record<string, Float32Array> = {};
  for (const s of samples) {
    const v = troopIconVector(s.card);
    acc[s.troopType] ??= new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) acc[s.troopType][i] += v[i];
  }
  const out = {} as Record<TroopType, number[]>;
  for (const t of Object.keys(acc) as TroopType[]) out[t] = Array.from(normalize(acc[t]), (x) => Math.round(x * 1e4) / 1e4);
  return out;
}
