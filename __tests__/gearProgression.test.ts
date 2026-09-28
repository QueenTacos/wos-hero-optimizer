// Tests 4-17 from the Legendary / Mastery / priority-pieces update, plus the
// real Top 3 case (Alonso, Flint, Jessie) supplied with it.
import { describe, it, expect } from "vitest";
import { Hero, EquippedGearPiece, GearSlot, GEAR_SLOTS, emptyHeroGear, emptyInventory, GearRarity } from "../lib/types";
import { canAscend, ascendToLegendary, canPassThreshold, passThreshold } from "../lib/optimizer/legendaryProgression";
import { forgeMastery } from "../lib/optimizer/masteryForging";
import { getGearProgressionRank, compareGear, isBetterGear } from "../lib/optimizer/gearProgression";
import { optimizeGearEnhancement, priorityPieceKeys } from "../lib/optimizer/gearEnhancement";
import { redistributeGear, applyGearAssignments } from "../lib/optimizer/gearAssignment";
import { runOptimization } from "../lib/optimizer/runOptimization";
import { gearXpCost } from "../lib/data/gearXpTable";
import { legendaryXpCost, LEGENDARY_XP_TO_LEVEL } from "../lib/data/legendaryProgression";
import { masteryCost, MASTERY_FORGING_TABLE } from "../lib/data/masteryForgingTable";
import { getAvailableEnhancementXp } from "../lib/utils/inventory";

const piece = (slot: GearSlot, rarity: GearRarity, enh: number, masteryLevel = 0, stage = 0): EquippedGearPiece => ({
  slot, rarity, enhancementLevel: enh, mastery: { level: masteryLevel, stage },
});

function hero(id: string, name: string, troopType: Hero["troopType"], generation: number, gear: Partial<Hero["gear"]>): Hero {
  return {
    id, name, heroDefId: id, generation, troopType, rarity: generation === 0 ? "Epic-Rare" : "Mythic", level: 80, stars: 5, power: 0,
    roleTags: [], gear: { ...emptyHeroGear(), ...gear }, sourceConfidence: 1,
  };
}

// ---- Real Top 3 from the supplied screenshots ----
// Alonso / Flint "+0" pieces: quality not given — modelled as Mythic.
const alonso = () => hero("alonso", "Alonso", "Marksman", 2, {
  goggles: piece("goggles", "mythic", 100, 10), gloves: piece("gloves", "mythic", 0), belt: piece("belt", "mythic", 0), boots: piece("boots", "mythic", 100, 10),
});
const flint = () => hero("flint", "Flint", "Infantry", 2, {
  goggles: piece("goggles", "mythic", 0), gloves: piece("gloves", "mythic", 100, 10), belt: piece("belt", "mythic", 100, 10), boots: piece("boots", "mythic", 0),
});
const jessie = () => hero("jessie", "Jessie", "Lancer", 0, {
  goggles: piece("goggles", "legendary", 19, 10), gloves: piece("gloves", "legendary", 0, 1), belt: piece("belt", "legendary", 0, 2), boots: piece("boots", "legendary", 16, 11),
});
const REAL_XP = 17_100 + 405_260; // 171 × 100 + 40,526 × 10 = 422,360

describe("data tables", () => {
  it("mastery table has the user's rows and continues from the wiki", () => {
    const at = (l: number, s: number) => MASTERY_FORGING_TABLE.find((r) => r.level === l && r.stage === s)!;
    expect(at(1, 0)).toMatchObject({ essenceStoneCost: 10, statsUpPercent: 10, source: "user" });
    expect(at(4, 0)).toMatchObject({ essenceStoneCost: 40, statsUpPercent: 40 });
    expect(at(10, 4)).toMatchObject({ essenceStoneCost: 22, statsUpPercent: 108 });
    expect(at(11, 0)).toMatchObject({ essenceStoneCost: 22, mythicGearCost: 1, statsUpPercent: 110 });
    expect(at(11, 1)).toMatchObject({ essenceStoneCost: 24, statsUpPercent: 112, source: "user" });
    expect(at(12, 0).source).toBe("wiki");
  });
  it("Mastery 10.0 → 11.0 costs 110 Essence Stones + 1 Mythic gear", () => {
    expect(masteryCost({ level: 10, stage: 0 }, { level: 11, stage: 0 })).toMatchObject({ essenceStones: 110, mythicGear: 1 });
  });
  it("Legendary XP: +16 → +19 = 3,250 + 3,300 + 3,350 = 9,900; can't cross the +19→+20 threshold with XP", () => {
    expect(legendaryXpCost(16, 19)).toBe(9_900);
    expect(legendaryXpCost(19, 20)).toBeNull();
    expect(LEGENDARY_XP_TO_LEVEL[1]).toBeUndefined();
  });
});

describe("ascension (tests 4-6, 12)", () => {
  it("TEST 4: Mythic +100 / Mastery 10 with 2 spare Mythic gear is eligible", () => {
    expect(canAscend(piece("goggles", "mythic", 100, 10), { spareMythicGear: 2 }).eligible).toBe(true);
  });
  it("TEST 5: Mythic +99 / Mastery 10 is not eligible", () => {
    const r = canAscend(piece("goggles", "mythic", 99, 10), { spareMythicGear: 5 });
    expect(r.eligible).toBe(false);
    expect(r.missing.join(" ")).toMatch(/\+100/);
  });
  it("TEST 6: Mythic +100 / Mastery 9 is not eligible", () => {
    const r = canAscend(piece("goggles", "mythic", 100, 9, 4), { spareMythicGear: 5 });
    expect(r.eligible).toBe(false);
    expect(r.missing.join(" ")).toMatch(/Mastery 10/);
  });
  it("TEST 12: ascension removes 2 Mythic gear from spare inventory; Mastery is kept", () => {
    const out = ascendToLegendary(piece("boots", "mythic", 100, 10), { spareMythicGear: 5, essenceStones: 7 });
    expect(out.resources).toEqual({ spareMythicGear: 3, essenceStones: 7 });
    expect(out.piece).toMatchObject({ rarity: "legendary", enhancementLevel: 0, mastery: { level: 10, stage: 0 } });
  });
});

describe("Legendary thresholds (tests 7, 11)", () => {
  it("TEST 7: Legendary +19 / Mastery 11 with 10 Mithril + 3 Mythic gear passes to +20", () => {
    const p = piece("goggles", "legendary", 19, 11);
    expect(canPassThreshold(p, { mithril: 10, spareMythicGear: 3 }).eligible).toBe(true);
    const out = passThreshold(p, { mithril: 12, spareMythicGear: 4 });
    expect(out.piece.enhancementLevel).toBe(20);
    expect(out.resources).toEqual({ mithril: 2, spareMythicGear: 1 });
  });
  it("Legendary +19 / Mastery 10 is NOT eligible (needs Mastery 11)", () => {
    const r = canPassThreshold(piece("goggles", "legendary", 19, 10), { mithril: 99, spareMythicGear: 99 });
    expect(r.eligible).toBe(false);
    expect(r.missing.join(" ")).toMatch(/Mastery 11/);
  });
  it("TEST 11: normal enhancement never consumes Mithril (Enhancement optimizer has no Mithril input)", () => {
    const inv = { ...emptyInventory(), mithril: 50, essenceStones: 500, enhancementComponents: { xp10: 0, xp100: 10_000 } };
    const heroes = [alonso(), flint(), jessie()];
    const res = runOptimization(heroes, inv, { manualTop5Ids: ["alonso", "flint", "jessie"] });
    expect(res.gearEnhancementPlan.xpUsed).toBeGreaterThan(0);
    expect(inv.mithril).toBe(50); // input never mutated
    // Mithril only appears in the separate milestone plan:
    expect(res.progressionPlan!.resourcesAvailable.mithril).toBe(50);
  });
});

describe("resource pools stay separate (tests 9, 10)", () => {
  it("TEST 9: Enhancement XP spending does not touch Essence Stones", () => {
    const inv = { ...emptyInventory(), essenceStones: 123, enhancementComponents: { xp10: 0, xp100: 5_000 } };
    const res = runOptimization([alonso(), flint(), jessie()], inv, { manualTop5Ids: ["alonso", "flint", "jessie"] });
    expect(res.resourcesUsed.enhancementXp).toBeGreaterThan(0);
    expect(res.progressionPlan!.resourcesAvailable.essenceStones).toBe(123);
  });
  it("TEST 10: Mastery forging does not consume Enhancement XP", () => {
    const res = { essenceStones: 200, spareMythicGear: 5, enhancementXp: 999 };
    const out = forgeMastery(piece("goggles", "legendary", 19, 10), res, { level: 11, stage: 0 });
    expect(out.complete).toBe(true);
    expect(out.resources).toEqual({ essenceStones: 90, spareMythicGear: 4, enhancementXp: 999 });
  });
  it("sacrificed gear XP adds to Enhancement XP but stays a separate input", () => {
    expect(getAvailableEnhancementXp({ enhancementComponents: { xp10: 40_526, xp100: 171 }, sacrificedGearXp: 640 })).toBe(REAL_XP + 640);
  });
});

describe("gear comparison (tests 8, 16-Jessie)", () => {
  it("TEST 8: Legendary +19 is NOT ranked below Mythic +100", () => {
    expect(isBetterGear(piece("goggles", "legendary", 19, 10), piece("goggles", "mythic", 100, 10))).toBe(true);
    expect(isBetterGear(piece("goggles", "legendary", 0, 1), piece("goggles", "mythic", 100, 10))).toBe(true);
  });
  it("within one quality, Mastery then enhancement decide", () => {
    expect(compareGear(piece("belt", "mythic", 50, 5), piece("belt", "mythic", 90, 4))).toBeGreaterThan(0);
    expect(compareGear(piece("belt", "mythic", 90, 5), piece("belt", "mythic", 50, 5))).toBeGreaterThan(0);
  });
  it("actual power decides when both are known", () => {
    const a = { ...piece("belt", "mythic", 100, 10), actualPower: 900 };
    const b = { ...piece("belt", "legendary", 0, 1), actualPower: 1000 };
    expect(compareGear(a, b)).toBeLessThan(0);
    expect(getGearProgressionRank(a)).toBeLessThan(getGearProgressionRank(b));
  });
  it("JESSIE TEST 16: redistribution never swaps her Legendary +19 Goggles for a Mythic +100", () => {
    const j = jessie();
    const benchHero = hero("h6", "Bench", "Lancer", 1, { goggles: piece("goggles", "mythic", 100, 10) });
    const pool = emptyInventory().unassignedGear;
    pool.goggles.mythic = 3;
    const plan = redistributeGear([j, benchHero], pool, ["jessie"]);
    expect(plan.assignments.filter((a) => a.heroId === "jessie")).toEqual([]);
    const after = applyGearAssignments([j, benchHero], plan).find((h) => h.id === "jessie")!;
    expect(after.gear.goggles).toMatchObject({ rarity: "legendary", enhancementLevel: 19, mastery: { level: 10, stage: 0 } });
  });
  it("a reclaimed piece keeps its Mastery when it moves to a Top 5 hero", () => {
    const top = hero("top", "Top", "Infantry", 5, { belt: piece("belt", "epic", 10) });
    const bench = hero("bench", "Bench", "Infantry", 1, { belt: piece("belt", "mythic", 60, 7, 2) });
    const plan = redistributeGear([top, bench], emptyInventory().unassignedGear, ["top"]);
    const after = applyGearAssignments([top, bench], plan).find((h) => h.id === "top")!;
    expect(after.gear.belt).toMatchObject({ rarity: "mythic", enhancementLevel: 60, mastery: { level: 7, stage: 2 } });
  });
});

describe("priority-pieces strategy (tests 13-17) — real Top 3: Alonso, Flint, Jessie", () => {
  const top3 = () => [alonso(), flint(), jessie()];

  it("automatic priority pieces match the intended 6", () => {
    const keys = [...priorityPieceKeys(top3()).keys].sort();
    expect(keys).toEqual(["alonso:boots", "alonso:goggles", "flint:belt", "flint:gloves", "jessie:boots", "jessie:goggles"].sort());
  });

  it("TEST 16: already-complete priority pieces (Alonso/Flint +100) consume nothing", () => {
    const plan = optimizeGearEnhancement(top3(), REAL_XP);
    for (const k of ["alonso:goggles", "alonso:boots", "flint:gloves", "flint:belt"]) {
      const [h, slot] = k.split(":");
      const p = plan.pieces!.find((x) => x.heroId === h && x.slot === slot)!;
      expect(p).toMatchObject({ priority: true, xpSpent: 0, status: "complete" });
    }
  });

  it("TEST 17: Jessie's Legendary +19 Goggles are NOT costed as Mythic +19 → +100", () => {
    const plan = optimizeGearEnhancement(top3(), REAL_XP);
    const g = plan.pieces!.find((p) => p.heroId === "jessie" && p.slot === "goggles")!;
    expect(g).toMatchObject({ quality: "legendary", fromLevel: 19, toLevel: 19, xpSpent: 0, status: "blocked" });
    expect(g.next).toMatch(/\+19 → \+20 needs Mastery 11, 10 Mithril, 3 Mythic gear/);
    expect(plan.steps.find((s) => s.heroId === "jessie" && s.slot === "goggles")).toBeUndefined();
  });

  it("Jessie's Legendary Boots +16 get exactly the Legendary cost to +19 (9,900 XP), then stop at the threshold", () => {
    const plan = optimizeGearEnhancement(top3(), REAL_XP);
    const b = plan.pieces!.find((p) => p.heroId === "jessie" && p.slot === "boots")!;
    expect(b).toMatchObject({ fromLevel: 16, toLevel: 19, xpSpent: 9_900, status: "blocked", priority: true });
  });

  it("TEST 15: priority pieces finish first; only then the other 6 are balanced", () => {
    const plan = optimizeGearEnhancement(top3(), REAL_XP);
    // Every priority piece reached its Enhancement-XP goal before any secondary piece was touched.
    expect(plan.pieces!.filter((p) => p.priority).every((p) => p.status === "complete" || p.status === "blocked")).toBe(true);
    expect(plan.steps.some((s) => s.phase === "secondary")).toBe(true);
    // Mythic secondaries (Alonso gloves/belt, Flint goggles/boots) are balanced within 1 level.
    const mythicSecondary = plan.pieces!.filter((p) => !p.priority && p.quality === "mythic").map((p) => p.toLevel);
    expect(mythicSecondary).toHaveLength(4);
    expect(Math.max(...mythicSecondary) - Math.min(...mythicSecondary)).toBeLessThanOrEqual(1);
    expect(Math.min(...mythicSecondary)).toBeGreaterThan(0);
    // Jessie's Legendary +0 Gloves/Belt: +0 → +1 is an unconfirmed material step — no XP guessed.
    for (const slot of ["gloves", "belt"]) {
      const p = plan.pieces!.find((x) => x.heroId === "jessie" && x.slot === slot)!;
      expect(p).toMatchObject({ xpSpent: 0, status: "blocked" });
      expect(p.next).toMatch(/material step, not Enhancement XP.*needs confirmation/);
    }
    // Every XP point accounted for.
    expect(plan.xpUsed + plan.xpRemaining).toBe(REAL_XP);
    expect(plan.steps.reduce((s, x) => s + x.xpSpent, 0)).toBe(plan.xpUsed);
  });

  it("secondary pieces get nothing while a priority piece is unfinished", () => {
    const t = top3();
    t[0].gear.goggles = piece("goggles", "mythic", 50, 10); // Alonso goggles no longer done
    const budget = gearXpCost(50, 60);
    const plan = optimizeGearEnhancement(t, budget);
    expect(plan.steps.every((s) => s.phase === "priority")).toBe(true);
    expect(plan.notes!.join(" ")).toMatch(/other 6 pieces get no Enhancement XP/);
  });

  it("TEST 13: Hero #4+ receives zero Enhancement Component spending", () => {
    const h4 = hero("gina", "Gina", "Marksman", 0, { goggles: piece("goggles", "mythic", 0) });
    const inv = { ...emptyInventory(), enhancementComponents: { xp10: 40_526, xp100: 171 } };
    const res = runOptimization([...top3(), h4], inv, { manualTop5Ids: ["alonso", "flint", "jessie", "gina"] });
    expect(res.gearEnhancementPlan.steps.some((s) => s.heroId === "gina")).toBe(false);
    expect(res.progressionPlan!.milestones.some((m) => m.heroId === "gina")).toBe(false);
  });

  it("TEST 14: Hero #6+ receives zero Hero EXP", () => {
    const extra = ["a", "b", "c"].map((id) => hero(id, id, "Infantry", 1, {}));
    const all = [...top3(), ...extra].map((h) => ({ ...h, level: 1 }));
    const inv = { ...emptyInventory(), heroExp: { mode: "total" as const, manualTotal: 143_390_000, items: { exp1k: 0, exp5k: 0, exp10k: 0, exp50k: 0 } } };
    const res = runOptimization(all, inv, { manualTop5Ids: ["alonso", "flint", "jessie", "a", "b"] });
    expect(res.heroLevelPlan.steps.some((s) => s.heroId === "c")).toBe(false);
  });

  it("milestone plan: Jessie Goggles need Mastery 11 (110 Essence + 1 Mythic) then 10 Mithril + 3 Mythic", () => {
    const inv = { ...emptyInventory(), enhancementComponents: { xp10: 40_526, xp100: 171 }, essenceStones: 0, mithril: 0 };
    const res = runOptimization(top3(), inv, { manualTop5Ids: ["alonso", "flint", "jessie"] });
    const g = res.progressionPlan!.milestones.find((m) => m.heroId === "jessie" && m.slot === "goggles")!;
    expect(g).toMatchObject({ kind: "legendary-threshold", title: "Legendary +19 → +20", cost: { essenceStones: 110, mithril: 10, mythicGear: 4 }, affordable: false });
    // Jessie Boots reach +19 this round and already have Mastery 11 → only Mithril + Mythic.
    const b = res.progressionPlan!.milestones.find((m) => m.heroId === "jessie" && m.slot === "boots")!;
    expect(b).toMatchObject({ title: "Legendary +19 → +20", cost: { essenceStones: 0, mithril: 10, mythicGear: 3 } });
    // Alonso's +100 Mastery 10 Mythic pieces are ready to ascend (2 Mythic gear each).
    const a = res.progressionPlan!.milestones.find((m) => m.heroId === "alonso" && m.slot === "goggles")!;
    expect(a).toMatchObject({ kind: "ascension", cost: { mythicGear: 2 } });
  });

  it("milestones are allocated all-or-nothing, priority pieces first, and spare Mythic gear is consumed", () => {
    const inv = { ...emptyInventory(), essenceStones: 0, mithril: 10 };
    inv.unassignedGear.belt.mythic = 5; // spare Mythic material (not needed for re-equipping here)
    const res = runOptimization(top3(), inv, { manualTop5Ids: ["alonso", "flint", "jessie"] });
    const p = res.progressionPlan!;
    expect(p.resourcesAvailable.spareMythicGear).toBe(5);
    const funded = p.milestones.filter((m) => m.affordable).map((m) => `${m.heroId}:${m.slot}`);
    expect(funded).toEqual(["alonso:goggles", "alonso:boots"]); // 2 + 2 Mythic; nothing left for a third
    expect(p.resourcesRemaining.spareMythicGear).toBe(1);
    expect(p.resourcesUsed.mithril).toBe(0);
  });
});
