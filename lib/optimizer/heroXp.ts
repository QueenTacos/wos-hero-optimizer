import { Hero, HeroLevelPlan, HeroLevelStep, LevelingMode } from "../types";
import { HERO_MAX_LEVEL, xpToNextHeroLevel, heroXpCost } from "../data/heroXpTable";

/**
 * Levels the given Top 5 heroes using the available XP budget.
 *
 * IMPORTANT: `top5` must already be exactly the Top 5 heroes, in rank order
 * (index 0 = Hero #1 ... index 4 = Hero #5). This function NEVER touches any
 * hero outside this array — Hero EXP never goes to Hero #6+.
 *
 * balanced (default):
 *   Repeatedly find the current minimum level among the Top 5, and level up
 *   every hero tied at that minimum (in rank order) one level at a time, for
 *   as long as the budget allows. This maximizes the lowest level in the
 *   group. If the budget cannot afford the next level for the (cheapest,
 *   tied-minimum) hero, leveling stops entirely — a smaller partial spend on
 *   a higher-level hero would not be "balanced".
 *
 * priority:
 *   Hero #1 is leveled to 80 (or until budget runs out) before Hero #2 is
 *   touched, and so on down the rank order.
 */
export function optimizeHeroLeveling(
  top5: Hero[],
  xpBudget: number,
  mode: LevelingMode = "balanced"
): HeroLevelPlan {
  if (top5.length === 0) {
    return { steps: [], xpUsed: 0, xpRemaining: xpBudget };
  }

  const levels = top5.map((h) => h.level);
  const startLevels = [...levels];
  let remaining = xpBudget;

  if (mode === "priority") {
    for (let i = 0; i < levels.length; i++) {
      while (levels[i] < HERO_MAX_LEVEL) {
        const cost = xpToNextHeroLevel(levels[i]);
        if (cost > remaining) break;
        remaining -= cost;
        levels[i] += 1;
      }
    }
  } else {
    // balanced
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const activeIdx = levels
        .map((lvl, idx) => ({ lvl, idx }))
        .filter(({ lvl }) => lvl < HERO_MAX_LEVEL);

      if (activeIdx.length === 0) break;

      const minLevel = Math.min(...activeIdx.map((a) => a.lvl));
      const nextLevelCost = xpToNextHeroLevel(minLevel);

      // If we can't afford the cheapest possible upgrade (the minimum-level
      // hero's next level), no further balanced progress is possible.
      if (nextLevelCost > remaining) break;

      const tied = activeIdx.filter((a) => a.lvl === minLevel);
      let progressedThisRound = false;
      for (const { idx } of tied) {
        const cost = xpToNextHeroLevel(levels[idx]);
        if (cost <= remaining) {
          remaining -= cost;
          levels[idx] += 1;
          progressedThisRound = true;
        }
      }
      if (!progressedThisRound) break; // safety guard against infinite loop
    }
  }

  const steps: HeroLevelStep[] = top5
    .map((hero, idx) => {
      const fromLevel = startLevels[idx];
      const toLevel = levels[idx];
      if (toLevel === fromLevel) return null;
      return {
        heroId: hero.id,
        heroName: hero.name,
        fromLevel,
        toLevel,
        xpSpent: heroXpCost(fromLevel, toLevel),
      };
    })
    .filter((s): s is HeroLevelStep => s !== null);

  const xpUsed = xpBudget - remaining;

  return { steps, xpUsed, xpRemaining: remaining };
}
