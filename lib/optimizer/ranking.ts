import { Hero, RankingWeights, GEAR_SLOTS } from "../types";
import { gearRarityRank, GEAR_RARITY_ORDER } from "../data/gearRarity";
import { masteryIndex, MASTERY_FORGING_TABLE } from "../data/masteryForgingTable";
import { masteryOf } from "../types";

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  generation: 0.2,
  troopTypeBalance: 0.05,
  stars: 0.15,
  level: 0.1,
  gearQuality: 0.15,
  gearEnhancement: 0.1,
  combatUsefulness: 0.15,
  bearTrapUsefulness: 0.05,
  externalTierList: 0.05,
};

export interface HeroScoreBreakdown {
  heroId: string;
  total: number;
  components: Record<keyof RankingWeights, number>;
}

/**
 * Produces a normalized (0-1) score per ranking dimension for a hero relative
 * to the rest of the candidate pool, then combines them with `weights`.
 *
 * This is intentionally NOT "raw power sorted" — generation, stars, level,
 * gear, and role usefulness all factor in per the ranking philosophy.
 */
export function scoreHeroes(
  heroes: Hero[],
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
  externalTierListScores?: Record<string, number> // heroId -> 0-1 score
): HeroScoreBreakdown[] {
  if (heroes.length === 0) return [];

  const maxGeneration = Math.max(1, ...heroes.map((h) => h.generation));
  const maxLevel = Math.max(1, ...heroes.map((h) => h.level));
  const maxStars = 5;

  const troopTypeCounts: Record<string, number> = {};
  for (const h of heroes) {
    troopTypeCounts[h.troopType] = (troopTypeCounts[h.troopType] ?? 0) + 1;
  }

  return heroes.map((hero) => {
    const generationScore = hero.generation / maxGeneration;
    const starsScore = hero.stars / maxStars;
    const levelScore = hero.level / maxLevel;

    const equippedPieces = GEAR_SLOTS.map((slot) => hero.gear[slot]).filter(
      (p): p is NonNullable<typeof p> => p !== null
    );
    // Progression WITHIN each piece's quality: enhancement (0-100) and Mastery, never
    // compared across qualities — quality itself is scored separately below.
    const maxMastery = MASTERY_FORGING_TABLE.length;
    const gearEnhancementScore =
      equippedPieces.length > 0
        ? equippedPieces.reduce((sum, p) => {
            const m = masteryOf(p);
            return sum + 0.5 * (p.enhancementLevel / 100) + 0.5 * ((masteryIndex(m.level, m.stage) + 1) / maxMastery);
          }, 0) / equippedPieces.length
        : 0;
    // Quality rank runs 0 (common) … 5 (legendary); normalize against the best possible.
    const maxQuality = GEAR_RARITY_ORDER.length - 1;
    const gearQualityScore =
      equippedPieces.length > 0
        ? equippedPieces.reduce((sum, p) => sum + gearRarityRank(p.rarity), 0) / (equippedPieces.length * maxQuality)
        : 0;

    // A hero of an under-represented troop type in the current pool gets a
    // small bonus, so Top 5 doesn't accidentally end up all one troop type.
    const troopTypeBalanceScore =
      1 - (troopTypeCounts[hero.troopType] ?? 1) / heroes.length;

    const combatUsefulnessScore = hero.roleTags.some((t) => t === "PvP" || t === "PvE")
      ? 1
      : 0.4;
    const bearTrapUsefulnessScore = hero.roleTags.some(
      (t) => t === "BearTrap" || t === "RallySupport" || t === "RallyCaptain"
    )
      ? 1
      : 0.3;
    const externalTierListScore = externalTierListScores?.[hero.id] ?? 0.5;

    const components: Record<keyof RankingWeights, number> = {
      generation: generationScore,
      troopTypeBalance: troopTypeBalanceScore,
      stars: starsScore,
      level: levelScore,
      gearQuality: gearQualityScore,
      gearEnhancement: gearEnhancementScore,
      combatUsefulness: combatUsefulnessScore,
      bearTrapUsefulness: bearTrapUsefulnessScore,
      externalTierList: externalTierListScore,
    };

    const total = (Object.keys(components) as (keyof RankingWeights)[]).reduce(
      (sum, key) => sum + components[key] * weights[key],
      0
    );

    return { heroId: hero.id, total, components };
  });
}

export interface RankedHeroes {
  ranked: Hero[]; // full pool, best first
  top5: Hero[];
  top3: Hero[];
  scoreByHeroId: Record<string, HeroScoreBreakdown>;
  /** Plain-language notes about manual overrides that were adjusted or ignored. */
  warnings: string[];
}

export function rankHeroes(
  heroes: Hero[],
  options?: {
    weights?: RankingWeights;
    externalTierListScores?: Record<string, number>;
    manualTop5Ids?: string[]; // exact 5 hero ids, in priority order
    manualTop3Ids?: string[]; // exact 3 hero ids, in priority order (must be subset of resulting top5)
  }
): RankedHeroes {
  const scores = scoreHeroes(heroes, options?.weights, options?.externalTierListScores);
  const scoreByHeroId: Record<string, HeroScoreBreakdown> = {};
  for (const s of scores) scoreByHeroId[s.heroId] = s;

  const byScoreDesc = [...heroes].sort(
    (a, b) => (scoreByHeroId[b.id]?.total ?? 0) - (scoreByHeroId[a.id]?.total ?? 0)
  );

  const warnings: string[] = [];
  const resolve = (ids: string[]) =>
    [...new Set(ids)].map((id) => heroes.find((h) => h.id === id)).filter((h): h is Hero => Boolean(h));

  // Manual Top 5: up to 5 heroes, in the order given. Never more than 5.
  let top5: Hero[];
  if (options?.manualTop5Ids && options.manualTop5Ids.length > 0) {
    const picked = resolve(options.manualTop5Ids);
    if (picked.length > 5) warnings.push("Manual Top 5 had more than 5 heroes — only the first 5 are used.");
    top5 = picked.slice(0, 5);
    if (top5.length === 0) top5 = byScoreDesc.slice(0, 5);
  } else {
    top5 = byScoreDesc.slice(0, 5);
  }

  // Manual Top 3: MUST be a subset of the Top 5 (spec §2 "Top 3: subset of Top 5").
  // Any hero outside the Top 5 is dropped so Enhancement Components can never
  // reach Hero #6+.
  let top3: Hero[];
  if (options?.manualTop3Ids && options.manualTop3Ids.length > 0) {
    const top5Ids = new Set(top5.map((h) => h.id));
    const requested = resolve(options.manualTop3Ids);
    const outside = requested.filter((h) => !top5Ids.has(h.id));
    if (outside.length > 0) {
      warnings.push(
        `Manual Top 3 must come from the Top 5 — ignored ${outside.map((h) => h.name).join(", ")}.`
      );
    }
    top3 = requested.filter((h) => top5Ids.has(h.id)).slice(0, 3);
    if (top3.length === 0) top3 = top5.slice(0, 3);
  } else {
    // Default: best 3 of the Top 5, preserving Top 5 priority order
    top3 = top5.slice(0, 3);
  }

  return { ranked: byScoreDesc, top5, top3, scoreByHeroId, warnings };
}
