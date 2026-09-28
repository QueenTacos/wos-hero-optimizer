import { describe, it, expect } from "vitest";
import { redistributeGear, applyGearAssignments } from "../lib/optimizer/gearAssignment";
import { optimizeGearEnhancement } from "../lib/optimizer/gearEnhancement";
import { Hero, emptyHeroGear, emptyUnassignedGearInventory, GEAR_SLOTS } from "../lib/types";

function makeHero(id: string): Hero {
  return {
    id,
    name: id,
    generation: 1,
    troopType: "Infantry",
    rarity: "Mythic",
    level: 50,
    stars: 3,
    power: 1000,
    roleTags: [],
    gear: emptyHeroGear(),
    sourceConfidence: 1,
  };
}

describe("Test D: hero gear state persists correctly", () => {
  it("stores goggles/gloves/boots and leaves belt null", () => {
    const h = makeHero("h1");
    h.gear.goggles = { slot: "goggles", rarity: "rare", enhancementLevel: 0 };
    h.gear.gloves = { slot: "gloves", rarity: "epic", enhancementLevel: 0 };
    h.gear.boots = { slot: "boots", rarity: "mythic", enhancementLevel: 0 };
    expect(h.gear.goggles?.rarity).toBe("rare");
    expect(h.gear.gloves?.rarity).toBe("epic");
    expect(h.gear.belt).toBeNull();
    expect(h.gear.boots?.rarity).toBe("mythic");
  });
});

describe("Test E: unassigned Mythic Goggles upgrades Hero #1's Rare Goggles", () => {
  it("assigns Mythic to Hero #1 and returns the Rare goggles to inventory", () => {
    const h1 = makeHero("h1");
    h1.gear.goggles = { slot: "goggles", rarity: "rare", enhancementLevel: 0 };
    const heroes = [h1];
    const pool = emptyUnassignedGearInventory();
    pool.goggles.mythic = 1;

    const plan = redistributeGear(heroes, pool, ["h1"]);

    const goggleAssignment = plan.assignments.find((a) => a.heroId === "h1" && a.slot === "goggles");
    expect(goggleAssignment).toBeDefined();
    expect(goggleAssignment!.newRarity).toBe("mythic");
    expect(goggleAssignment!.previousRarity).toBe("rare");
    expect(plan.replacedGearReturnedToInventory.some((r) => r.slot === "goggles" && r.rarity === "rare")).toBe(true);
    expect(plan.finalUnassignedGear.goggles.mythic).toBe(0);
    expect(plan.finalUnassignedGear.goggles.rare).toBe(1);
  });
});

describe("Test F: Top-5 hero can reclaim better gear from a non-Top-5 hero", () => {
  it("moves Hero #6's Epic Boots to Hero #1 and frees Hero #1's old Rare Boots for reassignment", () => {
    const h1 = makeHero("h1"); // Top 5
    h1.gear.boots = { slot: "boots", rarity: "rare", enhancementLevel: 12 };
    const h6 = makeHero("h6"); // NOT Top 5
    h6.gear.boots = { slot: "boots", rarity: "epic", enhancementLevel: 40 };

    const heroes = [h1, h6];
    const pool = emptyUnassignedGearInventory(); // no boots in inventory at all

    const plan = redistributeGear(heroes, pool, ["h1"]);

    const toH1 = plan.assignments.find((a) => a.heroId === "h1" && a.slot === "boots");
    expect(toH1).toBeDefined();
    expect(toH1!.newRarity).toBe("epic");
    expect(toH1!.source).toBe("reclaimed-from-hero");
    expect(toH1!.reclaimedFromHeroId).toBe("h6");
    // The enhancement level travels with the physical item when reclaimed hero-to-hero.
    expect(toH1!.newEnhancementLevel).toBe(40);

    // Hero #1's displaced Rare boots must be available again (either still in the
    // pool, or reassigned back down to Hero #6 in the same pass).
    const returned = plan.replacedGearReturnedToInventory.some((r) => r.slot === "boots" && r.rarity === "rare");
    const reassignedToH6 = plan.assignments.find((a) => a.heroId === "h6" && a.slot === "boots" && a.newRarity === "rare");
    expect(returned || Boolean(reassignedToH6)).toBe(true);

    const finalHeroes = applyGearAssignments(heroes, plan);
    expect(finalHeroes.find((h) => h.id === "h1")!.gear.boots!.rarity).toBe("epic");
  });

  it("never deletes or duplicates gear: total physical piece count is conserved", () => {
    const h1 = makeHero("h1");
    h1.gear.boots = { slot: "boots", rarity: "rare", enhancementLevel: 0 };
    const h6 = makeHero("h6");
    h6.gear.boots = { slot: "boots", rarity: "epic", enhancementLevel: 0 };
    const pool = emptyUnassignedGearInventory();
    pool.boots.common = 2;

    const plan = redistributeGear([h1, h6], pool, ["h1"]);
    const finalHeroes = applyGearAssignments([h1, h6], plan);

    const equippedCount = finalHeroes.filter((h) => h.gear.boots !== null).length;
    const poolCount = Object.values(plan.finalUnassignedGear.boots).reduce((a, b) => a + b, 0);
    // Started with: 2 equipped boots + 2 in pool = 4 total. Must still be 4.
    expect(equippedCount + poolCount).toBe(4);
  });
});

describe("Test G: Enhancement Components still apply only to Top 3 after gear reassignment", () => {
  it("hero #4 gains gear via redistribution but is excluded from the enhancement optimizer", () => {
    const top3 = [makeHero("h1"), makeHero("h2"), makeHero("h3")];
    const hero4 = makeHero("h4");
    for (const h of [...top3, hero4]) {
      for (const slot of GEAR_SLOTS) h.gear[slot] = { slot, rarity: "epic", enhancementLevel: 0 };
    }
    const allHeroes = [...top3, hero4];
    const pool = emptyUnassignedGearInventory();
    pool.goggles.mythic = 1; // enough to upgrade hero4 too, in principle

    const plan = redistributeGear(allHeroes, pool, ["h1", "h2", "h3", "h4"]);
    // hero4 might receive gear (all heroes may receive gear)...
    const heroesAfterGear = applyGearAssignments(allHeroes, plan);
    const top3AfterGear = top3.map((h) => heroesAfterGear.find((x) => x.id === h.id)!);

    // ...but only top3 heroes are ever passed to the enhancement optimizer.
    const enhancementPlan = optimizeGearEnhancement(top3AfterGear, 1_000_000, "priority-pieces");
    const touchedHeroIds = new Set(enhancementPlan.steps.map((s) => s.heroId));
    expect(touchedHeroIds.has("h4")).toBe(false);
  });
});
