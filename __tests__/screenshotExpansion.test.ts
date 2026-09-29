// Screenshot expansion: Hero Gear, Essence Stones, Mithril, gear inventory,
// common scan model. Real images where we have them (empty gear screens,
// backpack); a SYNTHETIC equipped gear screen (__tests__/fixtures/synthetic)
// for the equipped-gear reading, with its OCR words recorded from a real
// Tesseract run (same settings as the app) so the test is deterministic.

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { decodeImageFile } from "./helpers/decodeImage";
import { findGearSlotTiles, findRarityTiles, ringColour } from "../imageRecognition/gearTiles";
import { createHeroGearParser } from "../screenshotParser/gearParser";
import { createResourceInventoryParser } from "../screenshotParser";
import { extractGearTokens, readGearScreen } from "../lib/screenshot/gearScreenReading";
import { confirmedFromDraft, draftProblems, initialSlotDrafts, mergeGearScans } from "../lib/screenshot/gearScanApply";
import { applyGearCounts, countReviewedItems, readGearInventory } from "../lib/screenshot/gearInventoryReading";
import { ESSENCE_STONE_LABEL, MITHRIL_LABEL, readLabeledQuantity } from "../lib/screenshot/resourceReaders";
import { applyConfirmedValues } from "../lib/screenshot/targets";
import { confidenceBand, initialReviewValue, SCAN_TYPES } from "../lib/screenshot/scanTypes";
import { spareMythicGearBySlot, spareMythicGearCount } from "../lib/utils/inventory";
import type { OcrWord } from "../lib/screenshot/quantityTokens";
import { emptyInventory } from "../lib/types";

const ROOT = path.join(__dirname, "..");
const REF = (f: string) => decodeImageFile(path.join(ROOT, "docs/package/reference-screenshots", f));
const SYN = (f: string) => path.join(__dirname, "fixtures/synthetic", f);
const w = (text: string, x: number, y: number, width = 40, height = 20, confidence = 0.9): OcrWord => ({ text, confidence, bbox: { x, y, width, height } });
/** Fake OCR engine that replays recorded passes in order. */
const replay = (passes: OcrWord[][]) => {
  let i = 0;
  return { recognizeWords: async () => passes[Math.min(i++, passes.length - 1)] };
};

describe("common scan model", () => {
  it("confidence bands and pre-fill rule", () => {
    expect(confidenceBand(0.9)).toBe("high");
    expect(confidenceBand(0.6)).toBe("medium");
    expect(confidenceBand(0.4)).toBe("low");
    expect(initialReviewValue({ value: 27, confidence: 0.9 })).toBe(27);
    expect(initialReviewValue({ value: 27, confidence: 0.72 })).toBe(27);
    expect(initialReviewValue({ value: 27, confidence: 0.3 })).toBeNull(); // low: never auto-filled
  });
  it("every scan type is registered", () => {
    expect(Object.keys(SCAN_TYPES).sort()).toEqual(
      ["enhancement-components", "essence-stones", "extra-gear", "hero-exp", "hero-gear", "hero-roster", "mithril", "mythic-gear"]
    );
  });
});

describe("Hero Gear screen — slot tiles (real screenshots)", () => {
  it.each(["hero_gear_screen_example_1.png", "hero_gear_screen_example_2.png"])("%s: four empty slots in the in-game positions", (f) => {
    const img = REF(`05_ui_reference/${f}`);
    const tiles = findGearSlotTiles(img);
    expect(tiles.map((t) => t.position).sort()).toEqual(["bottom-left", "bottom-right", "top-left", "top-right"]);
    expect(tiles.every((t) => t.colour === "empty")).toBe(true);
    // Hero art in the middle is never a tile
    for (const t of tiles) expect(t.box.x + t.box.width < img.width * 0.36 || t.box.x > img.width * 0.64).toBe(true);
  });

  it("empty gear screen → every slot 'looks empty', nothing ticked", () => {
    const img = REF("05_ui_reference/hero_gear_screen_example_2.png");
    const scan = readGearScreen([], img, findGearSlotTiles(img));
    const drafts = initialSlotDrafts(scan);
    for (const s of Object.values(scan.slots)) expect(s.equipped.value).toBe(false);
    expect(Object.values(drafts).some((d) => d.include)).toBe(false);
  });
});

describe("Hero Gear screen — equipped (synthetic Jessie screen, recorded OCR)", () => {
  const img = decodeImageFile(SYN("gear_jessie_synthetic.png"));
  const passes: OcrWord[][] = JSON.parse(fs.readFileSync(SYN("gear_jessie_synthetic.ocr.json"), "utf8"));

  it("reads hero, and Enhancement and Mastery separately per slot", async () => {
    const { scan } = await createHeroGearParser(replay(passes), { loadPixels: async () => img }).parse(new Blob([]));
    expect(scan.hero.value).toBe("jessie");
    expect(scan.troopType).toBe("Lancer");
    expect(scan.tilesFound).toBe(true);
    const got = Object.fromEntries(Object.entries(scan.slots).map(([k, v]) => [k, [v.enhancement.value, v.mastery.value]]));
    expect(got).toEqual({ goggles: [19, 10], gloves: [0, 1], belt: [100, 10], boots: [16, 11] });
    // "+19" is Enhancement, "Lv.10" is Mastery — never swapped
    expect(scan.slots.goggles.enhancement.source).toBe("“+19”");
    expect(scan.slots.goggles.mastery.source).toBe("“Lv.10”");
  });

  it("red tile → Legendary, but only as a low-confidence suggestion (not pre-filled)", async () => {
    const { scan } = await createHeroGearParser(replay(passes), { loadPixels: async () => img }).parse(new Blob([]));
    expect(scan.slots.goggles.quality.value).toBe("legendary");
    expect(confidenceBand(scan.slots.goggles.quality.confidence)).toBe("low");
    const drafts = initialSlotDrafts(scan);
    expect(drafts.goggles.quality).toBe(""); // user must pick
    expect(drafts.goggles).toMatchObject({ include: true, enhancement: 19, mastery: 10 });
    expect(draftProblems("jessie", drafts)).toContain("Goggles: pick the quality");
  });

  it("existing Legendary gear keeps its quality; confirmed Legendary +19 stays Legendary (never Mythic)", async () => {
    const { scan } = await createHeroGearParser(replay(passes), { loadPixels: async () => img }).parse(new Blob([]));
    const existing = {
      goggles: { rarity: "legendary" as const, enhancementLevel: 16, masteryLevel: 10, masteryStage: 0, priority: true },
      gloves: { rarity: "legendary" as const, enhancementLevel: 0, masteryLevel: 1, masteryStage: 0 },
      belt: { rarity: "mythic" as const, enhancementLevel: 100, masteryLevel: 10, masteryStage: 0 },
      boots: { rarity: "legendary" as const, enhancementLevel: 14, masteryLevel: 11, masteryStage: 0 },
    };
    const drafts = initialSlotDrafts(scan, existing);
    // Gloves "Lv.1" was read as "Lv.]" (61%) → low confidence → offered as "Use Lv.1", not pre-filled.
    expect(scan.slots.gloves.mastery.value).toBe(1);
    expect(drafts.gloves.mastery).toBeNull();
    expect(draftProblems("jessie", drafts)).toEqual(["Gloves: enter Mastery (0 if none)"]);
    drafts.gloves = { ...drafts.gloves, mastery: scan.slots.gloves.mastery.value, userSet: { mastery: true } }; // user taps "Use Lv.1"
    expect(draftProblems("jessie", drafts)).toEqual([]);
    const c = confirmedFromDraft("jessie", drafts, existing);
    expect(c.slots.goggles).toEqual({ rarity: "legendary", enhancementLevel: 19, masteryLevel: 10, masteryStage: 0, priority: true });
    expect(c.slots.boots).toMatchObject({ rarity: "legendary", enhancementLevel: 16, masteryLevel: 11 });
    expect(c.slots.belt).toMatchObject({ rarity: "mythic", enhancementLevel: 100 });
  });

  it("warns when the screenshot's hero differs from the card it was scanned from", () => {
    const scan = readGearScreen(passes.flat(), img, findGearSlotTiles(img), { expectedHeroId: "alonso" });
    expect(scan.hero.value).toBe("jessie");
    expect(scan.warnings.join(" ")).toMatch(/Jessie's gear/);
  });
});

describe("gear tokens", () => {
  it("parses +N and Lv.N, split words and look-alikes; rejects out-of-range", () => {
    const t = extractGearTokens([
      w("+19", 10, 10),
      w("Lv.]", 10, 40),
      w("+", 200, 10, 10),
      w("7", 212, 10, 12),
      w("Lv.", 200, 40, 20),
      w("12", 222, 40, 20),
      w("+150", 400, 10),
      w("Lv.25", 400, 40),
      w("Lvl.3", 600, 40),
    ]);
    expect(t.map((x) => [x.kind, x.value])).toEqual([
      ["enhancement", 19],
      ["mastery", 1],
      ["enhancement", 7],
      ["mastery", 12],
      ["mastery", 3],
    ]);
    expect(t.find((x) => x.rawText === "Lv.]")!.confidence).toBeLessThan(0.9); // look-alike fix lowers confidence
  });

  it("without slot tiles, falls back to screen quadrants with a warning and lower confidence", () => {
    const words = [w("+19", 100, 300), w("Lv.10", 100, 260), w("+0", 900, 300), w("+100", 100, 700), w("+16", 900, 700), w("Lv.11", 900, 660)];
    const scan = readGearScreen(words, { width: 1170, height: 1500 }, []);
    expect(scan.tilesFound).toBe(false);
    expect(scan.slots.goggles.enhancement.value).toBe(19);
    expect(scan.slots.goggles.mastery.value).toBe(10);
    expect(scan.slots.gloves.enhancement.value).toBe(0);
    expect(scan.slots.belt.enhancement.value).toBe(100);
    expect(scan.slots.boots).toMatchObject({ enhancement: { value: 16 }, mastery: { value: 11 } });
    expect(scan.slots.goggles.enhancement.confidence).toBeLessThan(0.85);
    expect(scan.warnings.join(" ")).toMatch(/screen position/);
  });
});

describe("merging confirmed gear into the roster", () => {
  const blank = { goggles: null, gloves: null, belt: null, boots: null };
  const rows = [
    { rowId: "a", heroDefId: "jessie", gear: { ...blank, goggles: { rarity: "legendary" as const, enhancementLevel: 16, masteryLevel: 10, masteryStage: 0, priority: true }, belt: { rarity: "mythic" as const, enhancementLevel: 80, masteryLevel: 5, masteryStage: 2 } } },
    { rowId: "b", heroDefId: "flint", gear: blank },
  ];
  const newRow = (id: string) => ({ rowId: "new", heroDefId: id, gear: blank });

  it("existing hero: only approved slots change; other slots untouched", () => {
    const res = mergeGearScans(rows, [{ heroDefId: "jessie", slots: { goggles: { rarity: "legendary", enhancementLevel: 19, masteryLevel: 10, masteryStage: 0, priority: true } } }], newRow);
    expect(res.rows[0].gear.goggles).toMatchObject({ enhancementLevel: 19, priority: true });
    expect(res.rows[0].gear.belt).toEqual(rows[0].gear.belt);
    expect(res).toMatchObject({ heroesUpdated: 1, heroesAdded: 0, slotsWritten: 1 });
    expect(rows[0].gear.goggles!.enhancementLevel).toBe(16); // input not mutated
  });
  it("new hero is added with the scanned gear; nothing approved = nothing changes", () => {
    const res = mergeGearScans(rows, [{ heroDefId: "alonso", slots: { boots: { rarity: "mythic", enhancementLevel: 100, masteryLevel: 10, masteryStage: 0 } } }, { heroDefId: "flint", slots: {} }], newRow);
    expect(res.rows).toHaveLength(3);
    expect(res.rows[2]).toMatchObject({ heroDefId: "alonso", gear: { boots: { enhancementLevel: 100 } } });
    expect(res.rows[1]).toBe(rows[1]);
  });
});

describe("Essence Stones & Mithril (label-anchored)", () => {
  it("resource-list row and item popup layouts; K/M numbers", () => {
    expect(readLabeledQuantity([w("Essence", 100, 50, 120), w("Stone", 230, 50, 90), w("1,250", 800, 50, 90)], ESSENCE_STONE_LABEL).value).toBe(1250);
    expect(readLabeledQuantity([w("Essence", 100, 50, 120), w("Stones", 230, 50, 90), w("10.5K", 800, 50, 90)], ESSENCE_STONE_LABEL).value).toBe(10500);
    expect(readLabeledQuantity([w("Mithril", 100, 50), w("Owned:", 100, 120, 80), w("27", 190, 120, 30)], MITHRIL_LABEL).value).toBe(27);
    expect(readLabeledQuantity([w("Mithrll", 100, 50), w("Owned:27", 100, 120, 110)], MITHRIL_LABEL).value).toBe(27); // one-letter OCR slip
  });
  it("is not confused by other items", () => {
    const words = [w("Enhancement", 100, 50, 150), w("Component", 260, 50, 150), w("40,526", 800, 50), w("Essence", 100, 150, 120), w("Stone", 230, 150, 90), w("1,250", 800, 150), w("Mithril", 100, 250), w("Chest", 150, 250), w("3", 800, 250, 20)];
    expect(readLabeledQuantity(words, ESSENCE_STONE_LABEL).value).toBe(1250);
    const m = readLabeledQuantity(words, MITHRIL_LABEL); // only a "Mithril Chest" row
    expect(m.labelFound).toBe(false);
    expect(m.value).toBeNull();
  });
  it("no label → nothing filled in (user taps the number instead)", () => {
    const r = readLabeledQuantity([w("27", 100, 100), w("1,250", 300, 100)], MITHRIL_LABEL);
    expect(r).toMatchObject({ value: null, labelFound: false, confidence: 0 });
  });

  it.each([
    ["essence_popup_synthetic", "essence_stones", 1250],
    ["mithril_popup_synthetic", "mithril", 27],
  ] as const)("%s (synthetic popup, recorded OCR) → %s = %i, reviewed before use", async (file, target, expected) => {
    const passes: OcrWord[][] = JSON.parse(fs.readFileSync(SYN(`${file}.ocr.json`), "utf8"));
    const res = await createResourceInventoryParser(replay(passes), { loadPixels: null }).parse(new Blob([]), target);
    expect(res.data.suggestions[0]).toMatchObject({ fieldKey: "qty", value: expected });
    expect(confidenceBand(res.data.suggestions[0].confidence)).toBe("medium"); // highlighted for review, never "high" without an icon check
  });

  it("confirmed values land in their own pools only", () => {
    const inv = { ...emptyInventory(), essenceStones: 5, mithril: 2 };
    const a = applyConfirmedValues(inv, "essence_stones", { qty: 1250 });
    expect(a).toMatchObject({ essenceStones: 1250, mithril: 2, enhancementComponents: inv.enhancementComponents });
    const b = applyConfirmedValues(inv, "mithril", { qty: 27 });
    expect(b).toMatchObject({ essenceStones: 5, mithril: 27 });
    expect(applyConfirmedValues(inv, "mithril", { qty: null }).mithril).toBe(2); // blank = unchanged
  });
});

describe("Hero EXP: Total vs Items never added together", () => {
  it("applying a Total scan switches to Total mode; Items are kept but unused", () => {
    const inv = emptyInventory();
    inv.heroExp.items.exp50k = 10;
    const t = applyConfirmedValues(inv, "hero_exp_total", { total: 143_390_000 });
    expect(t.heroExp.mode).toBe("total");
    expect(t.heroExp.manualTotal).toBe(143_390_000);
    const i = applyConfirmedValues(t, "hero_exp_items", { exp1k: 1, exp5k: 0, exp10k: 0, exp50k: 2 });
    expect(i.heroExp.mode).toBe("items");
  });
});

describe("gear inventory (Extra / spare Mythic)", () => {
  const backpack = REF("06_real_test_cases/enhancement_components_backpack.jpg");
  const words: OcrWord[] = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/ocr-words-real-resources.json"), "utf8")).components;

  it("finds complete tiles on a real backpack screenshot, skips cut-off ones, reads border colour", () => {
    const tiles = findRarityTiles(backpack);
    expect(tiles.map((t) => t.colour)).toEqual(["purple", "green"]);
    expect(ringColour(backpack, tiles[0].box).colour).toBe("purple"); // light-blue nut icon ignored
  });
  it("quality from colour + quantity from the tile; slot left for the user", () => {
    const items = readGearInventory(findRarityTiles(backpack), words);
    expect(items.map((i) => [i.quality.value, i.quantity.value, i.slot.value])).toEqual([
      ["epic", 171, null],
      ["uncommon", 40526, null],
    ]);
  });
  it("counts only ticked items with a slot; replace vs add", () => {
    const counts = countReviewedItems([
      { slot: "goggles", quality: "mythic", quantity: 2, include: true },
      { slot: "goggles", quality: "mythic", quantity: 1, include: true },
      { slot: null, quality: "mythic", quantity: 5, include: true },
      { slot: "boots", quality: "epic", quantity: 4, include: false },
    ]);
    expect(counts).toEqual({ goggles: { mythic: 3 } });
    const cur = emptyInventory().unassignedGear;
    cur.goggles.mythic = 1;
    cur.belt.mythic = 2;
    expect(applyGearCounts(cur, counts, "replace").goggles.mythic).toBe(3);
    expect(applyGearCounts(cur, counts, "add").goggles.mythic).toBe(4);
    expect(applyGearCounts(cur, counts, "replace").belt.mythic).toBe(2); // not in scan → untouched
    const next = applyGearCounts(cur, counts, "replace");
    expect(spareMythicGearBySlot(next)).toEqual({ goggles: 3, gloves: 0, belt: 2, boots: 0 });
    expect(spareMythicGearCount(next)).toBe(5); // per-slot and total stay consistent
  });
});
