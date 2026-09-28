import { describe, it, expect } from "vitest";
import {
  parseQuantityText,
  extractQuantityTokens,
  sortReadingOrder,
  suggestFieldValues,
  confidenceLevel,
  OcrWord,
} from "../lib/screenshot/quantityTokens";
import { applyConfirmedValues } from "../lib/screenshot/targets";
import { preprocessPixels, chooseScale } from "../imageRecognition/preprocess";
import { createResourceInventoryParser } from "../screenshotParser";
import { emptyInventory } from "../lib/types";
import { getAvailableHeroExp } from "../lib/utils/inventory";

const word = (text: string, x: number, y: number, confidence = 0.9): OcrWord => ({
  text,
  confidence,
  bbox: { x, y, width: 40, height: 20 },
});

describe("parseQuantityText", () => {
  it.each([
    ["1234", 1234],
    ["1,234", 1234],
    ["1.234", 1234],
    ["12,345,678", 12345678],
    ["x45", 45],
    ["×45", 45],
    ["45x", 45],
    ["12.5K", 12500],
    ["3.6M", 3600000],
    ["3,6M", 3600000],
    ["750k", 750000],
    ["1O5", 105], // O read instead of 0
    ["l2", 12], // l read instead of 1
    ["(88)", 88],
  ])("%s -> %d", (raw, expected) => {
    expect(parseQuantityText(raw)).toBe(expected);
  });

  it.each(["", "abc", "Hero", "12,34", "1.5", "--", "XP"])("rejects %s", (raw) => {
    expect(parseQuantityText(raw)).toBeNull();
  });
});

describe("extractQuantityTokens", () => {
  it("keeps numbers, drops words and very low-confidence noise", () => {
    const tokens = extractQuantityTokens([word("Hero", 0, 0), word("120", 50, 0), word("9", 100, 0, 0.05)]);
    expect(tokens.map((t) => t.value)).toEqual([120]);
  });
});

describe("sortReadingOrder", () => {
  it("orders rows top-to-bottom and left-to-right, tolerating slight misalignment", () => {
    const tokens = extractQuantityTokens([
      word("4", 300, 202),
      word("3", 10, 198),
      word("2", 300, 3),
      word("1", 10, 0),
    ]);
    expect(sortReadingOrder(tokens).map((t) => t.value)).toEqual([1, 2, 3, 4]);
  });
});

describe("suggestFieldValues", () => {
  it("assigns in reading order, caps confidence at 0.5, and leaves missing fields empty", () => {
    const tokens = extractQuantityTokens([word("30", 200, 0), word("10", 0, 0), word("5", 400, 0)]);
    const s = suggestFieldValues(tokens, ["exp1k", "exp5k", "exp10k", "exp50k"]);
    expect(s.map((x) => x.value)).toEqual([10, 30, 5, null]);
    expect(s.every((x) => x.confidence <= 0.5)).toBe(true);
    expect(s[3].confidence).toBe(0);
    expect(confidenceLevel(s[0].confidence)).toBe("medium");
  });
});

describe("applyConfirmedValues", () => {
  it("writes EXP items, switches to items mode, never mutates the input", () => {
    const inv = emptyInventory();
    const next = applyConfirmedValues(inv, "hero_exp_items", { exp1k: 10, exp5k: 10, exp10k: 10, exp50k: 10 });
    expect(getAvailableHeroExp(next)).toBe(660_000);
    expect(next.heroExp.mode).toBe("items");
    expect(inv.heroExp.items.exp1k).toBe(0);
  });

  it("writes total EXP and switches to total mode", () => {
    const next = applyConfirmedValues(emptyInventory(), "hero_exp_total", { total: 3_600_000 });
    expect(next.heroExp.mode).toBe("total");
    expect(getAvailableHeroExp(next)).toBe(3_600_000);
  });

  it("leaves a field unchanged when the user left it blank", () => {
    const inv = { ...emptyInventory(), enhancementComponents: { xp10: 7, xp100: 3 } };
    const next = applyConfirmedValues(inv, "enhancement_components", { xp10: 50, xp100: null });
    expect(next.enhancementComponents).toEqual({ xp10: 50, xp100: 3 });
  });
});

describe("preprocessPixels", () => {
  const px = (...rgb: number[][]) => ({
    data: new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r, g, b, 255])),
    width: rgb.length,
    height: 1,
  });

  it("bright-text: white pixels become black text, colored/dark pixels become background", () => {
    const out = preprocessPixels(px([255, 255, 255], [20, 20, 20], [255, 200, 0]), "bright-text");
    expect([out.data[0], out.data[4], out.data[8]]).toEqual([0, 255, 255]);
  });

  it("grayscale: stretches contrast to the full range", () => {
    const out = preprocessPixels(px([150, 150, 150], [200, 200, 200]), "grayscale");
    expect([out.data[0], out.data[4]]).toEqual([0, 255]);
  });

  it("grayscale: inverts dark screens so text becomes dark-on-light", () => {
    const out = preprocessPixels(px([10, 10, 10], [10, 10, 10], [240, 240, 240]), "grayscale");
    expect([out.data[0], out.data[8]]).toEqual([255, 0]);
  });

  it("upscales small screenshots more", () => {
    expect(chooseScale(640)).toBe(3);
    expect(chooseScale(1170)).toBe(2);
    expect(chooseScale(2000)).toBe(1);
  });
});

describe("ResourceInventoryParser", () => {
  it("retries with grayscale when the first pass finds too few numbers", async () => {
    const calls: string[] = [];
    const parser = createResourceInventoryParser({
      async recognizeWords(_img, opts) {
        calls.push(opts?.preprocess ?? "");
        return opts?.preprocess === "bright-text" ? [word("10", 0, 0)] : [word("10", 0, 0), word("20", 100, 0)];
      },
    });
    const res = await parser.parse(new Blob(), "enhancement_components");
    expect(calls).toEqual(["bright-text", "grayscale"]);
    expect(res.data.pass).toBe("grayscale");
    expect(res.data.suggestions.map((s) => s.value)).toEqual([10, 20]);
    expect(res.overallConfidence).toBeLessThanOrEqual(0.5);
  });

  it("warns when nothing could be read", async () => {
    const parser = createResourceInventoryParser({ recognizeWords: async () => [] });
    const res = await parser.parse(new Blob(), "hero_exp_total");
    expect(res.data.suggestions[0].value).toBeNull();
    expect(res.warnings[0]).toMatch(/No numbers/);
  });
});

import { removeLongHorizontalRuns } from "../imageRecognition/preprocess";
describe("removeLongHorizontalRuns", () => {
  it("erases a long black line but keeps short strokes (digits)", () => {
    const w = 200, h = 2;
    const d = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let x = 0; x < 150; x++) d[x * 4] = d[x * 4 + 1] = d[x * 4 + 2] = 0; // row 0: long line
    for (let x = 10; x < 30; x++) d[(w + x) * 4] = d[(w + x) * 4 + 1] = d[(w + x) * 4 + 2] = 0; // row 1: short stroke
    removeLongHorizontalRuns(d, w, h);
    expect(d[0]).toBe(255);
    expect(d[(w + 15) * 4]).toBe(0);
  });
});
