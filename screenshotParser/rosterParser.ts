// ============================================================================
// Hero roster screenshot parser (Phase 2).
//
//   roster screenshot
//   → detect/crop hero card regions        (rosterSegmenter)
//   → identify hero from the card art      (HeroRecognizer, portrait matching)
//   → read level label via OCR             (OcrEngine, optional)
//   → read stars/tier from star icons      (cardReadouts)
//   → DetectedScreenshotHero[] for the Review screen — never committed directly.
//
// Troop type and generation are taken from the hero database once the user
// confirms the hero; the card's troop icon is not needed for identity.
// ============================================================================

import { DetectedScreenshotHero, ScreenshotParseResult } from "../lib/types";
import { getHeroDefinition } from "../lib/data/heroDatabase";
import { segmentRosterCards } from "../imageRecognition/rosterSegmenter";
import { estimateFullStarArea, levelLabelBox, parseLevelText, readStars } from "../imageRecognition/cardReadouts";
import { RGBAImage, crop } from "../imageRecognition/pixels";
import { readTroopIcon } from "../imageRecognition/cardSignals";

/** Troop icon regions are fractions of a FULL card; pad a cut-off card back to full proportions. */
function cropTopAsCard(card: RGBAImage, width: number): RGBAImage {
  const fullH = Math.round(width * 1.745);
  if (card.height >= fullH) return card;
  const data = new Uint8ClampedArray(card.width * fullH * 4);
  data.set(card.data);
  return { data, width: card.width, height: fullH };
}
import type { HeroRecognizer } from "../imageRecognition/heroRecognizer";

export interface LevelReading {
  level: number | null;
  confidence: number;
  raw: string;
}

export interface RosterParseDeps {
  recognizer: HeroRecognizer;
  /** Reads the "Lv. N" label crop. Omit to skip level OCR (user types levels). */
  readLevel?: (labelCrop: RGBAImage) => Promise<LevelReading>;
}

export interface RosterParseOptions {
  /** Offset added to powerRankDetected, so page 2 continues after page 1. */
  rankOffset?: number;
  onProgress?: (done: number, total: number, stage: string) => void;
}

export async function parseRosterImage(
  img: RGBAImage,
  deps: RosterParseDeps,
  opts: RosterParseOptions = {}
): Promise<ScreenshotParseResult<DetectedScreenshotHero[]>> {
  const report = opts.onProgress ?? (() => {});
  report(0, 1, "Finding hero cards");
  const seg = segmentRosterCards(img);
  // Full cards first, then cut-off cards whose portrait is still visible.
  const entries = [
    ...seg.cards.map((box) => ({ box, partial: false })),
    ...seg.partialCards.map((p) => ({ box: p.box, partial: true })),
  ];
  const fullCrops = seg.cards.map((b) => crop(img, b));
  const fullStar = estimateFullStarArea(fullCrops);
  const out: DetectedScreenshotHero[] = [];

  for (let i = 0; i < entries.length; i++) {
    report(i, entries.length, "Matching heroes");
    const { box, partial } = entries[i];
    const card = partial ? crop(img, box) : fullCrops[i];
    const candidates = await deps.recognizer.identifyHero(card, { topK: 3 });
    const top = candidates[0];
    const def = top ? getHeroDefinition(top.heroId) : undefined;
    const reviewReasons: string[] = [];
    let confidence = top?.confidence ?? 0;

    // Troop icon cross-check (independent of the portrait).
    const icon = readTroopIcon(partial ? cropTopAsCard(card, box.width) : card);
    if (def && icon.troopType && icon.confidence >= 0.5 && icon.troopType !== def.troopType) {
      confidence = Math.min(confidence, 0.45);
      reviewReasons.push(`Troop icon looks like ${icon.troopType}, but ${def.name} is ${def.troopType}.`);
    }

    let stars: ReturnType<typeof readStars> | null = null;
    let level: LevelReading = { level: null, confidence: 0, raw: "" };
    if (partial) {
      reviewReasons.push("Card is cut off at the bottom of the screenshot — level and stars aren't visible.");
      confidence = Math.min(confidence, 0.6);
    } else {
      stars = readStars(card, fullStar);
      if (deps.readLevel) {
        try {
          level = await deps.readLevel(crop(img, levelLabelBox(box)));
        } catch {
          level = { level: null, confidence: 0, raw: "" };
        }
      }
    }

    out.push({
      candidateHeroId: top?.heroId ?? null,
      candidateName: def?.name ?? null,
      confidence,
      candidates: candidates.map((c, k) => ({ heroId: c.heroId, confidence: k === 0 ? confidence : c.confidence })),
      troopTypeDetected: def?.troopType ?? null,
      troopIconDetected: icon.troopType,
      troopIconConfidence: icon.confidence,
      generationDetected: def?.generation ?? null,
      levelDetected: level.level,
      levelConfidence: level.confidence,
      levelRawText: level.raw,
      starsDetected: stars ? stars.stars : null,
      starTierDetected: stars ? stars.tier : null,
      starsConfidence: stars ? stars.confidence : 0,
      powerRankDetected: (opts.rankOffset ?? 0) + i + 1,
      boundingBox: box,
      partial,
      reviewReasons,
    });
  }
  report(entries.length, entries.length, "Done");

  const warnings = [...seg.warnings];
  const seen = new Map<string, number>();
  out.forEach((d, i) => {
    if (!d.candidateHeroId) return;
    if (seen.has(d.candidateHeroId)) {
      warnings.push(
        `Card ${i + 1} and card ${seen.get(d.candidateHeroId)! + 1} were both matched to ${d.candidateName}. One of them is probably a different hero.`
      );
    } else seen.set(d.candidateHeroId, i);
  });

  return {
    screenshotId: `roster-${Date.now().toString(36)}`,
    screenshotType: "hero_roster",
    data: out,
    overallConfidence: out.length ? out.reduce((s, d) => s + d.confidence, 0) / out.length : 0,
    warnings,
  };
}

/** Turns OCR words from one level label into a reading. */
export function levelFromOcrText(raw: string, ocrConfidence: number): LevelReading {
  const level = parseLevelText(raw);
  if (level === null) return { level: null, confidence: 0, raw };
  // Tesseract's per-word confidence is poorly calibrated on tiny labels like
  // "Lv.1", so we mostly judge by the SHAPE of the text: a clean "Lv. N" is
  // trusted; extra characters (e.g. "Lv. 1 7") make it ambiguous.
  const clean = /^\s*l\s*v\s*\.?\s*\d{1,2}\s*$/i.test(raw);
  // (Measured: Tesseract reports < 30% word confidence even for perfectly read
  // "Lv.1" labels, so its number is recorded but not used to flag the level.)
  void ocrConfidence;
  return { level, confidence: clean ? 0.9 : 0.5, raw };
}
