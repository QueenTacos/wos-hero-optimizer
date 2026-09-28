// ============================================================================
// Hero Gear Enhancement XP Table
// Each entry is the enhancement XP REQUIRED TO REACH that level.
// Level 0 = 0 (unenhanced, no cost).
// ============================================================================

export const GEAR_MAX_LEVEL = 100;

export const GEAR_ENHANCEMENT_XP: Record<number, number> = {
  1: 10, 2: 15, 3: 20, 4: 25, 5: 30, 6: 35, 7: 40, 8: 45, 9: 50, 10: 55,
  11: 60, 12: 65, 13: 70, 14: 75, 15: 80, 16: 85, 17: 90, 18: 95, 19: 100, 20: 105,
  21: 110, 22: 115, 23: 120, 24: 125, 25: 130, 26: 135, 27: 140, 28: 145, 29: 150, 30: 160,
  31: 170, 32: 180, 33: 190, 34: 200, 35: 210, 36: 220, 37: 230, 38: 240, 39: 250, 40: 270,
  41: 290, 42: 310, 43: 330, 44: 350, 45: 370, 46: 390, 47: 410, 48: 430, 49: 450, 50: 470,
  51: 490, 52: 510, 53: 530, 54: 550, 55: 570, 56: 590, 57: 610, 58: 630, 59: 650, 60: 680,
  61: 710, 62: 740, 63: 770, 64: 800, 65: 830, 66: 860, 67: 890, 68: 920, 69: 950, 70: 990,
  71: 1030, 72: 1070, 73: 1110, 74: 1150, 75: 1190, 76: 1230, 77: 1270, 78: 1310, 79: 1350, 80: 1400,
  81: 1450, 82: 1500, 83: 1550, 84: 1600, 85: 1650, 86: 1700, 87: 1750, 88: 1800, 89: 1850, 90: 1900,
  91: 1950, 92: 2000, 93: 2050, 94: 2100, 95: 2150, 96: 2200, 97: 2250, 98: 2300, 99: 2350, 100: 2400,
};

/** XP required to go from `level` to `level + 1`. Returns 0 if already at/above max. */
export function xpToNextGearLevel(level: number): number {
  if (level >= GEAR_MAX_LEVEL) return 0;
  const nextLevel = level + 1;
  const cost = GEAR_ENHANCEMENT_XP[nextLevel];
  if (cost === undefined) {
    throw new Error(`No gear XP table entry for level ${nextLevel}`);
  }
  return cost;
}

/** Total XP required to go from `fromLevel` (exclusive) to `toLevel` (inclusive). */
export function gearXpCost(fromLevel: number, toLevel: number): number {
  if (toLevel <= fromLevel) return 0;
  let total = 0;
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    const cost = GEAR_ENHANCEMENT_XP[lvl];
    if (cost === undefined) {
      throw new Error(`No gear XP table entry for level ${lvl}`);
    }
    total += cost;
  }
  return total;
}
