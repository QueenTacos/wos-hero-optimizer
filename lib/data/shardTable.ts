// ============================================================================
// Hero Star / Shard Table
// Each star level has 6 tiers. Values below are shards required for each tier.
// ============================================================================

export interface StarTierCost {
  star: number; // 1-5
  tiers: number[]; // 6 entries
  total: number;
}

export const STAR_TABLE: StarTierCost[] = [
  { star: 1, tiers: [1, 1, 2, 2, 2, 2], total: 10 },
  { star: 2, tiers: [5, 5, 5, 5, 5, 15], total: 40 },
  { star: 3, tiers: [15, 15, 15, 15, 15, 40], total: 115 },
  { star: 4, tiers: [40, 40, 40, 40, 40, 100], total: 300 },
  { star: 5, tiers: [100, 100, 100, 100, 100, 100], total: 600 },
];

export const TOTAL_SHARDS_0_TO_5_STARS = 1065;

/** Shards required to go from (star, tier) to full 5 stars. */
export function shardsToMaxStars(currentStar: number, currentTier: number): number {
  let total = 0;
  for (const entry of STAR_TABLE) {
    if (entry.star < currentStar) continue;
    for (let t = 0; t < entry.tiers.length; t++) {
      // Skip tiers already completed
      if (entry.star === currentStar && t < currentTier) continue;
      total += entry.tiers[t];
    }
  }
  return total;
}

// ----------------------------------------------------------------------------
// Star display helpers. `Hero.stars` stays a single number for the optimizer
// (e.g. 2 stars + 1 of 6 tiers = 2.1667), but the UI edits stars and tier
// separately so values always land exactly on a real tier.
// ----------------------------------------------------------------------------
export const TIERS_PER_STAR = 6;

/** 2 stars + tier 1 -> 2.1667. Tier is ignored at 5 stars (nothing left to fill). */
export function toStarValue(stars: number, tier: number): number {
  const s = Math.max(0, Math.min(5, Math.floor(stars)));
  const t = s >= 5 ? 0 : Math.max(0, Math.min(TIERS_PER_STAR - 1, Math.floor(tier)));
  return s + t / TIERS_PER_STAR;
}

/** 2.1667 -> { stars: 2, tier: 1 }. Rounds to the nearest real tier. */
export function fromStarValue(value: number): { stars: number; tier: number } {
  const v = Math.max(0, Math.min(5, value));
  const totalTiers = Math.round(v * TIERS_PER_STAR);
  const stars = Math.min(5, Math.floor(totalTiers / TIERS_PER_STAR));
  return { stars, tier: stars >= 5 ? 0 : totalTiers % TIERS_PER_STAR };
}
