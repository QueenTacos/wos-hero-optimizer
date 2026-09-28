import {
  Hero,
  GearSlot,
  GearRarity,
  GEAR_SLOTS,
  UnassignedGearInventory,
  GearAssignmentPlan,
  GearAssignmentEntry,
  ReturnedGear,
  EquippedGearPiece,
} from "../types";
import { isBetterRarity } from "../data/gearRarity";
import { compareGear, isBetterGear } from "./gearProgression";

function cloneUnassigned(inv: UnassignedGearInventory): UnassignedGearInventory {
  const out = {} as UnassignedGearInventory;
  for (const slot of GEAR_SLOTS) {
    out[slot] = { ...inv[slot] };
  }
  return out;
}

/** Best (highest-rank) rarity in the pool for a slot with qty > 0, or null if none available. */
function bestInPool(pool: UnassignedGearInventory, slot: GearSlot): GearRarity | null {
  let best: GearRarity | null = null;
  for (const rarity of Object.keys(pool[slot]) as GearRarity[]) {
    if (pool[slot][rarity] > 0 && isBetterRarity(rarity, best)) best = rarity;
  }
  return best;
}

/**
 * Redistributes gear across heroes using: equipped gear (already on heroes)
 * + unassigned inventory. Never deletes or duplicates a physical gear item —
 * every piece is either "on a hero" or "in the unassigned pool" at all times.
 *
 * Priority:
 *   1. Top 5 heroes (in rank order) get first access to the best available
 *      compatible gear for each of their 4 slots. This pool includes BOTH
 *      the unassigned inventory AND gear currently equipped on heroes
 *      outside the Top 5 (their gear can be "reclaimed" if it's better than
 *      what the Top 5 hero currently has).
 *   2. Any hero who loses gear to a Top 5 hero has that slot cleared; it may
 *      be refilled in step 3 from whatever remains in the pool.
 *   3. All other heroes (in the order given) then get the best REMAINING
 *      unassigned gear for their empty/upgradeable slots (this pass does not
 *      steal from other non-Top-5 heroes, to avoid churn below the Top 5).
 *
 * Pieces are compared by progression (quality, then Mastery, then
 * enhancement within that quality — see gearProgression.ts), so a Legendary
 * +19 is never displaced by a Mythic +100. Unassigned pool items are counts
 * only and are treated as +0 / Mastery 0 of their quality. When gear moves hero-to-hero directly, its existing
 * enhancementLevel travels with it. When gear comes out of (or goes back
 * into) the unassigned pool, only counts are tracked — a returned piece's
 * enhancement level is not preserved by the simple inventory model, since
 * the pool only tracks quantity per slot/rarity, not individual items.
 */
export function redistributeGear(
  allHeroes: Hero[],
  unassignedGear: UnassignedGearInventory,
  top5Ids: string[]
): GearAssignmentPlan {
  const pool = cloneUnassigned(unassignedGear);
  const assignments: GearAssignmentEntry[] = [];
  const replacedGearReturnedToInventory: ReturnedGear[] = [];
  const warnings: string[] = [];

  const heroGearById = new Map<string, Hero["gear"]>();
  for (const h of allHeroes) heroGearById.set(h.id, { ...h.gear });

  const top5 = top5Ids.map((id) => allHeroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
  const nonTop5 = allHeroes.filter((h) => !top5Ids.includes(h.id));

  function returnToPool(slot: GearSlot, rarity: GearRarity, fromHeroId: string) {
    pool[slot][rarity] += 1;
    replacedGearReturnedToInventory.push({ slot, rarity, fromHeroId });
  }

  // ---- Pass 1: Top 5 heroes, best available (pool OR reclaimed from non-Top-5) ----
  for (const hero of top5) {
    for (const slot of GEAR_SLOTS) {
      // Re-read every slot: earlier slots for this hero may already have changed.
      const gear = heroGearById.get(hero.id)!;
      const current = gear[slot];
      const currentRarity = current?.rarity ?? null;

      const poolBest = bestInPool(pool, slot);

      let stealCandidate: { hero: Hero; piece: EquippedGearPiece } | null = null;
      for (const other of nonTop5) {
        const otherGear = heroGearById.get(other.id)!;
        const piece = otherGear[slot];
        if (!piece) continue;
        if (!stealCandidate || isBetterGear(piece, stealCandidate.piece)) {
          stealCandidate = { hero: other, piece };
        }
      }

      const poolPiece: EquippedGearPiece | null = poolBest ? { slot, rarity: poolBest, enhancementLevel: 0 } : null;
      const bestOther = compareGear(poolPiece, stealCandidate?.piece) >= 0 ? poolPiece : stealCandidate?.piece ?? null;
      if (!bestOther || !isBetterGear(bestOther, current)) continue;

      let newPiece: EquippedGearPiece;
      let source: GearAssignmentEntry["source"];
      let reclaimedFromHeroId: string | undefined;

      if (bestOther === poolPiece) {
        newPiece = { slot, rarity: poolBest as GearRarity, enhancementLevel: 0 };
        pool[slot][poolBest as GearRarity] -= 1;
        source = "inventory";
      } else {
        newPiece = { ...stealCandidate!.piece };
        const otherGear = heroGearById.get(stealCandidate!.hero.id)!;
        heroGearById.set(stealCandidate!.hero.id, { ...otherGear, [slot]: null });
        source = "reclaimed-from-hero";
        reclaimedFromHeroId = stealCandidate!.hero.id;
      }

      if (current) returnToPool(slot, current.rarity, hero.id);

      heroGearById.set(hero.id, { ...gear, [slot]: newPiece });
      assignments.push({
        heroId: hero.id,
        heroName: hero.name,
        slot,
        newRarity: newPiece.rarity,
        newEnhancementLevel: newPiece.enhancementLevel,
        previousRarity: currentRarity,
        source,
        reclaimedFromHeroId,
      });
    }
  }

  // ---- Pass 2: everyone else, fill/upgrade from whatever remains in the pool only ----
  const outsideTop5Recipients = new Set<string>();
  for (const hero of nonTop5) {
    for (const slot of GEAR_SLOTS) {
      const gear = heroGearById.get(hero.id)!;
      const current = gear[slot];
      const currentRarity = current?.rarity ?? null;
      const poolBest = bestInPool(pool, slot);
      if (poolBest === null || !isBetterGear({ rarity: poolBest, enhancementLevel: 0 }, current)) continue;

      pool[slot][poolBest] -= 1;
      if (current) returnToPool(slot, current.rarity, hero.id);

      const newPiece: EquippedGearPiece = { slot, rarity: poolBest, enhancementLevel: 0 };
      heroGearById.set(hero.id, { ...gear, [slot]: newPiece });
      assignments.push({
        heroId: hero.id,
        heroName: hero.name,
        slot,
        newRarity: poolBest,
        newEnhancementLevel: 0,
        previousRarity: currentRarity,
        source: "inventory",
      });
      outsideTop5Recipients.add(hero.name);
    }
  }
  for (const name of outsideTop5Recipients) {
    warnings.push(`${name} received leftover gear. It is outside the Top 5, so its gear stays at its current enhancement (no Enhancement Components).`);
  }

  return { assignments, replacedGearReturnedToInventory, finalUnassignedGear: pool, warnings };
}

/** Applies a GearAssignmentPlan's `assignments` onto fresh Hero objects (does not mutate input heroes). */
export function applyGearAssignments(allHeroes: Hero[], plan: GearAssignmentPlan): Hero[] {
  const gearByHero = new Map<string, Hero["gear"]>();
  for (const h of allHeroes) gearByHero.set(h.id, { ...h.gear });

  for (const a of plan.assignments) {
    if (a.source === "reclaimed-from-hero" && a.reclaimedFromHeroId) {
      const sourceGear = gearByHero.get(a.reclaimedFromHeroId);
      if (sourceGear) gearByHero.set(a.reclaimedFromHeroId, { ...sourceGear, [a.slot]: null });
    }
    const gear = gearByHero.get(a.heroId);
    if (!gear) continue;
    const moved = a.source === "reclaimed-from-hero" && a.reclaimedFromHeroId
      ? allHeroes.find((h) => h.id === a.reclaimedFromHeroId)?.gear[a.slot]
      : undefined;
    gearByHero.set(a.heroId, {
      ...gear,
      // A piece moved hero-to-hero keeps its Mastery and other progression; a pool item starts fresh.
      [a.slot]: moved ? { ...moved, rarity: a.newRarity, enhancementLevel: a.newEnhancementLevel, priority: undefined } : { slot: a.slot, rarity: a.newRarity, enhancementLevel: a.newEnhancementLevel },
    });
  }

  return allHeroes.map((h) => ({ ...h, gear: gearByHero.get(h.id) ?? h.gear }));
}
