import { Inventory, HeroExpInventory, HeroGearInventory, GearSlot } from "../types";

// ----------------------------------------------------------------------------
// Hero EXP — text parser for Mode A ("Total EXP")
// Supports raw numbers, "k"/"K" (x1,000), and "m"/"M" (x1,000,000).
// Examples: "750k" -> 750000, "3.6m" -> 3600000, "70500000" -> 70500000
// ----------------------------------------------------------------------------
export function parseExpInput(raw: string): number {
  if (raw === null || raw === undefined) return 0;
  const trimmed = raw.trim().toLowerCase().replace(/,/g, "");
  if (trimmed === "") return 0;

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(k|m)?$/);
  if (!match) {
    const fallback = Number(trimmed);
    return Number.isFinite(fallback) ? Math.max(0, Math.round(fallback)) : 0;
  }

  const numericPart = parseFloat(match[1]);
  const suffix = match[2];
  let multiplier = 1;
  if (suffix === "k") multiplier = 1_000;
  else if (suffix === "m") multiplier = 1_000_000;

  return Math.max(0, Math.round(numericPart * multiplier));
}

// ----------------------------------------------------------------------------
// Hero EXP — Mode B ("EXP Items")
// ----------------------------------------------------------------------------
export const HERO_EXP_ITEM_VALUES = {
  exp1k: 1_000,
  exp5k: 5_000,
  exp10k: 10_000,
  exp50k: 50_000,
} as const;

export function totalHeroExpFromItems(items: HeroExpInventory["items"]): number {
  return (
    HERO_EXP_ITEM_VALUES.exp1k * items.exp1k +
    HERO_EXP_ITEM_VALUES.exp5k * items.exp5k +
    HERO_EXP_ITEM_VALUES.exp10k * items.exp10k +
    HERO_EXP_ITEM_VALUES.exp50k * items.exp50k
  );
}

/**
 * Returns the correct Hero EXP total based on the active input mode.
 * The two modes are mutually exclusive — they are NEVER added together.
 */
export function getAvailableHeroExp(inventory: Pick<Inventory, "heroExp">): number {
  const { heroExp } = inventory;
  if (heroExp.mode === "total") {
    return Math.max(0, heroExp.manualTotal);
  }
  return totalHeroExpFromItems(heroExp.items);
}

// ----------------------------------------------------------------------------
// Enhancement Components
// ----------------------------------------------------------------------------
export function totalEnhancementComponentXp(components: Pick<Inventory, "enhancementComponents">["enhancementComponents"]): number {
  return 10 * components.xp10 + 100 * components.xp100;
}

/** All Enhancement XP: components + sacrificed gear XP (kept as separate inputs). */
export function getAvailableEnhancementXp(inventory: Pick<Inventory, "enhancementComponents" | "sacrificedGearXp">): number {
  return totalEnhancementComponentXp(inventory.enhancementComponents) + Math.max(0, inventory.sacrificedGearXp ?? 0);
}

/** Spare Mythic Hero Gear = unassigned Mythic pieces across all slots (usable as ascension / threshold material). */
export function spareMythicGearCount(unassigned: Inventory["unassignedGear"]): number {
  return (Object.values(unassigned) as Record<string, number>[]).reduce((s, bySlot) => s + (bySlot.mythic ?? 0), 0);
}

/** Spare Mythic Gear per slot (the Mythic column of the Extra / Unassigned grid). */
export function spareMythicGearBySlot(unassigned: Inventory["unassignedGear"]): Record<GearSlot, number> {
  return {
    goggles: unassigned.goggles.mythic ?? 0,
    gloves: unassigned.gloves.mythic ?? 0,
    belt: unassigned.belt.mythic ?? 0,
    boots: unassigned.boots.mythic ?? 0,
  };
}

/** The separate Hero Gear resource pools (spec §12). */
export function heroGearInventory(inventory: Inventory): HeroGearInventory {
  return {
    enhancementXp: getAvailableEnhancementXp(inventory),
    essenceStones: inventory.essenceStones ?? 0,
    mithril: inventory.mithril ?? 0,
    spareMythicGear: spareMythicGearCount(inventory.unassignedGear),
  };
}

export { emptyInventory } from "../types";
