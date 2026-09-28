// ============================================================================
// Hero Gear Mastery Forging — costs ESSENCE STONES (plus Mythic gear from
// Level 11). Separate from Enhancement XP and from Legendary progression.
//
// Each row is ONE forging step: the cost to reach (level, stage) from the
// previous row, and the total Gear Stats bonus once reached.
// Levels 1-3 have a single step each (stage 0); from Level 4 each level has
// stages 0-4.
//
// Sources:
//   "user" — rows supplied in the project update prompt (Lv 1 … Lv 11 stage 1)
//   "wiki" — https://www.whiteoutsurvival.wiki/hero-gears/hero-gear/ (fetched
//            2026-09-28). The wiki shows materials as icons; its Mythic column
//            is read as Mythic Hero Gear. Please confirm against the game.
// ============================================================================

export interface MasteryStep {
  level: number;
  stage: number;
  essenceStoneCost: number;
  /** Mythic Hero Gear consumed by this step. */
  mythicGearCost: number;
  /** Total Gear Stats bonus at this step, in percent. */
  statsUpPercent: number;
  source: "user" | "wiki";
}

type Row = [level: number, stage: number, essence: number, mythic: number, statsUp: number];

const USER_ROWS: Row[] = [
  [1, 0, 10, 0, 10], [2, 0, 20, 0, 20], [3, 0, 30, 0, 30],
  [4, 0, 40, 0, 40], [4, 1, 10, 0, 42], [4, 2, 10, 0, 44], [4, 3, 10, 0, 46], [4, 4, 10, 0, 48],
  [5, 0, 10, 0, 50], [5, 1, 12, 0, 52], [5, 2, 12, 0, 54], [5, 3, 12, 0, 56], [5, 4, 12, 0, 58],
  [6, 0, 12, 0, 60], [6, 1, 14, 0, 62], [6, 2, 14, 0, 64], [6, 3, 14, 0, 66], [6, 4, 14, 0, 68],
  [7, 0, 14, 0, 70], [7, 1, 16, 0, 72], [7, 2, 16, 0, 74], [7, 3, 16, 0, 76], [7, 4, 16, 0, 78],
  [8, 0, 16, 0, 80], [8, 1, 18, 0, 82], [8, 2, 18, 0, 84], [8, 3, 18, 0, 86], [8, 4, 18, 0, 88],
  [9, 0, 18, 0, 90], [9, 1, 20, 0, 92], [9, 2, 20, 0, 94], [9, 3, 20, 0, 96], [9, 4, 20, 0, 98],
  [10, 0, 20, 0, 100], [10, 1, 22, 0, 102], [10, 2, 22, 0, 104], [10, 3, 22, 0, 106], [10, 4, 22, 0, 108],
  // Prompt: "22 Essence Stones + additional Mythic gear requirement" — count (1) from the wiki.
  [11, 0, 22, 1, 110],
  [11, 1, 24, 0, 112],
];

const WIKI_ROWS: Row[] = [
  [11, 2, 24, 1, 114], [11, 3, 24, 1, 116], [11, 4, 24, 0, 118],
  [12, 0, 24, 1, 120], [12, 1, 26, 0, 122], [12, 2, 26, 1, 124], [12, 3, 26, 0, 126], [12, 4, 26, 1, 128],
  [13, 0, 26, 1, 130], [13, 1, 28, 0, 132], [13, 2, 28, 1, 134], [13, 3, 28, 1, 136], [13, 4, 28, 1, 138],
  [14, 0, 28, 1, 140], [14, 1, 30, 1, 142], [14, 2, 30, 1, 144], [14, 3, 30, 1, 146], [14, 4, 30, 1, 148],
  [15, 0, 30, 1, 150], [15, 1, 32, 1, 152], [15, 2, 32, 1, 154], [15, 3, 32, 1, 156], [15, 4, 32, 1, 158],
  [16, 0, 32, 2, 160], [16, 1, 34, 1, 162], [16, 2, 34, 1, 164], [16, 3, 34, 2, 166], [16, 4, 34, 1, 168],
  [17, 0, 34, 2, 170], [17, 1, 36, 1, 172], [17, 2, 36, 2, 174], [17, 3, 36, 1, 176], [17, 4, 36, 2, 178],
  [18, 0, 36, 2, 180], [18, 1, 38, 1, 182], [18, 2, 38, 2, 184], [18, 3, 38, 2, 186], [18, 4, 38, 2, 188],
  [19, 0, 38, 2, 190], [19, 1, 40, 2, 192], [19, 2, 40, 2, 194], [19, 3, 40, 2, 196], [19, 4, 40, 2, 198],
  [20, 0, 40, 2, 200],
];

export const MASTERY_FORGING_TABLE: MasteryStep[] = [
  ...USER_ROWS.map(([level, stage, e, m, s]) => ({ level, stage, essenceStoneCost: e, mythicGearCost: m, statsUpPercent: s, source: "user" as const })),
  ...WIKI_ROWS.map(([level, stage, e, m, s]) => ({ level, stage, essenceStoneCost: e, mythicGearCost: m, statsUpPercent: s, source: "wiki" as const })),
];

export const MASTERY_MAX = { level: 20, stage: 0 };

/** Position of (level, stage) in the table; -1 = not forged (Level 0). */
export function masteryIndex(level: number, stage = 0): number {
  if (level <= 0) return -1;
  // Levels 1-3 only have stage 0; clamp stray stages there.
  const s = level <= 3 ? 0 : stage;
  const i = MASTERY_FORGING_TABLE.findIndex((r) => r.level === level && r.stage === s);
  if (i >= 0) return i;
  // Beyond the table: treat as the last known row.
  return level > MASTERY_MAX.level ? MASTERY_FORGING_TABLE.length - 1 : -1;
}

export function compareMastery(a: { level: number; stage: number }, b: { level: number; stage: number }): number {
  return masteryIndex(a.level, a.stage) - masteryIndex(b.level, b.stage);
}

export function masteryStatsPercent(level: number, stage = 0): number {
  const i = masteryIndex(level, stage);
  return i < 0 ? 0 : MASTERY_FORGING_TABLE[i].statsUpPercent;
}

export interface MasteryCost {
  essenceStones: number;
  mythicGear: number;
  steps: MasteryStep[];
  /** true if any step came from the wiki rather than the user's data. */
  usesWikiData: boolean;
}

/** Essence Stones + Mythic gear to forge from `from` up to and including `to`. Null if `to` is beyond the table. */
export function masteryCost(from: { level: number; stage: number }, to: { level: number; stage: number }): MasteryCost | null {
  const a = masteryIndex(from.level, from.stage);
  const b = masteryIndex(to.level, to.stage);
  if (to.level > 0 && b < 0) return null;
  const steps = b > a ? MASTERY_FORGING_TABLE.slice(a + 1, b + 1) : [];
  return {
    essenceStones: steps.reduce((s, r) => s + r.essenceStoneCost, 0),
    mythicGear: steps.reduce((s, r) => s + r.mythicGearCost, 0),
    steps,
    usesWikiData: steps.some((r) => r.source === "wiki"),
  };
}
