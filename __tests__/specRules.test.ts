// Spec rules from WOS_Hero_Optimizer_Complete_Breakdown.md §2, §11, §24 that
// were not yet covered by the original Phase 1 tests.
import { describe, it, expect } from "vitest";
import { runOptimization } from "../lib/optimizer/runOptimization";
import { rankHeroes } from "../lib/optimizer/ranking";
import { redistributeGear, applyGearAssignments } from "../lib/optimizer/gearAssignment";
import { Hero, GearRarity, GEAR_SLOTS, emptyHeroGear, emptyInventory, emptyUnassignedGearInventory } from "../lib/types";

function hero(id: string, level = 50, rarity: GearRarity | null = "rare", enh = 0): Hero {
  const gear = emptyHeroGear();
  if (rarity) for (const slot of GEAR_SLOTS) gear[slot] = { slot, rarity, enhancementLevel: enh };
  return {
    id, name: id, generation: 1, troopType: "Infantry", rarity: "Mythic", level, stars: 3, power: 0,
    roleTags: [], gear, sourceConfidence: 1,
  };
}

const six = () => ["h1", "h2", "h3", "h4", "h5", "h6"].map((id) => hero(id));
const TOP5 = ["h1", "h2", "h3", "h4", "h5"];

describe("Manual Top 3 must be a subset of Top 5", () => {
  it("drops a Hero #6 from manual Top 3 and warns", () => {
    const r = rankHeroes(six(), { manualTop5Ids: TOP5, manualTop3Ids: ["h1", "h2", "h6"] });
    expect(r.top3.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(r.warnings.join(" ")).toMatch(/must come from the Top 5.*h6/);
  });

  it("Hero #6 gets no Enhancement Components even if named in manual Top 3", () => {
    const inv = { ...emptyInventory(), enhancementComponents: { xp10: 0, xp100: 100_000 } };
    const res = runOptimization(six(), inv, { manualTop5Ids: TOP5, manualTop3Ids: ["h6", "h1", "h2"] });
    expect(res.gearEnhancementPlan.steps.some((s) => s.heroId === "h6")).toBe(false);
    expect(new Set(res.gearEnhancementPlan.steps.map((s) => s.heroId))).toEqual(new Set(["h1", "h2"]));
  });

  it("allows a manual Top 3 in a custom order within the Top 5", () => {
    const r = rankHeroes(six(), { manualTop5Ids: TOP5, manualTop3Ids: ["h5", "h4", "h1"] });
    expect(r.top3.map((h) => h.id)).toEqual(["h5", "h4", "h1"]);
  });
});

describe("Manual Top 5 with fewer than 5 heroes", () => {
  it("uses the heroes given (previously silently ignored unless exactly 5)", () => {
    const heroes = six().slice(0, 4);
    const r = rankHeroes(heroes, { manualTop5Ids: ["h4", "h3", "h2", "h1"] });
    expect(r.top5.map((h) => h.id)).toEqual(["h4", "h3", "h2", "h1"]);
  });

  it("never exceeds 5 even if more are passed", () => {
    const r = rankHeroes(six(), { manualTop5Ids: ["h1", "h2", "h3", "h4", "h5", "h6"] });
    expect(r.top5).toHaveLength(5);
    expect(r.top5.map((h) => h.id)).not.toContain("h6");
  });
});

describe("Gear redistribution across several slots of one hero", () => {
  it("upgrades all 4 slots of Hero #1 and neither loses nor duplicates any piece", () => {
    const heroes = [hero("h1", 50, "common"), hero("h6", 50, "epic")];
    const pool = emptyUnassignedGearInventory();
    pool.goggles.mythic = 1;
    pool.belt.mythic = 1;
    const plan = redistributeGear(heroes, pool, ["h1"]);
    const after = applyGearAssignments(heroes, plan);
    const h1 = after.find((h) => h.id === "h1")!;
    expect(h1.gear.goggles?.rarity).toBe("mythic");
    expect(h1.gear.belt?.rarity).toBe("mythic");
    expect(h1.gear.gloves?.rarity).toBe("epic"); // reclaimed from h6
    expect(h1.gear.boots?.rarity).toBe("epic");

    // Conservation: count every piece before and after, per slot + rarity.
    const count = (hs: Hero[], inv: typeof pool) => {
      const c: Record<string, number> = {};
      for (const h of hs) for (const s of GEAR_SLOTS) if (h.gear[s]) c[`${s}:${h.gear[s]!.rarity}`] = (c[`${s}:${h.gear[s]!.rarity}`] ?? 0) + 1;
      for (const s of GEAR_SLOTS) for (const [r, n] of Object.entries(inv[s])) if (n) c[`${s}:${r}`] = (c[`${s}:${r}`] ?? 0) + n;
      return c;
    };
    expect(count(after, plan.finalUnassignedGear)).toEqual(count(heroes, pool));
  });

  it("preserves enhancement level when gear moves hero-to-hero", () => {
    const heroes = [hero("h1", 50, null), hero("h6", 50, "epic", 37)];
    const plan = redistributeGear(heroes, emptyUnassignedGearInventory(), ["h1"]);
    const h1 = applyGearAssignments(heroes, plan).find((h) => h.id === "h1")!;
    expect(h1.gear.goggles).toEqual({ slot: "goggles", rarity: "epic", enhancementLevel: 37 });
  });
});

describe("Existing enhancement levels are respected", () => {
  it("enhances Top 3 gear from its current level, not from 0", () => {
    const heroes = [hero("h1", 50, "epic", 20), hero("h2", 50, "epic", 20), hero("h3", 50, "epic", 20)];
    // 12 pieces x (21->25 = 110+115+120+125+130 = 600) = 7,200 XP
    const inv = { ...emptyInventory(), enhancementComponents: { xp10: 0, xp100: 72 } };
    const res = runOptimization(heroes, inv, { manualTop5Ids: ["h1", "h2", "h3"] });
    // Every piece starts from its real level (+20), never from +0. With the priority strategy
    // the XP goes to the first priority piece (h1 goggles) before anything else.
    const steps = res.gearEnhancementPlan.steps;
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.fromLevel === 20)).toBe(true);
    expect(steps[0]).toMatchObject({ heroId: "h1", slot: "goggles", phase: "priority" });
    expect(res.resourcesUsed.enhancementXp).toBeLessThanOrEqual(7_200);
  });
});

describe("Result warnings (spec §24)", () => {
  it("explains leftover Hero EXP when all Top 5 are Level 80", () => {
    const heroes = TOP5.map((id) => hero(id, 80));
    const inv = { ...emptyInventory(), heroExp: { mode: "total" as const, manualTotal: 1_000_000, items: { exp1k: 0, exp5k: 0, exp10k: 0, exp50k: 0 } } };
    const res = runOptimization(heroes, inv);
    expect(res.resourcesRemaining.heroExp).toBe(1_000_000);
    expect(res.resourcesAvailable.heroExp).toBe(1_000_000);
    expect(res.warnings.join(" ")).toMatch(/all Top 5 heroes are Level 80/);
  });

  it("explains leftover components when all Top 3 gear is Level 100", () => {
    const heroes = ["h1", "h2", "h3"].map((id) => hero(id, 50, "mythic", 100));
    const inv = { ...emptyInventory(), enhancementComponents: { xp10: 5, xp100: 5 } };
    const res = runOptimization(heroes, inv);
    expect(res.resourcesRemaining.enhancementXp).toBe(550);
    expect(res.warnings.join(" ")).toMatch(/All Top 3 gear is at the Level 100 cap/);
  });

  it("flags Hero #4 with strong gear that is not eligible for components", () => {
    const heroes = six();
    heroes[3] = hero("h4", 50, "mythic");
    const res = runOptimization(heroes, emptyInventory(), { manualTop5Ids: TOP5 });
    expect(res.warnings.join(" ")).toMatch(/Hero #4 \(h4\) has strong gear but Enhancement Components are reserved for the Top 3/);
  });
});

import { toStarValue, fromStarValue, shardsToMaxStars } from "../lib/data/shardTable";
describe("Stars + tiers (spec §12: 6 tiers per star)", () => {
  it("round-trips stars and tiers", () => {
    expect(fromStarValue(toStarValue(2, 1))).toEqual({ stars: 2, tier: 1 });
    expect(fromStarValue(2.16)).toEqual({ stars: 2, tier: 1 }); // the "2.16" typed in the old prototype
    expect(toStarValue(5, 3)).toBe(5);
    expect(fromStarValue(3.5)).toEqual({ stars: 3, tier: 3 });
  });
  it("0 stars to full 5 stars costs 1,065 shards", () => {
    expect(shardsToMaxStars(1, 0)).toBe(1065);
  });
});

import { mergeRosterEntries } from "../lib/screenshot/rosterMerge";
describe("merging confirmed roster scan results", () => {
  const mk = () => ({ rowId: Math.random().toString(36).slice(2), heroDefId: "", level: 1, stars: 0, gear: "keep" });
  it("updates existing heroes, fills empty rows, appends the rest, drops duplicates", () => {
    const rows = [{ ...mk(), heroDefId: "molly", level: 30, gear: "mollys-gear" }, mk()];
    const res = mergeRosterEntries(
      rows,
      [
        { heroDefId: "mia", level: 5, stars: 4.5, powerRank: 1 },
        { heroDefId: "molly", level: 40, stars: 5, powerRank: 3 },
        { heroDefId: "flint", level: 2, stars: 1, powerRank: 2 },
        { heroDefId: "mia", level: 9, stars: 1, powerRank: 7 },
      ],
      mk
    );
    expect(res.rows.map((r) => r.heroDefId)).toEqual(["molly", "mia", "flint"]);
    expect(res.rows[0]).toMatchObject({ level: 40, stars: 5, gear: "mollys-gear" }); // gear untouched
    expect(res.rows[1]).toMatchObject({ level: 5, stars: 4.5 }); // first (highest-Power) Mia wins
    expect([res.added, res.updated, res.duplicatesIgnored]).toEqual([2, 1, 1]);
    expect(rows[0].level).toBe(30); // input not mutated
  });
});

import { mergeRosterScans, ScanCardRef } from "../lib/screenshot/rosterScanMerge";
describe("roster merge rules (synthetic detections)", () => {
  const det = (heroId: string, o: Partial<DetectedScreenshotHero2> = {}): DetectedScreenshotHero2 => ({
    candidateHeroId: heroId, candidateName: heroId, confidence: 0.95, troopTypeDetected: "Infantry", generationDetected: 1,
    levelDetected: 10, levelConfidence: 0.9, starsDetected: 3, starTierDetected: 2, starsConfidence: 0.9,
    powerRankDetected: 1, boundingBox: { x: 0, y: 0, width: 1, height: 1 }, troopIconDetected: "Infantry", troopIconConfidence: 0.9, ...o,
  });
  type DetectedScreenshotHero2 = import("../lib/types").DetectedScreenshotHero;
  const shot = (i: number, ds: DetectedScreenshotHero2[]): ScanCardRef[] => ds.map((d, k) => ({ key: `${i}:${k}`, shotIndex: i, cardIndex: k, det: d }));

  it("uncertain match with conflicting stars is NOT merged — flagged as possible duplicate", () => {
    const r = mergeRosterScans([shot(0, [det("a"), det("b")]), shot(1, [det("b", { confidence: 0.5, starsDetected: 4 }), det("c")])]);
    expect(r.entries.map((e) => e.heroId)).toEqual(["a", "b", "b", "c"]);
    expect(r.entries[2].possibleDuplicateOfKey).toBe("0:1");
    expect(r.duplicatesMerged).toBe(0);
  });

  it("confident match with conflicting readings IS merged but flagged for review", () => {
    const r = mergeRosterScans([shot(0, [det("a"), det("b")]), shot(1, [det("b", { levelDetected: 11 }), det("c")])]);
    expect(r.entries.map((e) => e.heroId)).toEqual(["a", "b", "c"]);
    expect(r.entries[1].mergeNotes.join(" ")).toMatch(/level 10 vs 11/);
  });

  it("two cards in the SAME screenshot matched to one hero are never merged", () => {
    const r = mergeRosterScans([shot(0, [det("a"), det("a")])]);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[1].possibleDuplicateOfKey).toBe("0:0");
  });

  it("a user's hero correction is used for de-duplication", () => {
    const shots = [shot(0, [det("a"), det("x")]), shot(1, [det("b"), det("c")])];
    shots[0][1].heroOverride = "b"; // user said card 0:1 is really b
    const r = mergeRosterScans(shots);
    expect(r.entries.map((e) => e.heroId)).toEqual(["a", "b", "c"]);
  });

  it("full card beats cut-off card as the kept reading", () => {
    const r = mergeRosterScans([shot(0, [det("a", { partial: true, starsDetected: null, levelDetected: null })]), shot(1, [det("a")])]);
    expect(r.entries[0].primary.key).toBe("1:0");
  });
});
