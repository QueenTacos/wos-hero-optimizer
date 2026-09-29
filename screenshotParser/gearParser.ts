// ============================================================================
// Hero Gear screen + gear inventory parsers (browser: OCR + pixels).
// Results always go to a review screen — nothing is applied automatically.
// ============================================================================

import type { OcrEngine } from "../imageRecognition";
import { findGearSlotTiles, findRarityTiles, ringColour } from "../imageRecognition/gearTiles";
import { crop, loadRGBAImage, rgbaToBlob, RGBAImage } from "../imageRecognition/pixels";
import type { OcrWord } from "../lib/screenshot/quantityTokens";
import { GearScreenScan, readGearScreen } from "../lib/screenshot/gearScreenReading";
import { GearInventoryItem, readGearInventory } from "../lib/screenshot/gearInventoryReading";

type Ocr = Pick<OcrEngine, "recognizeWords">;
type Progress = (p: number, stage: string) => void;

/** Words from a second OCR pass are added unless they overlap a word already found. */
export function mergeWordPasses(a: OcrWord[], b: OcrWord[]): OcrWord[] {
  const overlaps = (p: OcrWord, q: OcrWord) => {
    const x = Math.max(0, Math.min(p.bbox.x + p.bbox.width, q.bbox.x + q.bbox.width) - Math.max(p.bbox.x, q.bbox.x));
    const y = Math.max(0, Math.min(p.bbox.y + p.bbox.height, q.bbox.y + q.bbox.height) - Math.max(p.bbox.y, q.bbox.y));
    return x * y > 0.4 * Math.min(p.bbox.width * p.bbox.height, q.bbox.width * q.bbox.height);
  };
  return [...a, ...b.filter((w) => !a.some((v) => overlaps(v, w)))];
}

export interface HeroGearParseOutput {
  scan: GearScreenScan;
  size: { width: number; height: number };
}

export function createHeroGearParser(ocr: Ocr, io: { loadPixels?: (b: Blob) => Promise<RGBAImage> } = {}) {
  const loadPixels = io.loadPixels ?? loadRGBAImage;
  return {
    async parse(image: Blob, opts: { expectedHeroId?: string; onProgress?: Progress } = {}): Promise<HeroGearParseOutput> {
      const report = opts.onProgress ?? (() => {});
      report(0, "Finding gear slots");
      const px = await loadPixels(image);
      const tiles = findGearSlotTiles(px).map((t) => {
        if (t.colour === "empty") return t;
        const ring = ringColour(px, t.box);
        return ring.colour ? { ...t, colour: ring.colour } : t;
      });
      // Gear numbers are white with a dark outline; the hero name is in the page header.
      report(0.1, "Reading gear numbers");
      const bright = await ocr.recognizeWords(image, { numericOnly: false, sparse: true, preprocess: "bright-any", onProgress: (p) => report(0.1 + p * 0.45, "Reading gear numbers") });
      report(0.55, "Reading hero name");
      const gray = await ocr.recognizeWords(image, { numericOnly: false, sparse: true, preprocess: "grayscale", onProgress: (p) => report(0.55 + p * 0.45, "Reading hero name") });
      const words = mergeWordPasses(bright, gray);
      report(1, "Done");
      return { scan: readGearScreen(words, px, tiles, { expectedHeroId: opts.expectedHeroId }), size: { width: px.width, height: px.height } };
    },
  };
}

export interface GearInventoryParseOutput {
  items: GearInventoryItem[];
  size: { width: number; height: number };
  warnings: string[];
}

export function createGearInventoryParser(ocr: Ocr, io: { loadPixels?: (b: Blob) => Promise<RGBAImage>; encodeCrop?: (img: RGBAImage) => Promise<Blob> } = {}) {
  const loadPixels = io.loadPixels ?? loadRGBAImage;
  const encodeCrop = io.encodeCrop ?? rgbaToBlob;
  return {
    async parse(image: Blob, opts: { onProgress?: Progress } = {}): Promise<GearInventoryParseOutput> {
      const report = opts.onProgress ?? (() => {});
      report(0, "Finding item tiles");
      const px = await loadPixels(image);
      const tiles = findRarityTiles(px);
      report(0.1, "Reading quantities");
      const words = tiles.length
        ? await ocr.recognizeWords(image, { numericOnly: true, preprocess: "bright-text", onProgress: (p) => report(0.1 + p * 0.9, "Reading quantities") })
        : [];
      // Close-up retry for tiles whose count the full-screen pass missed (same fix as the
      // Enhancement Component reader: small white numbers are often only read up close).
      let items = readGearInventory(tiles, words);
      const missing = items.filter((it) => it.quantity.source === "no number on the tile");
      for (const [k, it] of missing.entries()) {
        report(0.9 + (k / missing.length) * 0.1, "Reading quantities up close");
        const region = { x: it.box.x, y: it.box.y + it.box.height * 0.5, width: it.box.width, height: it.box.height * 0.5 };
        const close = await ocr.recognizeWords(await encodeCrop(crop(px, region)), { numericOnly: true, preprocess: "bright-text" });
        words.push(...close.map((w) => ({ ...w, bbox: { ...w.bbox, x: w.bbox.x + region.x, y: w.bbox.y + region.y } })));
      }
      if (missing.length) items = readGearInventory(tiles, words);
      report(1, "Done");
      const warnings = [
        items.length
          ? "The slot of each item isn't recognised yet — choose it for every tile you keep. Quality comes from the tile colour; check it."
          : "No complete item tiles were found. Tiles cut off at the screen edge are skipped. You can still enter gear by hand.",
      ];
      return { items, size: { width: px.width, height: px.height }, warnings };
    },
  };
}
