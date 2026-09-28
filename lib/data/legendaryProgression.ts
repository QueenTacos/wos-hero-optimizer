// ============================================================================
// Mythic → Legendary ascension and Legendary progression data.
//
// A Legendary piece is a CONTINUATION past Mythic +100 / Mastery 10 — its
// enhancement counter runs +0 … +100 again on its own cost table. Legendary
// enhancement numbers must never be compared with Mythic ones.
//
// Within Legendary, Enhancement XP only moves a piece between thresholds.
// Reaching +1, +20, +40, +60, +80 and +100 is a material step (Mithril +
// Mythic gear, and a Mastery requirement), not an XP step.
//
// Sources:
//   "user" — project update prompt: ascension (+100, Mastery 10, 2 Mythic),
//            +19 → +20 (Mastery 11, 10 Mithril, 3 Mythic),
//            +39 → +40 (Mastery 12, 20 Mithril, 5 Mythic).
//   "wiki" — https://www.whiteoutsurvival.wiki/hero-gears/hero-gear/ "Gear
//            Empowerment" table (fetched 2026-09-28): XP per level and the
//            material rows at 60/80/100. The wiki shows materials as icons;
//            they are read here to match the user's +20 / +40 rows.
//   null   — not known yet. Never guessed; the planner reports it instead.
// ============================================================================

export const ASCENSION = {
  requiredQuality: "mythic" as const,
  requiredEnhancement: 100,
  requiredMastery: { level: 10, stage: 0 },
  mythicGearCost: 2,
  source: "user+wiki" as const,
};

export interface LegendaryThreshold {
  /** Enhancement level the piece sits at before this step (XP can't take it further). */
  currentEnhancementCap: number;
  /** Mastery level needed to pass. null = unknown. */
  requiredMasteryLevel: number | null;
  /** null = unknown. */
  mithrilCost: number | null;
  /** Spare Mythic Hero Gear consumed. null = unknown. */
  mythicGearCost: number | null;
  resultingEnhancementLevel: number;
  source: "user" | "wiki" | "unknown";
  note?: string;
}

export const LEGENDARY_THRESHOLDS: LegendaryThreshold[] = [
  {
    currentEnhancementCap: 0,
    requiredMasteryLevel: null,
    mithrilCost: null,
    mythicGearCost: null,
    resultingEnhancementLevel: 1,
    source: "unknown",
    note: "The wiki lists Legendary +1 as a material step (2 of an unlabelled item), not an XP step. Needs confirmation from the game.",
  },
  { currentEnhancementCap: 19, requiredMasteryLevel: 11, mithrilCost: 10, mythicGearCost: 3, resultingEnhancementLevel: 20, source: "user" },
  { currentEnhancementCap: 39, requiredMasteryLevel: 12, mithrilCost: 20, mythicGearCost: 5, resultingEnhancementLevel: 40, source: "user" },
  { currentEnhancementCap: 59, requiredMasteryLevel: null, mithrilCost: 30, mythicGearCost: 5, resultingEnhancementLevel: 60, source: "wiki", note: "Mastery requirement not listed on the wiki." },
  { currentEnhancementCap: 79, requiredMasteryLevel: null, mithrilCost: 40, mythicGearCost: 10, resultingEnhancementLevel: 80, source: "wiki", note: "Mastery requirement not listed on the wiki." },
  { currentEnhancementCap: 99, requiredMasteryLevel: null, mithrilCost: 50, mythicGearCost: 10, resultingEnhancementLevel: 100, source: "wiki", note: "Mastery requirement not listed on the wiki." },
];

export const LEGENDARY_MAX_ENHANCEMENT = 100;

/**
 * Enhancement XP to go from level-1 to `level` for Legendary gear (wiki "Gear
 * Empowerment" table). Threshold levels (1, 20, 40, 60, 80, 100) are absent:
 * they cost materials, not XP.
 */
export const LEGENDARY_XP_TO_LEVEL: Readonly<Record<number, number>> = (() => {
  const t: Record<number, number> = {};
  for (let l = 2; l <= 19; l++) t[l] = 2500 + (l - 2) * 50; // 2,500 … 3,350
  for (let l = 21; l <= 39; l++) t[l] = 3450 + (l - 21) * 50; // 3,450 … 4,350
  for (let l = 41; l <= 59; l++) t[l] = 4450 + (l - 41) * 50; // 4,450 … 5,350
  for (let l = 61; l <= 79; l++) t[l] = 5500 + (l - 61) * 100; // 5,500 … 7,300
  for (let l = 81; l <= 99; l++) t[l] = 7500 + (l - 81) * 100; // 7,500 … 9,300
  return Object.freeze(t);
})();

/** The threshold blocking a Legendary piece at `enhancement`, if it is sitting exactly on one. */
export function legendaryThresholdAt(enhancement: number): LegendaryThreshold | undefined {
  return LEGENDARY_THRESHOLDS.find((t) => t.currentEnhancementCap === enhancement);
}

/** Highest level Enhancement XP alone can reach from `enhancement` (the next threshold cap). */
export function legendaryXpCap(enhancement: number): number {
  const next = LEGENDARY_THRESHOLDS.find((t) => t.currentEnhancementCap >= enhancement);
  return next ? next.currentEnhancementCap : LEGENDARY_MAX_ENHANCEMENT;
}

/** XP for one Legendary level, or null if that level is a material threshold (or out of range). */
export function legendaryXpToNext(enhancement: number): number | null {
  return LEGENDARY_XP_TO_LEVEL[enhancement + 1] ?? null;
}

/** XP from `from` to `to` within one threshold band; null if the range crosses a threshold. */
export function legendaryXpCost(from: number, to: number): number | null {
  let sum = 0;
  for (let l = from + 1; l <= to; l++) {
    const c = LEGENDARY_XP_TO_LEVEL[l];
    if (c === undefined) return null;
    sum += c;
  }
  return sum;
}
