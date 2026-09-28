import { describe, it, expect } from "vitest";
import { parseExpInput, getAvailableHeroExp, totalHeroExpFromItems, totalEnhancementComponentXp } from "../lib/utils/inventory";
import { emptyInventory } from "../lib/types";
import { beats, counterTo, recommendCounter } from "../lib/optimizer/counters";

describe("Test A/B: manual Hero EXP text parsing", () => {
  it('parses "3.6m" as 3,600,000', () => {
    expect(parseExpInput("3.6m")).toBe(3_600_000);
    expect(parseExpInput("3.6M")).toBe(3_600_000);
  });
  it('parses "750k" as 750,000', () => {
    expect(parseExpInput("750k")).toBe(750_000);
    expect(parseExpInput("750K")).toBe(750_000);
  });
  it("parses a raw number as-is", () => {
    expect(parseExpInput("70500000")).toBe(70_500_000);
  });
});

describe("Test C / Test 7: Hero EXP items conversion", () => {
  it("1K/5K/10K/50K x10 each sums correctly", () => {
    const items = { exp1k: 10, exp5k: 10, exp10k: 10, exp50k: 10 };
    // 10,000 + 50,000 + 100,000 + 500,000 = 660,000
    expect(totalHeroExpFromItems(items)).toBe(660_000);
  });
});

describe("getAvailableHeroExp: modes are never summed together", () => {
  it('mode "total" ignores item quantities', () => {
    const inv = emptyInventory();
    inv.heroExp.mode = "total";
    inv.heroExp.manualTotal = 3_600_000;
    inv.heroExp.items = { exp1k: 999, exp5k: 999, exp10k: 999, exp50k: 999 };
    expect(getAvailableHeroExp(inv)).toBe(3_600_000);
  });
  it('mode "items" ignores manualTotal', () => {
    const inv = emptyInventory();
    inv.heroExp.mode = "items";
    inv.heroExp.manualTotal = 999_999_999;
    inv.heroExp.items = { exp1k: 10, exp5k: 10, exp10k: 10, exp50k: 10 };
    expect(getAvailableHeroExp(inv)).toBe(660_000);
  });
});

describe("Test 8: Enhancement component inventory conversion", () => {
  it("converts xp10/xp100 quantities to a total pool", () => {
    expect(totalEnhancementComponentXp({ xp10: 25, xp100: 6 })).toBe(850);
  });
});

describe("Test 9: Counter logic", () => {
  it("Infantry beats Lancer, Lancer beats Marksman, Marksman beats Infantry", () => {
    expect(beats("Infantry", "Lancer")).toBe(true);
    expect(beats("Lancer", "Marksman")).toBe(true);
    expect(beats("Marksman", "Infantry")).toBe(true);
    expect(beats("Lancer", "Infantry")).toBe(false);
  });
  it("counterTo / recommendCounter resolve correctly", () => {
    expect(counterTo("Lancer")).toBe("Infantry");
    expect(recommendCounter("Marksman").recommendedTroopType).toBe("Lancer");
  });
});
