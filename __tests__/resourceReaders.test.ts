// Resource readers on REAL screenshots. OCR words were recorded from a real
// Tesseract.js run on these images (fixtures/ocr-words-real-resources.json);
// pixel checks (tile colour, icons) use the actual image files.
import { describe, it, expect } from "vitest";
import path from "path";
import words from "./fixtures/ocr-words-real-resources.json";
import { decodeImageFile } from "./helpers/decodeImage";
import { parseGameNumber, readHeroXpTotal, readEnhancementComponents, enhancementXpFrom } from "../lib/screenshot/resourceReaders";
import { OcrWord } from "../lib/screenshot/quantityTokens";

const D = path.join(__dirname, "..", "docs/package/reference-screenshots");
const img = (f: string) => decodeImageFile(path.join(D, f));

describe("parseGameNumber", () => {
  it.each([
    ["143.39M", 143_390_000],
    ["70.50M", 70_500_000],
    ["135.19K", 135_190],
    ["10.42K", 10_420],
    ["40,526", 40_526],
    ["6.49M", 6_490_000],
    ["9.7K", 9_700],
    ["3.6m", 3_600_000],
    ["750k", 750_000],
    ["171", 171],
  ])("%s → %d", (t, n) => expect(parseGameNumber(t)).toBe(n));
});

describe("Hero XP (real resource list screenshot)", () => {
  it("reads 143.39M from the “Hero XP” row = 143,390,000, confirmed by the bottle icon", () => {
    const r = readHeroXpTotal(words.heroXpList as OcrWord[], img("06_real_test_cases/hero_xp_resource_list.jpg"));
    expect(r.value).toBe(143_390_000);
    expect(r.rawText).toBe("143.39M");
    expect(r.labelFound).toBe(true);
    expect(r.iconConfirmed).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("ignores the other rows (Chief Stamina 10.42K, Pet Food 135.19K)", () => {
    const r = readHeroXpTotal(words.heroXpList as OcrWord[]);
    expect(r.value).not.toBe(10_420);
    expect(r.value).not.toBe(135_190);
  });

  it("package reference image: 70.50M = 70,500,000 (ignores the '10' misread inside the bottle)", () => {
    const r = readHeroXpTotal(words.heroXpRef as OcrWord[], img("02_resources/hero_xp_total_70_50m.png"));
    expect(r.value).toBe(70_500_000);
  });

  it("no label → no guess", () => {
    const r = readHeroXpTotal([{ text: "143.39M", confidence: 0.9, bbox: { x: 0, y: 0, width: 10, height: 10 } }]);
    expect(r.value).toBeNull();
    expect(r.labelFound).toBe(false);
  });
});

describe("Enhancement Components (real backpack screenshot)", () => {
  const image = img("06_real_test_cases/enhancement_components_backpack.jpg");
  const r = readEnhancementComponents(words.components as OcrWord[], image);

  it("pairs the XP-per-item label with the quantity in the same tile", () => {
    expect(r.xp100).toMatchObject({ xpPerItem: 100, quantity: 171, tileConfirmed: true });
    expect(r.xp10).toMatchObject({ xpPerItem: 10, quantity: 40_526, tileConfirmed: true });
  });

  it("never treats the 10/100 labels as quantities, and ignores unrelated tiles (6,715 · 583,321)", () => {
    const qtys = [r.xp10!.quantity, r.xp100!.quantity];
    expect(qtys).not.toContain(10);
    expect(qtys).not.toContain(100);
    expect(qtys).not.toContain(6_715);
    expect(qtys).not.toContain(583_321);
  });

  it("totals 17,100 + 405,260 = 422,360 Enhancement XP", () => {
    expect(enhancementXpFrom(r.xp10!.quantity, r.xp100!.quantity)).toEqual({ fromXp10: 405_260, fromXp100: 17_100, total: 422_360 });
  });

  it("flags a tile of the wrong colour instead of trusting it", () => {
    // Pretend the '100' label sat on the green tile: swap the words' positions.
    const w = (words.components as OcrWord[]).map((x) => ({ ...x, bbox: { ...x.bbox } }));
    const l100 = w.find((x) => x.text === "100")!, l10 = w.find((x) => x.text === "10")!;
    [l100.text, l10.text] = ["10", "100"];
    const bad = readEnhancementComponents(w, image);
    expect(bad.xp100!.tileConfirmed).toBe(false);
    expect(bad.xp100!.confidence).toBeLessThan(0.6);
    expect(bad.notes.join(" ")).toMatch(/expected colour/);
  });
});

import { createResourceInventoryParser } from "../screenshotParser";
import { applyConfirmedValues } from "../lib/screenshot/targets";
import { emptyInventory } from "../lib/types";
import { getAvailableHeroExp, getAvailableEnhancementXp } from "../lib/utils/inventory";

describe("resource parser pipeline on the real screenshots (recorded OCR, real pixels)", () => {
  const replay = (w: unknown, file: string) =>
    createResourceInventoryParser({ recognizeWords: async () => w as OcrWord[] }, { loadPixels: async () => img(file) });

  it("Hero XP screenshot → Review suggests 143,390,000 → applied as Total EXP", async () => {
    const res = await replay(words.heroXpList, "06_real_test_cases/hero_xp_resource_list.jpg").parse(new Blob(), "hero_exp_total");
    const s = res.data.suggestions[0];
    expect(s).toMatchObject({ fieldKey: "total", value: 143_390_000 });
    expect(s.confidence).toBeGreaterThanOrEqual(0.85);
    expect(s.tokenId).not.toBeNull(); // highlighted on the screenshot in the Review screen
    const inv = applyConfirmedValues(emptyInventory(), "hero_exp_total", { total: s.value });
    expect(getAvailableHeroExp(inv)).toBe(143_390_000);
  });

  it("Components screenshot → Review suggests 40,526 × 10 and 171 × 100 → 422,360 Enhancement XP", async () => {
    const res = await replay(words.components, "06_real_test_cases/enhancement_components_backpack.jpg").parse(new Blob(), "enhancement_components");
    const byKey = Object.fromEntries(res.data.suggestions.map((s) => [s.fieldKey, s.value]));
    expect(byKey).toEqual({ xp10: 40_526, xp100: 171 });
    const inv = applyConfirmedValues(emptyInventory(), "enhancement_components", byKey);
    expect(getAvailableEnhancementXp(inv)).toBe(422_360);
    expect(res.warnings.join(" ")).toMatch(/top number is the XP per item/);
  });
});

describe("close-up retry when the full-screen pass misses a quantity", () => {
  it("re-reads the 100 XP quantity from its tile when '171' was missed (as happened in a browser run)", async () => {
    const withoutQty = (words.components as OcrWord[]).filter((w) => w.text !== "171");
    const calls: string[] = [];
    const parser = createResourceInventoryParser(
      {
        recognizeWords: async () => {
          const isCloseUp = calls.length > 0;
          calls.push(isCloseUp ? "close-up" : "full");
          return isCloseUp ? [{ text: "171", confidence: 0.6, bbox: { x: 40, y: 20, width: 70, height: 50 } }] : withoutQty;
        },
      },
      { loadPixels: async () => img("06_real_test_cases/enhancement_components_backpack.jpg"), encodeCrop: async () => new Blob() }
    );
    const res = await parser.parse(new Blob(), "enhancement_components");
    expect(calls).toEqual(["full", "close-up"]);
    expect(Object.fromEntries(res.data.suggestions.map((s) => [s.fieldKey, s.value]))).toEqual({ xp10: 40_526, xp100: 171 });
    expect(res.warnings.join(" ")).toMatch(/re-read from a close-up/);
  });

  it("does not treat a stray '100' on a non-component tile as a label", () => {
    const r = readEnhancementComponents(
      [{ text: "100", confidence: 0.9, bbox: { x: 181, y: 57, width: 56, height: 25 } }], // sits on the brown 6,715 tile
      img("06_real_test_cases/enhancement_components_backpack.jpg")
    );
    expect(r.unpaired).toEqual([]);
    expect(r.xp100).toBeNull();
  });
});
