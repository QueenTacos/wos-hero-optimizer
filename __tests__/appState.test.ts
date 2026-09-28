// Tests 1-3 (empty start, Base → Gen 17 picker order) and saved-data migration.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import OptimizePage from "../app/optimize/page";
import { groupHeroesForPicker } from "../lib/heroPicker";
import { migrateSavedState, loadSavedState, saveState, SAVE_KEY } from "../lib/storage/savedState";
import { emptyInventory } from "../lib/types";

describe("TEST 1: main page starts empty", () => {
  it("renders zero hero cards, with Scan roster and + Add Hero visible", () => {
    const html = renderToString(createElement(OptimizePage));
    expect(html).toContain("1. Your Heroes");
    expect(html).toContain("Scan roster");
    expect(html).toContain("+ Add Hero");
    expect(html).not.toMatch(/aria-label="Remove /); // no hero cards
    expect(html).not.toContain("Select hero");
    expect(html).not.toContain("Example data");
  });
  it("no saved data → nothing to load", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadSavedState(storage)).toBeNull();
  });
});

describe("TEST 2/3: hero picker generation order", () => {
  const order = (opts?: Parameters<typeof groupHeroesForPicker>[0]) => groupHeroesForPicker(opts).map(([g]) => g);
  const ascending = (a: number[]) => a.every((g, i) => i === 0 || g > a[i - 1]);

  it("TEST 2: Base, Gen 1, Gen 2 … Gen 17", () => {
    expect(order()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });
  it("TEST 3: troop filters and search keep Base → Gen 17 order", () => {
    for (const troop of ["Infantry", "Lancer", "Marksman"] as const) {
      const o = order({ troop });
      expect(o[0]).toBe(0);
      expect(o[o.length - 1]).toBe(17);
      expect(ascending(o)).toBe(true);
    }
    const search = groupHeroesForPicker({ query: "e" });
    expect(ascending(search.map(([g]) => g))).toBe(true);
  });
  it("heroes inside a generation keep database order (not reversed)", () => {
    const base = groupHeroesForPicker()[0][1].map((h) => h.name);
    expect(base.slice(0, 3)).toEqual(["Smith", "Eugene", "Charlie"]);
    const gen1 = groupHeroesForPicker().find(([g]) => g === 1)![1].map((h) => h.name);
    expect(gen1).toEqual(["Natalia", "Molly", "Zinman", "Jeronimo"]);
  });
});

describe("saved-data migration", () => {
  it("upgrades an older save: gear without Mastery, no legendary column, old mode names", () => {
    const v1 = {
      version: 1,
      rows: [
        { rowId: "r1", heroDefId: "jessie", level: 60, stars: 4.5, gear: { goggles: { rarity: "mythic", enhancementLevel: 80 }, gloves: null } },
        { rowId: "r2", heroDefId: "not-a-hero", level: 10, stars: 1, gear: {} },
      ],
      inventory: { heroExp: { mode: "total", manualTotal: 143390000, items: {} }, enhancementComponents: { xp10: 40526, xp100: 171 }, unassignedGear: { goggles: { mythic: 2 } }, essenceStones: 5, mithril: 1 },
      enhancementMode: "balanced",
      levelingMode: "priority",
    };
    const s = migrateSavedState(JSON.stringify(v1))!;
    expect(s.version).toBe(2);
    expect(s.rows).toHaveLength(1); // unknown hero dropped
    expect(s.rows[0].gear.goggles).toEqual({ rarity: "mythic", enhancementLevel: 80, masteryLevel: 0, masteryStage: 0 });
    expect(s.rows[0].gear.belt).toBeNull();
    expect(s.inventory.unassignedGear.goggles).toMatchObject({ mythic: 2, legendary: 0 });
    expect(s.inventory.sacrificedGearXp).toBe(0);
    expect(s.enhancementMode).toBe("priority-pieces");
    expect(s.levelingMode).toBe("priority");
  });
  it("reads Mastery written as { mastery: { level, stage } } too", () => {
    const s = migrateSavedState({ rows: [{ rowId: "a", heroDefId: "jessie", level: 1, stars: 0, gear: { goggles: { rarity: "legendary", enhancementLevel: 19, mastery: { level: 10, stage: 0 } } } }] })!;
    expect(s.rows[0].gear.goggles).toMatchObject({ rarity: "legendary", enhancementLevel: 19, masteryLevel: 10, masteryStage: 0 });
  });
  it("keeps a valid savedAt and drops a garbage one", () => {
    const row = { rowId: "a", heroDefId: "jessie", level: 1, stars: 0, gear: {} };
    expect(migrateSavedState({ rows: [row], savedAt: "2026-09-28T10:00:00Z" })!.savedAt).toBe("2026-09-28T10:00:00Z");
    expect(migrateSavedState({ rows: [row], savedAt: "not a date" })!.savedAt).toBeUndefined();
  });
  it("never throws on garbage", () => {
    for (const bad of ["{not json", 42, null, { rows: "x" }, "[]"]) expect(migrateSavedState(bad)).toBeNull();
  });
  it("save → load round-trips", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const inventory = emptyInventory();
    inventory.essenceStones = 110;
    saveState(
      {
        rows: [{ rowId: "r", heroDefId: "alonso", level: 80, stars: 5, gear: { goggles: { rarity: "mythic", enhancementLevel: 100, masteryLevel: 10, masteryStage: 0, priority: true }, gloves: null, belt: null, boots: null } }],
        inventory, expTotalDraft: "143.39m", levelingMode: "balanced", enhancementMode: "priority-pieces", manualMode: true, manualTop3: false, top3RowIds: [],
      },
      storage
    );
    expect(JSON.parse(store.get(SAVE_KEY)!).version).toBe(2);
    const back = loadSavedState(storage)!;
    expect(back.rows[0].gear.goggles).toEqual({ rarity: "mythic", enhancementLevel: 100, masteryLevel: 10, masteryStage: 0, priority: true });
    expect(back.inventory.essenceStones).toBe(110);
  });
});
