// ============================================================================
// Hero Gear screen → per-slot readings. Pure (OCR words + slot tiles in,
// suggestions out); every value goes to the Gear review screen.
//
// Three SEPARATE numbers per slot — never mixed up:
//   quality       tile colour (or a quality word on the tile)  e.g. Legendary
//   enhancement   "+19"                                        → enhancementLevel 19
//   mastery       "Lv.10" / "Lv 10"                            → mastery level 10
// A Legendary "+19" is stored as { quality: legendary, enhancementLevel: 19 };
// the Legendary progression engine decides what +19 means. It is never
// turned into Mythic +19.
//
// Slots: Goggles top-left, Gloves top-right, Belt bottom-left, Boots
// bottom-right (the in-game layout). Numbers are assigned to the nearest slot
// tile; without tiles, by screen quadrant (lower confidence).
// ============================================================================

import { GearRarity, GearSlot, TroopType } from "../types";
import { HERO_DATABASE } from "../data/heroDatabase";
import { GEAR_MAX_LEVEL } from "../data/gearXpTable";
import { MASTERY_MAX } from "../data/masteryForgingTable";
import { BBox, OcrWord } from "./quantityTokens";
import { ScanFieldResult } from "./scanTypes";
import type { GearSlotTile } from "../../imageRecognition/gearTiles";
import { TILE_COLOUR_CONFIDENCE, TILE_COLOUR_QUALITY } from "../../imageRecognition/gearTiles";

export const SLOT_POSITION: Record<GearSlot, GearSlotTile["position"]> = {
  goggles: "top-left",
  gloves: "top-right",
  belt: "bottom-left",
  boots: "bottom-right",
};

export interface GearToken {
  id: string;
  kind: "enhancement" | "mastery";
  value: number;
  rawText: string;
  bbox: BBox;
  confidence: number;
}

export interface GearSlotScan {
  slot: GearSlot;
  /** false = the slot tile looked empty (no gear). null = unknown. */
  equipped: ScanFieldResult<boolean | null>;
  quality: ScanFieldResult<GearRarity | null>;
  enhancement: ScanFieldResult<number | null>;
  mastery: ScanFieldResult<number | null>;
  enhancementTokenId: string | null;
  masteryTokenId: string | null;
  tileBox?: BBox;
}

export interface GearScreenScan {
  hero: ScanFieldResult<string | null>;
  troopType: TroopType | null;
  slots: Record<GearSlot, GearSlotScan>;
  tokens: GearToken[];
  /** true when slot tiles were found; false = quadrant fallback. */
  tilesFound: boolean;
  warnings: string[];
}

const cx = (b: BBox) => b.x + b.width / 2;
const cy = (b: BBox) => b.y + b.height / 2;
const sameRow = (a: BBox, b: BBox) => Math.abs(cy(a) - cy(b)) <= Math.max(a.height, b.height) * 0.6;
const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

// OCR look-alikes inside a short number ("Lv.]" → Lv.1, "+l9" → +19). Readings that needed a fix get lower confidence.
const DIGIT_LOOKALIKE: Record<string, string> = { "]": "1", "[": "1", l: "1", I: "1", "|": "1", "!": "1", i: "1", o: "0", O: "0", D: "0", S: "5", B: "8" };
function fixDigits(raw: string): { digits: string; fixed: boolean } | null {
  if (!raw || raw.length > 3) return null;
  let fixed = false;
  let out = "";
  for (const ch of raw) {
    if (/\d/.test(ch)) out += ch;
    else if (DIGIT_LOOKALIKE[ch]) { out += DIGIT_LOOKALIKE[ch]; fixed = true; }
    else return null;
  }
  return { digits: out, fixed };
}

/** Pulls "+N" (enhancement) and "Lv.N" (mastery) readings out of OCR words. */
export function extractGearTokens(words: OcrWord[]): GearToken[] {
  const out: GearToken[] = [];
  const used = new Set<number>();
  const push = (kind: GearToken["kind"], value: number, rawText: string, bbox: BBox, confidence: number) =>
    out.push({ id: `${kind[0]}${out.length}`, kind, value, rawText, bbox, confidence });

  words.forEach((w, i) => {
    if (used.has(i)) return;
    const t = w.text.trim();
    // "+19" (also "+ 19" split into two words)
    let m = t.match(/^\+(\S{1,3})$/);
    const enh = m ? fixDigits(m[1]) : null;
    if (enh) {
      const v = Number(enh.digits);
      if (v <= GEAR_MAX_LEVEL) push("enhancement", v, t, w.bbox, w.confidence * (enh.fixed ? 0.75 : 1));
      return;
    }
    if (t === "+") {
      const j = words.findIndex((o, k) => k !== i && !used.has(k) && /^\d{1,3}$/.test(o.text.trim()) && sameRow(o.bbox, w.bbox) && o.bbox.x > w.bbox.x && o.bbox.x - (w.bbox.x + w.bbox.width) < w.bbox.height);
      if (j >= 0 && Number(words[j].text) <= GEAR_MAX_LEVEL) {
        used.add(j);
        const b = words[j].bbox;
        push("enhancement", Number(words[j].text), `+${words[j].text}`, { x: w.bbox.x, y: Math.min(w.bbox.y, b.y), width: b.x + b.width - w.bbox.x, height: Math.max(w.bbox.height, b.height) }, Math.min(w.confidence, words[j].confidence));
      }
      return;
    }
    // "Lv.10" / "Lv10" / "LV.10" / "Lvl.10" (and look-alikes such as "Lv.]")
    m = t.match(/^L[vV](?:l|I|1(?=\.))?\.?:?(\S{1,2})$/);
    const mas = m ? fixDigits(m[1]) : null;
    if (mas) {
      const v = Number(mas.digits);
      if (v <= MASTERY_MAX.level) push("mastery", v, t, w.bbox, w.confidence * (mas.fixed ? 0.75 : 1));
      return;
    }
    // "Lv." "10" split
    if (/^L[vV][lI1]?\.?:?$/.test(t)) {
      const j = words.findIndex((o, k) => k !== i && !used.has(k) && /^\d{1,2}$/.test(o.text.trim()) && sameRow(o.bbox, w.bbox) && o.bbox.x > w.bbox.x && o.bbox.x - (w.bbox.x + w.bbox.width) < w.bbox.height * 1.2);
      if (j >= 0 && Number(words[j].text) <= MASTERY_MAX.level) {
        used.add(j);
        const b = words[j].bbox;
        push("mastery", Number(words[j].text), `${t}${words[j].text}`, { x: w.bbox.x, y: Math.min(w.bbox.y, b.y), width: b.x + b.width - w.bbox.x, height: Math.max(w.bbox.height, b.height) }, Math.min(w.confidence, words[j].confidence));
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Hero name
// ---------------------------------------------------------------------------

function editDistanceAtMost1(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}

/** Finds a hero name in the OCR text (page header). Returns the hero id. */
export function detectHeroName(words: OcrWord[], imageHeight: number): ScanFieldResult<string | null> {
  // Group words into rows and compare letters-only row text against every hero name.
  const rows: OcrWord[][] = [];
  for (const w of [...words].sort((a, b) => cy(a.bbox) - cy(b.bbox))) {
    const row = rows.find((r) => sameRow(r[0].bbox, w.bbox));
    if (row) row.push(w);
    else rows.push([w]);
  }
  let best: { id: string; score: number; conf: number; raw: string } | null = null;
  for (const row of rows) {
    row.sort((a, b) => a.bbox.x - b.bbox.x);
    const rowText = letters(row.map((w) => w.text).join(""));
    const rowWords = row.map((w) => letters(w.text)).filter(Boolean);
    const top = cy(row[0].bbox) < imageHeight * 0.4;
    const height = Math.max(...row.map((w) => w.bbox.height));
    for (const h of HERO_DATABASE) {
      const name = letters(h.name);
      if (name.length < 3) continue;
      let conf = 0;
      if (rowWords.includes(name) || (name.length >= 6 && rowText.includes(name))) conf = 0.85;
      else if (name.length >= 5 && rowWords.some((w) => editDistanceAtMost1(w, name))) conf = 0.6;
      if (!conf) continue;
      // Prefer the page header: near the top, large text, longer (more specific) names.
      const score = conf * 10 + (top ? 3 : 0) + height / 40 + name.length / 20;
      if (!best || score > best.score) best = { id: h.id, score, conf, raw: row.map((w) => w.text).join(" ") };
    }
  }
  return best
    ? { value: best.id, confidence: best.conf, source: `name “${best.raw}”`, warning: best.conf < 0.85 ? "Name read approximately — please check the hero." : undefined }
    : { value: null, confidence: 0, warning: "No hero name found on this screenshot — choose the hero." };
}

// ---------------------------------------------------------------------------
// Slot assignment
// ---------------------------------------------------------------------------

const QUALITY_WORDS: Record<string, GearRarity> = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare",
  epic: "epic",
  mythic: "mythic",
  legendary: "legendary",
};

export function readGearScreen(
  words: OcrWord[],
  size: { width: number; height: number },
  tiles: GearSlotTile[] = [],
  opts: { expectedHeroId?: string } = {}
): GearScreenScan {
  const warnings: string[] = [];
  const tokens = extractGearTokens(words);
  const tileFor: Partial<Record<GearSlot, GearSlotTile>> = {};
  for (const slot of Object.keys(SLOT_POSITION) as GearSlot[]) {
    const t = tiles.find((x) => x.position === SLOT_POSITION[slot]);
    if (t) tileFor[slot] = t;
  }
  const tilesFound = Object.keys(tileFor).length === 4;

  // Which slot does a token belong to?
  let yThreshold = size.height / 2;
  if (!tilesFound) {
    const ys = tokens.map((t) => cy(t.bbox)).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] - ys[i - 1] > gap && ys[i] - ys[i - 1] > size.height * 0.05) {
        gap = ys[i] - ys[i - 1];
        yThreshold = (ys[i] + ys[i - 1]) / 2;
      }
    }
    warnings.push("Gear slots weren't located on the image, so numbers were matched to slots by screen position. Check every slot.");
  }
  const slotOf = (b: BBox): { slot: GearSlot; dist: number } | null => {
    if (tilesFound) {
      let best: { slot: GearSlot; dist: number } | null = null;
      for (const [slot, t] of Object.entries(tileFor) as [GearSlot, GearSlotTile][]) {
        const d = Math.hypot(cx(b) - cx(t.box), cy(b) - cy(t.box)) / t.box.width;
        if (d < 1.1 && (!best || d < best.dist)) best = { slot, dist: d };
      }
      return best;
    }
    const left = cx(b) < size.width / 2;
    const top = cy(b) < yThreshold;
    return { slot: top ? (left ? "goggles" : "gloves") : left ? "belt" : "boots", dist: 0 };
  };

  const bySlot: Record<GearSlot, { enh: GearToken[]; mas: GearToken[] }> = {
    goggles: { enh: [], mas: [] },
    gloves: { enh: [], mas: [] },
    belt: { enh: [], mas: [] },
    boots: { enh: [], mas: [] },
  };
  for (const t of tokens) {
    const s = slotOf(t.bbox);
    if (!s) continue;
    (t.kind === "enhancement" ? bySlot[s.slot].enh : bySlot[s.slot].mas).push(t);
  }

  const slots = {} as Record<GearSlot, GearSlotScan>;
  const posConf = tilesFound ? 1 : 0.6;
  for (const slot of Object.keys(SLOT_POSITION) as GearSlot[]) {
    const tile = tileFor[slot];
    const near = (list: GearToken[]) =>
      [...list].sort((a, b) => (tile ? Math.hypot(cx(a.bbox) - cx(tile.box), cy(a.bbox) - cy(tile.box)) - Math.hypot(cx(b.bbox) - cx(tile.box), cy(b.bbox) - cy(tile.box)) : 0));
    const enh = near(bySlot[slot].enh);
    const mas = near(bySlot[slot].mas);
    if (enh.length > 1) warnings.push(`${cap(slot)}: several “+N” numbers near this slot; used “${enh[0].rawText}”.`);
    if (mas.length > 1) warnings.push(`${cap(slot)}: several “Lv.” numbers near this slot; used “${mas[0].rawText}”.`);

    // Quality: a quality word on/near the tile beats colour.
    let quality: ScanFieldResult<GearRarity | null> = { value: null, confidence: 0, warning: "Quality not detected — pick it." };
    const region = tile?.box;
    const qWord = region
      ? words.find((w) => QUALITY_WORDS[letters(w.text)] && Math.abs(cx(w.bbox) - cx(region)) < region.width && Math.abs(cy(w.bbox) - cy(region)) < region.height)
      : undefined;
    if (qWord) quality = { value: QUALITY_WORDS[letters(qWord.text)], confidence: 0.85, source: `word “${qWord.text}”` };
    else if (tile && tile.colour !== "empty") {
      const q = TILE_COLOUR_QUALITY[tile.colour];
      quality = {
        value: q,
        confidence: TILE_COLOUR_CONFIDENCE[tile.colour],
        source: `${tile.colour} tile colour`,
        warning: q === "mythic" || q === "legendary" ? "Mythic vs Legendary is judged by tile colour — confirm it." : undefined,
      };
    }

    const empty = tile?.colour === "empty" && !enh.length && !mas.length;
    slots[slot] = {
      slot,
      equipped: tile
        ? { value: !empty, confidence: empty ? 0.7 : 0.6, source: empty ? "empty slot tile" : "gear tile" }
        : { value: enh.length || mas.length ? true : null, confidence: enh.length || mas.length ? 0.5 : 0 },
      quality,
      enhancement: enh[0]
        ? { value: enh[0].value, confidence: Math.min(0.9, enh[0].confidence) * posConf, source: `“${enh[0].rawText}”` }
        : { value: null, confidence: 0 },
      mastery: mas[0]
        ? { value: mas[0].value, confidence: Math.min(0.9, mas[0].confidence) * posConf, source: `“${mas[0].rawText}”` }
        : { value: null, confidence: 0 },
      enhancementTokenId: enh[0]?.id ?? null,
      masteryTokenId: mas[0]?.id ?? null,
      tileBox: tile?.box,
    };
  }

  let hero = detectHeroName(words, size.height);
  if (opts.expectedHeroId) {
    if (hero.value && hero.value !== opts.expectedHeroId) {
      const name = HERO_DATABASE.find((h) => h.id === hero.value)?.name;
      warnings.push(`This screenshot looks like ${name}'s gear, not the hero you scanned from. Check the hero before confirming.`);
    } else if (!hero.value) {
      hero = { value: opts.expectedHeroId, confidence: 0.6, source: "the hero card you scanned from" };
    }
  }
  const troopType = hero.value ? HERO_DATABASE.find((h) => h.id === hero.value)?.troopType ?? null : null;
  if (!tokens.length) warnings.push("No “+N” or “Lv.” numbers were read. Enter the gear values by hand, or try a sharper screenshot.");
  return { hero, troopType, slots, tokens, tilesFound, warnings };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
