// ============================================================================
// Screenshot Parser
//
// Each screenshot type gets its own parser behind a common interface. Every
// parser MUST return a confidence score and MUST NOT be trusted blindly by
// the UI — results always flow through the Review/Confirm screen.
//
// Phase 2 (implemented):
//   ResourceInventoryParser — OCRs quantities from Hero EXP / Enhancement
//     Component screenshots.
//   HeroRosterParser — finds hero cards, identifies each hero by PORTRAIT
//     MATCHING against the local portrait library (not OCR), OCRs the level,
//     reads stars from the star icons. Prototype; see rosterParser.ts.
//   HeroGearScreenshotParser — Hero Gear screen: slot tiles by colour/position,
//     "+N" enhancement and "Lv.N" mastery by OCR, hero by name (gearParser.ts).
//   GearInventoryParser — rarity tiles + quantities; slot chosen by the user.
//   Essence Stones / Mithril — label-anchored quantity (resourceReaders.ts).
// ============================================================================

import { DetectedScreenshotHero, ScreenshotParseResult } from "../lib/types";
import { HeroPortraitMatcher, OcrEngine, IconMatcher } from "../imageRecognition";
import type { HeroRecognizer } from "../imageRecognition/heroRecognizer";
import { crop, loadRGBAImage, rgbaToBlob, RGBAImage } from "../imageRecognition/pixels";
import { ESSENCE_STONE_LABEL, MITHRIL_LABEL, completeComponentReading, readEnhancementComponents, readHeroXpTotal, readLabeledQuantity } from "../lib/screenshot/resourceReaders";
import type { OcrWord } from "../lib/screenshot/quantityTokens";
import { levelFromOcrText, parseRosterImage, RosterParseOptions } from "./rosterParser";
import {
  FieldSuggestion,
  QuantityToken,
  extractQuantityTokens,
  overallConfidence,
  suggestFieldValues,
} from "../lib/screenshot/quantityTokens";
import { SCREENSHOT_TARGETS, ScreenshotTarget } from "../lib/screenshot/targets";
import { createHeroGearParser, HeroGearParseOutput } from "./gearParser";
export { createHeroGearParser, createGearInventoryParser } from "./gearParser";

export interface RosterGridConfig {
  columns: number;
  rows: number;
  cardWidth: number;
  cardHeight: number;
  originX: number;
  originY: number;
  gapX: number;
  gapY: number;
}

export interface HeroRosterParser {
  /**
   * Detects the card grid automatically (no fixed coordinates needed), crops
   * each card, and identifies each hero via portrait matching. Roster cards
   * show no names, so OCR is only used for the level label.
   */
  parse(image: Blob, opts?: RosterParseOptions): Promise<ScreenshotParseResult<DetectedScreenshotHero[]>>;
}

/** Browser roster parser: portrait matching + OCR of each card's "Lv. N" label. */
export function createHeroRosterParser(recognizer: HeroRecognizer, ocrEngine?: Pick<OcrEngine, "recognizeWords">): HeroRosterParser {
  return {
    async parse(image, opts) {
      const img = await loadRGBAImage(image);
      return parseRosterImage(
        img,
        {
          recognizer,
          readLevel: ocrEngine
            ? async (label) => {
                const words = await ocrEngine.recognizeWords(await rgbaToBlob(label), {
                  preprocess: "bright-any",
                  whitelist: "Lv.0123456789 ",
                  singleLine: true,
                });
                const raw = words.map((w) => w.text).join(" ");
                const conf = words.length ? Math.min(...words.map((w) => w.confidence)) : 0;
                return levelFromOcrText(raw, conf);
              }
            : undefined,
        },
        opts
      );
    },
  };
}

export interface ResourceParseData {
  /** Every number found on the screenshot, in original-image coordinates. */
  tokens: QuantityToken[];
  /** One suggestion per review field. Always requires user confirmation. */
  suggestions: FieldSuggestion[];
  /** Which preprocessing pass produced these tokens (for debugging). */
  pass: "bright-text" | "grayscale";
}

export interface ResourceInventoryParser {
  parse(
    image: Blob,
    target: ScreenshotTarget,
    opts?: { onProgress?: (p: number, stage: string) => void }
  ): Promise<ScreenshotParseResult<ResourceParseData>>;
}

export interface HeroGearScreenshotParser {
  parse(image: Blob, opts?: { expectedHeroId?: string; onProgress?: (p: number, stage: string) => void }): Promise<HeroGearParseOutput>;
}

export interface ScreenshotParserDeps {
  /** Hero identity from portraits (LocalPortraitRecognizer). */
  heroRecognizer?: HeroRecognizer;
  portraitMatcher: HeroPortraitMatcher;
  ocrEngine: OcrEngine;
  iconMatcher: IconMatcher;
}

const SCREENSHOT_TYPE: Record<ScreenshotTarget, ScreenshotParseResult<unknown>["screenshotType"]> = {
  hero_exp_items: "hero_exp_inventory",
  hero_exp_total: "hero_exp_inventory",
  enhancement_components: "enhancement_components",
  essence_stones: "resource_inventory",
  mithril: "resource_inventory",
};

/**
 * Phase 2 resource parser. Runs OCR with the "bright-text" cleanup first
 * (WOS draws quantities as white text with a dark outline); if that finds
 * fewer numbers than there are fields, it retries with plain grayscale and
 * keeps whichever pass did better.
 */
export function createResourceInventoryParser(
  ocrEngine: Pick<OcrEngine, "recognizeWords">,
  io: {
    /** Decodes the screenshot to pixels for icon / tile-colour checks. Browser default; tests inject their own. */
    loadPixels?: ((image: Blob) => Promise<RGBAImage | undefined>) | null;
    /** Encodes a crop for close-up OCR. Browser default (canvas); tests inject their own. */
    encodeCrop?: (img: RGBAImage) => Promise<Blob>;
  } = {}
): ResourceInventoryParser {
  const loadPixels = io.loadPixels === undefined ? defaultLoadPixels : io.loadPixels;
  const encodeCrop = io.encodeCrop ?? rgbaToBlob;
  return {
    async parse(image, target, opts = {}) {
      const def = SCREENSHOT_TARGETS[target];
      const fieldKeys = def.fields.map((f) => f.key);
      const report = opts.onProgress ?? (() => {});
      const pixels = loadPixels ? await loadPixels(image).catch(() => undefined) : undefined;

      // ---- 1. Structured readers (label / tile aware) ----
      let brightNumericWords: OcrWord[] | null = null;
      if (target === "hero_exp_total") {
        report(0, "Looking for the “Hero XP” row");
        let words = await ocrEngine.recognizeWords(image, { numericOnly: false, preprocess: "grayscale", onProgress: (p) => report(p * 0.5, "Reading text") });
        let r = readHeroXpTotal(words, pixels);
        if (!r.labelFound) {
          const alt = await ocrEngine.recognizeWords(image, { numericOnly: false, preprocess: "grayscale-light-text", onProgress: (p) => report(0.5 + p * 0.5, "Trying again with a different filter") });
          const r2 = readHeroXpTotal(alt, pixels);
          if (r2.labelFound) { words = alt; r = r2; }
        }
        if (r.value !== null) {
          const tokens = extractQuantityTokens(words);
          const tok = tokens.find((t) => t.rawText === r.rawText && r.valueBox && t.bbox.x === r.valueBox.x && t.bbox.y === r.valueBox.y);
          report(1, "Done");
          return result(target, tokens, [
            { fieldKey: "total", value: r.value, tokenId: tok?.id ?? null, confidence: r.confidence, reason: `Read from the “Hero XP” row: “${r.rawText}”.` },
          ], "grayscale", ["Read from the “Hero XP” label row. Please double-check before confirming.", ...r.notes], r.confidence);
        }
      }

      if (target === "enhancement_components") {
        report(0, "Reading component tiles");
        const words = await ocrEngine.recognizeWords(image, { numericOnly: true, preprocess: "bright-text", onProgress: (p) => report(p * 0.9, "Reading component tiles") });
        brightNumericWords = words; // reused by the fallback below, so we don't OCR twice
        let r = readEnhancementComponents(words, pixels);
        // Close-up retry for tiles whose quantity the full-screen pass missed.
        for (const u of [...r.unpaired]) {
          if (!pixels) break;
          const region = crop(pixels, u.quantityRegion);
          // Sparse mode (not single-line): the close-up still contains bits of the icon and tile edge.
          // Measured on the real backpack screenshot: sparse reads "171", single-line reads nothing.
          const closeUp = await ocrEngine.recognizeWords(await encodeCrop(region), { numericOnly: true, preprocess: "bright-text" });
          r = completeComponentReading(r, u, closeUp);
        }
        if (r.xp10 || r.xp100) {
          const tokens = extractQuantityTokens(words);
          // Quantities recovered from a close-up aren't in the full-screen tokens; add them so they're outlined too.
          for (const c of [r.xp10, r.xp100]) {
            if (c && !tokens.some((t) => t.bbox.x === c.quantityBox.x && t.bbox.y === c.quantityBox.y)) {
              tokens.push({ id: `closeup-${c.xpPerItem}`, rawText: c.rawQuantityText, value: c.quantity, confidence: c.confidence, bbox: c.quantityBox });
            }
          }
          const idFor = (box?: { x: number; y: number }) => tokens.find((t) => box && t.bbox.x === box.x && t.bbox.y === box.y)?.id ?? null;
          const sug = (key: "xp10" | "xp100") => {
            const c = r[key];
            return c
              ? { fieldKey: key, value: c.quantity, tokenId: idFor(c.quantityBox), confidence: c.confidence, reason: `${c.xpPerItem} XP tile: quantity “${c.rawQuantityText}” (XP per item “${c.xpPerItem}” read from the top of the tile).` }
              : { fieldKey: key, value: null, tokenId: null, confidence: 0, reason: `No ${key === "xp10" ? "10" : "100"} XP component tile found — enter it manually.` };
          };
          report(1, "Done");
          return result(target, tokens, [sug("xp10"), sug("xp100")], "bright-text", [
            "Each tile's top number is the XP per item; the bottom number is how many you own. Please double-check before confirming.",
            ...r.notes,
          ], Math.min(r.xp10?.confidence ?? 0.5, r.xp100?.confidence ?? 0.5));
        }
      }

      if (target === "essence_stones" || target === "mithril") {
        const spec = target === "mithril" ? MITHRIL_LABEL : ESSENCE_STONE_LABEL;
        report(0, `Looking for “${spec.name}”`);
        let words = await ocrEngine.recognizeWords(image, { numericOnly: false, preprocess: "grayscale", onProgress: (p) => report(p * 0.5, "Reading text") });
        let r = readLabeledQuantity(words, spec);
        if (!r.labelFound) {
          // Game popups use light text on dark panels; list rows use dark text on light rows.
          const alt = await ocrEngine.recognizeWords(image, { numericOnly: false, preprocess: "bright-any", onProgress: (p) => report(0.5 + p * 0.5, "Trying again with a different filter") });
          const r2 = readLabeledQuantity(alt, spec);
          if (r2.labelFound) { words = alt; r = r2; }
        }
        const tokens = extractQuantityTokens(words);
        const tok = r.valueBox ? tokens.find((t) => t.bbox.x === r.valueBox!.x && t.bbox.y === r.valueBox!.y) : undefined;
        report(1, "Done");
        return result(target, tokens, [
          r.value !== null
            ? { fieldKey: "qty", value: r.value, tokenId: tok?.id ?? null, confidence: r.confidence, reason: `Read next to “${spec.name}”: “${r.rawText}”.` }
            : { fieldKey: "qty", value: null, tokenId: null, confidence: 0, reason: r.notes[0] ?? "Not found — tap the number on the screenshot or type it." },
        ], "grayscale", [
          r.labelFound
            ? `Read from the “${spec.name}” label. The item icon isn't checked yet, so please double-check.`
            : `No “${spec.name}” label found, so nothing was filled in. Tap the ${spec.name} amount on the screenshot, or type it.`,
          ...r.notes.slice(r.value === null ? 1 : 0),
        ], r.confidence);
      }

      // ---- 2. Fallback: numbers in screen reading order (weak guess) ----
      report(0, "Reading numbers");
      const brightWords =
        brightNumericWords ??
        (await ocrEngine.recognizeWords(image, {
          numericOnly: true,
          preprocess: "bright-text",
          onProgress: (p) => report(p * 0.5, "Reading numbers"),
        }));
      let tokens = extractQuantityTokens(brightWords);
      let pass: ResourceParseData["pass"] = "bright-text";

      if (tokens.length < fieldKeys.length) {
        report(0.5, "Trying again with a different filter");
        const grayWords = await ocrEngine.recognizeWords(image, {
          numericOnly: true,
          preprocess: "grayscale",
          onProgress: (p) => report(0.5 + p * 0.5, "Trying again with a different filter"),
        });
        const grayTokens = extractQuantityTokens(grayWords);
        if (passScore(grayTokens, fieldKeys.length) > passScore(tokens, fieldKeys.length)) {
          tokens = grayTokens;
          pass = "grayscale";
        }
      }
      report(1, "Done");

      const suggestions = suggestFieldValues(tokens, fieldKeys);
      const warnings: string[] = [];
      if (tokens.length === 0) {
        warnings.push("No numbers could be read from this screenshot. You can still type the values in by hand.");
      } else if (tokens.length < fieldKeys.length) {
        warnings.push(
          `Only found ${tokens.length} number(s) but expected ${fieldKeys.length}. Check each value and fill in anything missing.`
        );
      } else if (tokens.length > fieldKeys.length) {
        warnings.push(
          `Found ${tokens.length} numbers on screen — more than the ${fieldKeys.length} expected. Make sure each field points at the right one.`
        );
      }
      warnings.push("Values were matched to items by their position on screen. Please double-check every value before confirming.");
      return result(target, tokens, suggestions, pass, warnings, Math.min(0.5, overallConfidence(tokens)));
    },
  };
}

function result(
  target: ScreenshotTarget,
  tokens: QuantityToken[],
  suggestions: FieldSuggestion[],
  pass: ResourceParseData["pass"],
  warnings: string[],
  overall: number
): ScreenshotParseResult<ResourceParseData> {
  return {
    screenshotId: `scan-${Date.now().toString(36)}`,
    screenshotType: SCREENSHOT_TYPE[target],
    data: { tokens, suggestions, pass },
    overallConfidence: overall,
    warnings,
  };
}

async function defaultLoadPixels(image: Blob): Promise<RGBAImage | undefined> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return undefined;
  return loadRGBAImage(image);
}

function passScore(tokens: QuantityToken[], expected: number): number {
  const coverage = Math.min(tokens.length, expected);
  return coverage + overallConfidence(tokens) * 0.5;
}

/**
 * Factory for all parsers. All results still go through a review screen.
 */
export function createScreenshotParsers(deps: ScreenshotParserDeps): {
  heroRosterParser: HeroRosterParser;
  resourceInventoryParser: ResourceInventoryParser;
  heroGearParser: HeroGearScreenshotParser;
} {
  const notYet = (what: string) => async (): Promise<never> => {
    throw new Error(`${what} screenshot parsing is planned for Phase 3. Use manual entry for now.`);
  };
  return {
    heroRosterParser: deps.heroRecognizer
      ? createHeroRosterParser(deps.heroRecognizer, deps.ocrEngine)
      : { parse: notYet("Hero roster (no HeroRecognizer supplied)") },
    resourceInventoryParser: createResourceInventoryParser(deps.ocrEngine),
    heroGearParser: createHeroGearParser(deps.ocrEngine),
  };
}
