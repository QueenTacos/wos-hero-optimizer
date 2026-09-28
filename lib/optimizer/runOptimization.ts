import { Hero, Inventory, OptimizationResult, LevelingMode, EnhancementMode } from "../types";
import { rankHeroes } from "./ranking";
import { RankingWeights } from "../types";
import { optimizeHeroLeveling } from "./heroXp";
import { optimizeGearEnhancement, priorityPieceKeys } from "./gearEnhancement";
import { planGearProgression } from "./gearProgressionPlan";
import { redistributeGear, applyGearAssignments } from "./gearAssignment";
import { getAvailableHeroExp, getAvailableEnhancementXp, spareMythicGearCount } from "../utils/inventory";
import { HERO_MAX_LEVEL } from "../data/heroXpTable";
import { GEAR_MAX_LEVEL } from "../data/gearXpTable";
import { GEAR_SLOTS } from "../types";
import { gearRarityRank } from "../data/gearRarity";

export interface RunOptimizationOptions {
  weights?: RankingWeights;
  externalTierListScores?: Record<string, number>;
  manualTop5Ids?: string[];
  manualTop3Ids?: string[];
  levelingMode?: LevelingMode;
  enhancementMode?: EnhancementMode;
}

export function runOptimization(
  allHeroes: Hero[],
  inventory: Inventory,
  options: RunOptimizationOptions = {}
): OptimizationResult {
  const warnings: string[] = [];

  const { top5, top3, warnings: rankingWarnings } = rankHeroes(allHeroes, {
    weights: options.weights,
    externalTierListScores: options.externalTierListScores,
    manualTop5Ids: options.manualTop5Ids,
    manualTop3Ids: options.manualTop3Ids,
  });

  warnings.push(...rankingWarnings);
  if (top5.length < 5) warnings.push(`Only ${top5.length} hero(es) available — Top 5 is incomplete.`);
  if (top3.length < 3) warnings.push(`Only ${top3.length} hero(es) available for gear enhancement — Top 3 is incomplete.`);

  // 1 & 2: Hero EXP -> Top 5 only. Respects the active EXP input mode (total vs items) —
  // the two modes are never summed together.
  const heroExpBudget = getAvailableHeroExp(inventory);
  const heroLevelPlan = optimizeHeroLeveling(top5, heroExpBudget, options.levelingMode ?? "balanced");

  // 3: Gear distribution — Top 5 get first pick (including reclaiming from lower heroes),
  // everyone else gets what's left.
  const gearAssignmentPlan = redistributeGear(
    allHeroes,
    inventory.unassignedGear,
    top5.map((h) => h.id)
  );
  warnings.push(...gearAssignmentPlan.warnings);

  // Apply the recommended gear plan before running enhancement, so Top 3 enhancement acts
  // on their post-redistribution gear.
  const heroesAfterGear = applyGearAssignments(allHeroes, gearAssignmentPlan);
  const top3AfterGear = top3.map((h) => heroesAfterGear.find((x) => x.id === h.id) ?? h);

  // 4 & 5: Enhancement XP (components + sacrificed gear XP) -> Top 3 only.
  const enhancementBudget = getAvailableEnhancementXp(inventory);
  const gearEnhancementPlan = optimizeGearEnhancement(
    top3AfterGear,
    enhancementBudget,
    options.enhancementMode ?? "priority-pieces"
  );
  warnings.push(...(gearEnhancementPlan.notes ?? []));

  // 6: Mastery / Legendary milestones for the Top 3 — separate pools (Essence Stones,
  // Mithril, spare Mythic gear). Planned on the gear AFTER this round's Enhancement XP.
  const top3AfterEnhancement = top3AfterGear.map((h) => {
    const gear = { ...h.gear };
    for (const st of gearEnhancementPlan.steps.filter((x) => x.heroId === h.id)) {
      const p = gear[st.slot];
      if (p) gear[st.slot] = { ...p, enhancementLevel: st.toLevel };
    }
    return { ...h, gear };
  });
  // Spare Mythic gear = Mythic pieces still unassigned AFTER redistribution (never double-counted).
  const spareMythicGear = spareMythicGearCount(gearAssignmentPlan.finalUnassignedGear);
  const progressionPlan = planGearProgression(top3AfterEnhancement, priorityPieceKeys(top3AfterGear).keys, {
    essenceStones: Math.max(0, inventory.essenceStones ?? 0),
    mithril: Math.max(0, inventory.mithril ?? 0),
    spareMythicGear,
  });

  // ---- Plain-language notes (spec §24). Eligibility never changes because a cap was hit. ----
  if (heroLevelPlan.xpRemaining > 0 && top5.length > 0) {
    if (top5.every((h) => (heroLevelPlan.steps.find((s) => s.heroId === h.id)?.toLevel ?? h.level) >= HERO_MAX_LEVEL)) {
      warnings.push(
        `Hero EXP remains (${heroLevelPlan.xpRemaining.toLocaleString()}) because all Top 5 heroes are Level ${HERO_MAX_LEVEL}. It is not given to Hero #6 or below.`
      );
    } else {
      warnings.push(
        `${heroLevelPlan.xpRemaining.toLocaleString()} Hero EXP is left over — not enough for the next level of the lowest Top 5 hero.`
      );
    }
  }

  const top3Pieces = top3AfterGear.flatMap((h) => GEAR_SLOTS.map((slot) => h.gear[slot]).filter(Boolean));
  if (gearEnhancementPlan.xpRemaining > 0 && top3.length > 0) {
    const finalLevels = top3AfterGear.flatMap((h) =>
      GEAR_SLOTS.filter((slot) => h.gear[slot]).map(
        (slot) => gearEnhancementPlan.steps.find((s) => s.heroId === h.id && s.slot === slot)?.toLevel ?? h.gear[slot]!.enhancementLevel
      )
    );
    if (top3Pieces.length === 0) {
      warnings.push("The Top 3 have no gear equipped, so no Enhancement Components can be used. Remaining components are unused.");
    } else if (finalLevels.every((l) => l >= GEAR_MAX_LEVEL)) {
      warnings.push(`All Top 3 gear is at the Level ${GEAR_MAX_LEVEL} cap. Remaining components are unused.`);
    } else if ((gearEnhancementPlan.pieces ?? []).every((p) => p.status === "complete" || p.status === "blocked")) {
      warnings.push(
        "All Top 3 gear has gone as far as Enhancement XP can take it (Mythic +100, or a Legendary threshold that needs Mastery, Mithril and Mythic gear). Remaining components are unused."
      );
    } else {
      warnings.push(
        `${gearEnhancementPlan.xpRemaining.toLocaleString()} Enhancement XP is left over — not enough for the next level of the lowest Top 3 gear piece.`
      );
    }
  }
  const emptyTop3Slots = top3AfterGear.flatMap((h) => GEAR_SLOTS.filter((slot) => !h.gear[slot]).map((slot) => `${h.name} ${slot}`));
  if (emptyTop3Slots.length > 0) {
    warnings.push(`Empty Top 3 gear slots can't be enhanced: ${emptyTop3Slots.join(", ")}.`);
  }

  const top3Ids = new Set(top3.map((h) => h.id));
  for (const h of heroesAfterGear) {
    if (top3Ids.has(h.id)) continue;
    const strong = GEAR_SLOTS.some((slot) => gearRarityRank(h.gear[slot]?.rarity ?? null) >= gearRarityRank("epic"));
    // (Quality check only — any Epic/Mythic/Legendary piece counts as "strong" for this reminder.)
    if (strong) {
      const rank = top5.findIndex((t) => t.id === h.id);
      const label = rank >= 0 ? `Hero #${rank + 1} (${h.name})` : h.name;
      warnings.push(`${label} has strong gear but Enhancement Components are reserved for the Top 3.`);
    }
  }

  return {
    selectedTop5: top5,
    selectedTop3: top3,
    heroLevelPlan,
    gearAssignmentPlan,
    gearEnhancementPlan,
    resourcesUsed: {
      heroExp: heroLevelPlan.xpUsed,
      enhancementXp: gearEnhancementPlan.xpUsed,
    },
    resourcesRemaining: {
      heroExp: heroLevelPlan.xpRemaining,
      enhancementXp: gearEnhancementPlan.xpRemaining,
    },
    resourcesAvailable: {
      heroExp: heroExpBudget,
      enhancementXp: enhancementBudget,
    },
    heroesAfterGear,
    progressionPlan,
    warnings,
  };
}
