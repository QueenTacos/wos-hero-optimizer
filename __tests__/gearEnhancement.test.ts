import { describe, it, expect } from "vitest";
import { optimizeGearEnhancement } from "../lib/optimizer/gearEnhancement";
import { gearXpCost, GEAR_MAX_LEVEL } from "../lib/data/gearXpTable";
import { Hero, GearSlot, GEAR_SLOTS } from "../lib/types";

function makeHero(id: string, slotLevels: number[]): Hero {
  const gear: Hero["gear"] = { goggles: null, gloves: null, belt: null, boots: null };
  GEAR_SLOTS.forEach((slot: GearSlot, i) => {
    gear[slot] = { slot, rarity: "epic", enhancementLevel: slotLevels[i] };
  });
  return {
    id,
    name: id,
    generation: 1,
    troopType: "Infantry",
    rarity: "Mythic",
    level: 60,
    stars: 3,
    power: 5000,
    roleTags: [],
    gear,
    sourceConfidence: 1,
  };
}

describe("optimizeGearEnhancement", () => {
  it("Test 4 (updated for the priority strategy): priority pieces are enhanced before the other pieces", () => {
    // Each hero's 2 most-progressed pieces are the automatic priority pieces (goggles + gloves here).
    const top3 = [makeHero("h1", [30, 30, 10, 10]), makeHero("h2", [30, 30, 10, 10]), makeHero("h3", [30, 30, 10, 10])];
    const budget = gearXpCost(30, 40) * 3; // not enough to finish the priority pieces
    const plan = optimizeGearEnhancement(top3, budget, "priority-pieces");
    const touched = plan.steps.map((s) => s.slot);
    expect(touched.every((s) => s === "goggles" || s === "gloves")).toBe(true);
    expect(plan.pieces!.filter((p) => !p.priority).every((p) => p.status === "waiting" && p.xpSpent === 0)).toBe(true);
    expect(plan.xpUsed).toBeLessThanOrEqual(budget);
  });

  it("Test 5: Hero #4 gear stays at Lv 0 even with huge component inventory", () => {
    const top3 = [makeHero("h1", [50, 50, 50, 50]), makeHero("h2", [50, 50, 50, 50]), makeHero("h3", [50, 50, 50, 50])];
    const hero4 = makeHero("h4", [0, 0, 0, 0]); // intentionally NOT passed into the optimizer
    const plan = optimizeGearEnhancement(top3, 100_000_000, "priority-pieces");
    const touchedHeroIds = new Set(plan.steps.map((s) => s.heroId));
    expect(touchedHeroIds.has("h4")).toBe(false);
    for (const slot of GEAR_SLOTS) expect(hero4.gear[slot]!.enhancementLevel).toBe(0);
  });

  it("Test 6: Top 3 gear all Lv 100 -> Enhancement XP remains unused", () => {
    const top3 = [makeHero("h1", [100, 100, 100, 100]), makeHero("h2", [100, 100, 100, 100]), makeHero("h3", [100, 100, 100, 100])];
    const plan = optimizeGearEnhancement(top3, 5_000_000, "priority-pieces");
    expect(plan.steps.length).toBe(0);
    expect(plan.xpUsed).toBe(0);
    expect(plan.xpRemaining).toBe(5_000_000);
  });

  it("never exceeds GEAR_MAX_LEVEL and skips empty slots", () => {
    const top3 = [makeHero("h1", [99, 99, 99, 99]), makeHero("h2", [99, 99, 99, 99]), makeHero("h3", [99, 99, 99, 99])];
    top3[0].gear.boots = null; // hero doesn't have all 4 pieces
    const plan = optimizeGearEnhancement(top3, 1_000_000, "priority-pieces");
    for (const step of plan.steps) {
      expect(step.toLevel).toBeLessThanOrEqual(GEAR_MAX_LEVEL);
      if (step.heroId === "h1") expect(step.slot).not.toBe("boots");
    }
  });
});
