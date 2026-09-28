import { describe, it, expect } from "vitest";
import { optimizeHeroLeveling } from "../lib/optimizer/heroXp";
import { heroXpCost, HERO_MAX_LEVEL } from "../lib/data/heroXpTable";
import { Hero, emptyHeroGear } from "../lib/types";

function makeHero(id: string, level: number): Hero {
  return {
    id,
    name: id,
    generation: 1,
    troopType: "Infantry",
    rarity: "Mythic",
    level,
    stars: 1,
    power: 1000,
    roleTags: [],
    gear: emptyHeroGear(),
    sourceConfidence: 1,
  };
}

describe("optimizeHeroLeveling", () => {
  it("Test 1: five heroes Lv1, enough XP to level equally -> balanced output", () => {
    const heroes = [makeHero("h1", 1), makeHero("h2", 1), makeHero("h3", 1), makeHero("h4", 1), makeHero("h5", 1)];
    const budget = heroXpCost(1, 10) * 5;
    const plan = optimizeHeroLeveling(heroes, budget, "balanced");
    const finalLevels = heroes.map((h) => plan.steps.find((s) => s.heroId === h.id)?.toLevel ?? h.level);
    expect(new Set(finalLevels).size).toBe(1);
    expect(finalLevels[0]).toBeGreaterThanOrEqual(10);
  });

  it("Test 2: five heroes at different levels -> lowest caught up first", () => {
    const heroes = [makeHero("h1", 50), makeHero("h2", 10), makeHero("h3", 30), makeHero("h4", 20), makeHero("h5", 40)];
    const budget = heroXpCost(10, 12) + 10;
    const plan = optimizeHeroLeveling(heroes, budget, "balanced");
    const h2Step = plan.steps.find((s) => s.heroId === "h2");
    const othersLeveled = plan.steps.filter((s) => s.heroId !== "h2");
    expect(h2Step).toBeDefined();
    expect(h2Step!.toLevel).toBeGreaterThan(10);
    expect(othersLeveled.length).toBe(0);
  });

  it("Test 3: all Top 5 at Lv 80 -> Hero EXP remains unused", () => {
    const heroes = [makeHero("h1", 80), makeHero("h2", 80), makeHero("h3", 80), makeHero("h4", 80), makeHero("h5", 80)];
    const plan = optimizeHeroLeveling(heroes, 10_000_000, "balanced");
    expect(plan.steps.length).toBe(0);
    expect(plan.xpUsed).toBe(0);
    expect(plan.xpRemaining).toBe(10_000_000);
  });

  it("never levels a 6th hero and never exceeds level 80", () => {
    const heroes = [makeHero("h1", 1), makeHero("h2", 1), makeHero("h3", 1), makeHero("h4", 1), makeHero("h5", 1)];
    const plan = optimizeHeroLeveling(heroes, 100_000_000, "balanced");
    for (const s of plan.steps) {
      expect(heroes.some((h) => h.id === s.heroId)).toBe(true);
      expect(s.toLevel).toBeLessThanOrEqual(HERO_MAX_LEVEL);
    }
  });

  it("priority mode levels Hero #1 first", () => {
    const heroes = [makeHero("h1", 1), makeHero("h2", 1), makeHero("h3", 1), makeHero("h4", 1), makeHero("h5", 1)];
    const budget = heroXpCost(1, 20);
    const plan = optimizeHeroLeveling(heroes, budget, "priority");
    const h1 = plan.steps.find((s) => s.heroId === "h1");
    const others = plan.steps.filter((s) => s.heroId !== "h1");
    expect(h1).toBeDefined();
    expect(others.length).toBe(0);
  });
});
