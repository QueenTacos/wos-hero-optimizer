import { GearRarity } from "../types";

// Order matters: index = rank (higher index = better).
// Legendary is the progression state after Mythic +100 / Mastery 10 + ascension.
export const GEAR_RARITY_ORDER: GearRarity[] = ["common", "uncommon", "rare", "epic", "mythic", "legendary"];

export function gearRarityRank(rarity: GearRarity | null): number {
  if (rarity === null) return -1; // "no gear" always loses to any real gear
  return GEAR_RARITY_ORDER.indexOf(rarity);
}

/** Returns true if `a` is a strictly better rarity than `b` (null = no gear). */
export function isBetterRarity(a: GearRarity | null, b: GearRarity | null): boolean {
  return gearRarityRank(a) > gearRarityRank(b);
}

export const GEAR_RARITY_LABELS: Record<GearRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  mythic: "Mythic",
  legendary: "Legendary",
};
