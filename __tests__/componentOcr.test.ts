// Enhancement Component OCR — regression for the real failed case
// (purple 100 XP tile: quantity 53 was read as 23; green 10 XP tile: 59,302).
//
// The user's exact screenshot isn't in the repo yet. Until it is, the tile
// pipeline is checked on:
//   • the real backpack screenshot (171 / 40,526), crop OCR recorded from real Tesseract
//   • a recreation of the failed screenshot (real tiles, digits redrawn as 53 / 59,302)
//   • a control recreation reading 23 / 52,025 (the reader must not "prefer" 53)
// Crop OCR for each image was recorded from real Tesseract runs and is replayed
// in call order, so these tests are deterministic.

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { decodeImageFile } from "./helpers/decodeImage";
import { createResourceInventoryParser } from "../screenshotParser";
import { readComponentTiles, locateQuantityDigits } from "../lib/screenshot/componentTiles";
import { decideQuantity, lookalikeSwaps, normaliseQuantityText } from "../lib/screenshot/numberConsensus";
import { enhancementXpFrom, parseGameNumber } from "../lib/screenshot/resourceReaders";
import { applyConfirmedValues } from "../lib/screenshot/targets";
import { confidenceBand } from "../lib/screenshot/scanTypes";
import { appendScanLog, readScanLog, SCAN_LOG_MAX } from "../lib/screenshot/scanLog";
import { getAvailableEnhancementXp } from "../lib/utils/inventory";
import { emptyInventory } from "../lib/types";
import { crop } from "../imageRecognition/pixels";
import { findRarityTiles } from "../imageRecognition/gearTiles";
import { fiveVersusTwo, quantityVariants, segmentGlyphs } from "../imageRecognition/numberCrops";
import type { OcrWord } from "../lib/screenshot/quantityTokens";

const SYN = (f: string) => path.join(__dirname, "fixtures/synthetic", f);
const REAL = path.join(__dirname, "../docs/package/reference-screenshots/06_real_test_cases/enhancement_components_backpack.jpg");
const replayCrops = (file: string) => {
  const calls: OcrWord[][] = JSON.parse(fs.readFileSync(file, "utf8"));
  let i = 0;
  return async () => calls[i++] ?? [];
};
const parse = (img: string, crops: string) =>
  createResourceInventoryParser(
    { recognizeWords: async () => { throw new Error("whole-screen OCR is not used for component tiles"); } },
    { loadPixels: async () => decodeImageFile(img), readCrop: replayCrops(crops) }
  ).parse(new Blob(), "enhancement_components");
const byKey = (s: { fieldKey: string; value: number | null }[]) => Object.fromEntries(s.map((x) => [x.fieldKey, x.value]));

describe("TEST A — calculation", () => {
  it("59,302 × 10 + 53 × 100 = 593,020 + 5,300 = 598,320", () => {
    expect(enhancementXpFrom(59_302, 53)).toEqual({ fromXp10: 593_020, fromXp100: 5_300, total: 598_320 });
    const inv = applyConfirmedValues(emptyInventory(), "enhancement_components", { xp10: 59_302, xp100: 53 });
    expect(getAvailableEnhancementXp(inv)).toBe(598_320);
  });
});

describe("TEST B — quantity parsing", () => {
  it.each([
    ["59,302", 59_302],
    ["59302", 59_302],
    ["53", 53],
  ])("parseGameNumber(%s) = %i", (t, v) => expect(parseGameNumber(t)).toBe(v));
  it("commas are thousands separators; OCR spacing / dot variants normalise; bad groupings rejected", () => {
    expect(normaliseQuantityText("59 302")).toBe(59_302);
    expect(normaliseQuantityText("59.302")).toBe(59_302);
    expect(normaliseQuantityText("5,9302")).toBeNull();
    expect(normaliseQuantityText("")).toBeNull();
  });
});

describe("regression screenshot (recreated): 100 XP × 53, 10 XP × 59,302", () => {
  it("reads 53 (never 23) and 59,302 → 598,320, each from its own tile", async () => {
    const res = await parse(SYN("components_53_59302_synthetic.png"), SYN("components_53_59302_synthetic.crops.json"));
    const v = byKey(res.data.suggestions);
    expect(v).toEqual({ xp10: 59_302, xp100: 53 });
    expect(v.xp100).not.toBe(23);
    const expected = {
      component10: { denomination: 10, quantity: 59_302, totalXp: 593_020 },
      component100: { denomination: 100, quantity: 53, totalXp: 5_300 },
      totalEnhancementXp: 598_320,
    };
    const x = enhancementXpFrom(v.xp10, v.xp100);
    expect({
      component10: { denomination: 10, quantity: v.xp10, totalXp: x.fromXp10 },
      component100: { denomination: 100, quantity: v.xp100, totalXp: x.fromXp100 },
      totalEnhancementXp: x.total,
    }).toEqual(expected);
    for (const s of res.data.suggestions) {
      expect(confidenceBand(s.confidence)).toBe("high"); // several passes agree
      expect(s.sourceBox).toBeTruthy(); // tile crop shown next to the field
    }
  });

  it("TEST D — denomination comes from the TOP of the tile, quantity from the BOTTOM (never swapped)", async () => {
    const img = decodeImageFile(SYN("components_53_59302_synthetic.png"));
    const t = await readComponentTiles(img, replayCrops(SYN("components_53_59302_synthetic.crops.json")));
    const purple = t.tiles.find((x) => x.colour === "purple")!;
    expect(purple).toMatchObject({ denomination: 100, denominationSource: "ocr", colourAgrees: true });
    expect(purple.quantity.value).toBe(53);
    expect(purple.quantityBox.y).toBeGreaterThan(purple.tileBox.y + purple.tileBox.height * 0.55);
    const green = t.tiles.find((x) => x.colour === "green")!;
    expect(green).toMatchObject({ denomination: 10 });
    expect(green.quantity.value).toBe(59_302);
  });

  it("control: a real 23 is still read as 23 (the reader has no bias towards 53)", async () => {
    const res = await parse(SYN("components_23_52025_synthetic.png"), SYN("components_23_52025_synthetic.crops.json"));
    expect(byKey(res.data.suggestions)).toEqual({ xp10: 52_025, xp100: 23 });
  });

  it("real backpack screenshot still reads 171 / 40,526 tile by tile", async () => {
    const res = await parse(REAL, path.join(__dirname, "fixtures/ocr-crops-components-real.json"));
    expect(byKey(res.data.suggestions)).toEqual({ xp10: 40_526, xp100: 171 });
  });

  it("same screenshot as the BROWSER decodes it (colour-managed pixels) → 171 / 40,526, high confidence", async () => {
    // The browser converts the phone's colour profile, so pixels differ from a plain decode;
    // before the outline-aware crop this read 177 in the browser.
    const f = (x: string) => path.join(__dirname, "fixtures", x);
    const res = await parse(f("enhancement_components_backpack.browser-decoded.png"), f("enhancement_components_backpack.browser-decoded.crops.json"));
    expect(byKey(res.data.suggestions)).toEqual({ xp10: 40_526, xp100: 171 });
    for (const s of res.data.suggestions) expect(confidenceBand(s.confidence)).toBe("high");
  });
});

describe("tile detection + digit location", () => {
  it("finds both component tiles and a tight box round each quantity", () => {
    const img = decodeImageFile(SYN("components_53_59302_synthetic.png"));
    const tiles = findRarityTiles(img);
    expect(tiles.map((t) => t.colour)).toEqual(["purple", "green"]);
    for (const t of tiles) {
      const q = locateQuantityDigits(img, t.box);
      expect(q.located).toBe(true);
      expect(q.box.height).toBeLessThan(t.box.height * 0.3);
    }
  });
  it("5 vs 2 shape evidence points the right way on both recreated tiles", () => {
    for (const [file, first] of [["components_53_59302_synthetic.png", 1], ["components_23_52025_synthetic.png", -1]] as const) {
      const img = decodeImageFile(SYN(file));
      const purple = findRarityTiles(img).find((t) => t.colour === "purple")!;
      const bin = quantityVariants(crop(img, locateQuantityDigits(img, purple.box).box))[0].image;
      const g = segmentGlyphs(bin).filter((x) => !x.isComma);
      expect(g).toHaveLength(2);
      expect(Math.sign(fiveVersusTwo(bin, g[0].box))).toBe(first);
    }
  });
});

describe("confidence + alternates (5 ↔ 2)", () => {
  const r = (variant: string, text: string, confidence: number) => ({ variant, text, confidence });

  it("one uncertain pass reading 23 → LOW, 53 offered as the first alternate", () => {
    const d = decideQuantity([r("white-200", "23", 0.61)]);
    expect(d.value).toBe(23);
    expect(confidenceBand(d.confidence)).toBe("low");
    expect(d.alternates[0]).toBe(53);
  });
  it("pass A → 23, passes B/C/D → 53: consensus 53, needs verifying, 23 kept as alternate", () => {
    const d = decideQuantity([r("A", "23", 0.8), r("B", "53", 0.85), r("C", "53", 0.8), r("D", "53", 0.75)]);
    expect(d.value).toBe(53);
    expect(d.alternates).toContain(23);
    expect(confidenceBand(d.confidence)).not.toBe("high");
  });
  it("all passes agree → high, no alternates", () => {
    const d = decideQuantity([r("A", "53", 0.95), r("B", "53", 0.9), r("C", "53", 0.95), r("D", "53", 0)]);
    expect(d.value).toBe(53);
    expect(confidenceBand(d.confidence)).toBe("high");
    expect(d.alternates).toEqual([]);
  });
  it("shape evidence can overrule a unanimous-but-wrong 2 — but only as a value to verify", () => {
    const d = decideQuantity([r("A", "23", 0.7), r("B", "23", 0.7)], { digitCount: 2, fiveTwo: [0.8, null] });
    expect(d.value).toBe(53);
    expect(d.alternates).toContain(23);
    expect(d.confidence).toBeLessThanOrEqual(0.6);
    expect(d.notes.join(" ")).toMatch(/look like 53/);
  });
  it("digit count evidence demotes readings of the wrong length", () => {
    const d = decideQuantity([r("A", "407526", 0.66), r("B", "40526", 0.5), r("C", "40526", 0.48)], { digitCount: 5 });
    expect(d.value).toBe(40_526);
  });
  it("look-alike swaps list 5↔2 first", () => {
    expect(lookalikeSwaps(23)[0]).toBe(53);
    expect(lookalikeSwaps(53)[0]).toBe(23);
  });
});

describe("local correction log (no screenshots, this browser only)", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it("keeps raw vs corrected values, capped", () => {
    const s = mem();
    appendScanLog([{ at: "t", scanType: "enhancement_components", field: "component100.quantity", rawValue: 23, correctedValue: 53, confidence: 0.61, alternates: [53] }], s);
    expect(readScanLog(s)[0]).toMatchObject({ rawValue: 23, correctedValue: 53, confidence: 0.61 });
    appendScanLog(Array.from({ length: SCAN_LOG_MAX + 5 }, (_, i) => ({ at: String(i), scanType: "x", field: "f", rawValue: i, correctedValue: i, confidence: 1 })), s);
    expect(readScanLog(s)).toHaveLength(SCAN_LOG_MAX);
  });
  it("never throws when storage is unavailable", () => {
    expect(() => appendScanLog([{ at: "t", scanType: "x", field: "f", rawValue: 1, correctedValue: 1, confidence: 1 }], { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});
