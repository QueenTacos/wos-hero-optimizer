// ============================================================================
// Hero Level XP Table
// Each entry is the XP REQUIRED TO REACH that level from the previous one.
// Level 1 = 0 (starting level, no cost).
// ============================================================================

export const HERO_MAX_LEVEL = 80;

export const HERO_LEVEL_XP: Record<number, number> = {
  1: 0,
  2: 480,
  3: 690,
  4: 920,
  5: 1200,
  6: 1500,
  7: 1800,
  8: 2200,
  9: 2600,
  10: 3100,
  11: 3800,
  12: 4200,
  13: 5100,
  14: 5700,
  15: 6800,
  16: 7800,
  17: 8900,
  18: 10000,
  19: 12000,
  20: 13000,
  21: 14000,
  22: 15000,
  23: 16000,
  24: 17000,
  25: 18000,
  26: 19000,
  27: 20000,
  28: 21000,
  29: 22000,
  30: 24000,
  31: 26000,
  32: 28000,
  33: 30000,
  34: 32000,
  35: 36000,
  36: 40000,
  37: 44000,
  38: 48000,
  39: 52000,
  40: 58000,
  41: 64000,
  42: 70000,
  43: 76000,
  44: 82000,
  45: 90000,
  46: 98000,
  47: 100000,
  48: 110000,
  49: 120000,
  50: 130000,
  51: 140000,
  52: 150000,
  53: 160000,
  54: 170000,
  55: 190000,
  56: 210000,
  57: 230000,
  58: 250000,
  59: 270000,
  60: 300000,
  61: 330000,
  62: 360000,
  63: 390000,
  64: 420000,
  65: 470000,
  66: 520000,
  67: 570000,
  68: 620000,
  69: 670000,
  70: 770000,
  71: 870000,
  72: 970000,
  73: 1000000,
  74: 1100000,
  75: 1300000,
  76: 1500000,
  77: 1700000,
  78: 1900000,
  79: 2100000,
  80: 2400000,
};

/** XP required to go from `level` to `level + 1`. Returns 0 if already at/above max. */
export function xpToNextHeroLevel(level: number): number {
  if (level >= HERO_MAX_LEVEL) return 0;
  const nextLevel = level + 1;
  const cost = HERO_LEVEL_XP[nextLevel];
  if (cost === undefined) {
    throw new Error(`No hero XP table entry for level ${nextLevel}`);
  }
  return cost;
}

/** Total XP required to go from `fromLevel` (exclusive) to `toLevel` (inclusive). */
export function heroXpCost(fromLevel: number, toLevel: number): number {
  if (toLevel <= fromLevel) return 0;
  let total = 0;
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    const cost = HERO_LEVEL_XP[lvl];
    if (cost === undefined) {
      throw new Error(`No hero XP table entry for level ${lvl}`);
    }
    total += cost;
  }
  return total;
}

/**
 * Given a starting level and an XP budget, returns the highest level
 * reachable (capped at HERO_MAX_LEVEL) and the XP spent getting there.
 */
export function levelUpWithBudget(
  fromLevel: number,
  xpBudget: number
): { finalLevel: number; xpSpent: number } {
  let level = fromLevel;
  let remaining = xpBudget;
  while (level < HERO_MAX_LEVEL) {
    const cost = xpToNextHeroLevel(level);
    if (cost > remaining) break;
    remaining -= cost;
    level += 1;
  }
  return { finalLevel: level, xpSpent: xpBudget - remaining };
}
