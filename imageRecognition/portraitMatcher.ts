// ============================================================================
// Local portrait matcher — compares a cropped roster card against every
// portrait in the local hero portrait library (public/assets/heroes/portraits).
//
// Method: normalized cross-correlation (NCC) of RGB pixels.
//   The library portraits are close crops of the same art shown on roster
//   cards. Measured on the reference roster screenshots, a portrait lines up
//   with its card at ~0.85–1.13× the card width, horizontally centred, with a
//   hero-specific vertical offset. So we slide each portrait over a small
//   window of placements and scales and keep the best correlation.
//   Only the central 60% of each portrait is compared, so portrait/card
//   background colour differences (e.g. Sergey: blue portrait, purple card)
//   matter less.
//
// Two stages keep it fast enough for phones:
//   1. coarse (24 px wide): score all 65 heroes, keep a shortlist
//   2. fine   (48 px wide): re-score the shortlist with more scales/offsets
//
// Status: prototype. Measured 26/26 correct (top-1) on the two reference
// roster screenshots — see __tests__/rosterRecognition.test.ts. That is a
// small sample from one device and resolution. Results always go through the
// Review screen and must be confirmed by the user.
// ============================================================================

import { RGBAImage, resize, toRgbFloat } from "./pixels";

export interface HeroRecognitionResult {
  heroId: string;
  /** 0-1. Blends absolute similarity with the gap to the runner-up. Not a calibrated probability. */
  confidence: number;
  /** Raw best NCC score (-1..1), for debugging and tuning. */
  score: number;
}

interface Template {
  scale: number;
  size: number; // full template edge in px at this stage
  margin: number; // px trimmed each side (inner window)
  inner: number; // inner edge length
  vec: Float32Array; // zero-mean, unit-norm inner RGB
}

interface StageConfig {
  cardWidth: number;
  scales: number[];
  /** Search window for the full template's top-left, as fractions of card width. */
  xRange: [number, number];
  yRange: [number, number];
  step: number;
}

const INNER = 0.6;
const STAGE1: StageConfig = { cardWidth: 24, scales: [0.9, 0.97, 1.05], xRange: [-0.16, 0.1], yRange: [0.08, 0.46], step: 1 };
const STAGE2: StageConfig = {
  cardWidth: 48,
  scales: [0.83, 0.88, 0.93, 0.97, 1.02, 1.08, 1.14],
  xRange: [-0.16, 0.1],
  yRange: [0.08, 0.46],
  step: 1,
};
const SHORTLIST = 8;

export interface PortraitIndex {
  heroIds: string[];
  stage1: Template[][]; // [hero][scale]
  stage2: Template[][];
}

function makeTemplate(img: RGBAImage, cardWidth: number, scale: number): Template {
  const size = Math.max(4, Math.round(cardWidth * scale));
  const margin = Math.round((size * (1 - INNER)) / 2);
  const inner = size - 2 * margin;
  const small = resize(img, size, size);
  const rgb = toRgbFloat(small);
  const vec = new Float32Array(inner * inner * 3);
  let k = 0;
  for (let y = margin; y < margin + inner; y++) {
    for (let x = margin; x < margin + inner; x++) {
      const p = (y * size + x) * 3;
      vec[k++] = rgb[p];
      vec[k++] = rgb[p + 1];
      vec[k++] = rgb[p + 2];
    }
  }
  normalize(vec);
  return { scale, size, margin, inner, vec };
}

function normalize(v: Float32Array) {
  let mean = 0;
  for (let i = 0; i < v.length; i++) mean += v[i];
  mean /= v.length;
  let ss = 0;
  for (let i = 0; i < v.length; i++) {
    v[i] -= mean;
    ss += v[i] * v[i];
  }
  const n = Math.sqrt(ss) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
}

/** Build once per session from the portrait library. */
export function buildPortraitIndex(portraits: { heroId: string; image: RGBAImage }[]): PortraitIndex {
  return {
    heroIds: portraits.map((p) => p.heroId),
    stage1: portraits.map((p) => STAGE1.scales.map((s) => makeTemplate(p.image, STAGE1.cardWidth, s))),
    stage2: portraits.map((p) => STAGE2.scales.map((s) => makeTemplate(p.image, STAGE2.cardWidth, s))),
  };
}

interface Region {
  rgb: Float32Array;
  w: number;
  h: number;
}

function cardRegion(card: RGBAImage, cardWidth: number): Region {
  const h = Math.round((card.height * cardWidth) / card.width);
  return { rgb: toRgbFloat(resize(card, cardWidth, h)), w: cardWidth, h };
}

/** Best NCC of one template over the search window. */
function bestNcc(region: Region, t: Template, cfg: StageConfig): number {
  const W = region.w;
  const xMin = Math.max(-t.margin, Math.floor(cfg.xRange[0] * W));
  const xMax = Math.min(W - t.margin - t.inner, Math.ceil(cfg.xRange[1] * W));
  const yMin = Math.max(-t.margin, Math.floor(cfg.yRange[0] * W));
  const yMax = Math.min(region.h - t.margin - t.inner, Math.ceil(cfg.yRange[1] * W));
  const n = t.inner * t.inner * 3;
  let best = -1;
  for (let ty = yMin; ty <= yMax; ty += cfg.step) {
    for (let tx = xMin; tx <= xMax; tx += cfg.step) {
      const ox = tx + t.margin;
      const oy = ty + t.margin;
      let dot = 0, sum = 0, sumSq = 0, k = 0;
      for (let y = 0; y < t.inner; y++) {
        let p = ((oy + y) * W + ox) * 3;
        for (let x = 0; x < t.inner * 3; x++, p++, k++) {
          const v = region.rgb[p];
          dot += v * t.vec[k];
          sum += v;
          sumSq += v * v;
        }
      }
      const variance = sumSq - (sum * sum) / n;
      if (variance <= 1e-6) continue;
      const ncc = dot / Math.sqrt(variance);
      if (ncc > best) best = ncc;
    }
  }
  return best;
}

function heroScore(region: Region, templates: Template[], cfg: StageConfig): number {
  let best = -1;
  for (const t of templates) best = Math.max(best, bestNcc(region, t, cfg));
  return best;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Ranks library heroes for one cropped roster card. Returns the top `topK`
 * candidates, best first. Never throws; returns [] for an empty index.
 */
export function matchCard(index: PortraitIndex, card: RGBAImage, topK = 3): HeroRecognitionResult[] {
  if (index.heroIds.length === 0) return [];

  const r1 = cardRegion(card, STAGE1.cardWidth);
  const coarse = index.heroIds
    .map((heroId, i) => ({ i, heroId, score: heroScore(r1, index.stage1[i], STAGE1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(SHORTLIST, topK));

  const r2 = cardRegion(card, STAGE2.cardWidth);
  const fine = coarse
    .map((c) => ({ heroId: c.heroId, score: heroScore(r2, index.stage2[c.i], STAGE2) }))
    .sort((a, b) => b.score - a.score);

  const best = fine[0].score;
  const second = fine[1]?.score ?? -1;
  // Absolute similarity: correct matches on the reference set scored 0.76–0.99; wrong ones ≤ 0.77.
  const absolute = (s: number) => clamp01((s - 0.6) / 0.35);
  // Separation from the runner-up: correct matches led by ≥ 0.16 on the reference set.
  const margin = clamp01((best - second) / 0.25);

  return fine.slice(0, topK).map((c, rank) => ({
    heroId: c.heroId,
    score: c.score,
    confidence: rank === 0 ? Math.min(0.99, Math.min(absolute(c.score), 0.35 + 0.65 * margin)) : Math.min(0.5, absolute(c.score) * (1 - margin)),
  }));
}
