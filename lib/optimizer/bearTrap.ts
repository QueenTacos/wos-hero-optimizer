import {
  Hero,
  TroopType,
  BearTrapRallyCaptainResult,
  BearTrapRallyJoinerResult,
} from "../types";
import { KNOWN_RALLY_SUPPORT_HERO_IDS } from "../data/heroDatabase";

// ----------------------------------------------------------------------------
// Rally Captain mode: uses exactly 3 heroes, all of whose stats/expedition
// skills matter (they all contribute buffs to the rally).
// ----------------------------------------------------------------------------
function rallyCaptainScore(hero: Hero): number {
  let score = hero.generation * 10 + hero.stars * 5 + hero.level * 0.1;
  if (hero.roleTags.includes("RallyCaptain")) score += 50;
  if (hero.roleTags.includes("BearTrap")) score += 30;
  if (hero.roleTags.includes("Expedition")) score += 15;
  return score;
}

export function recommendRallyCaptain(candidates: Hero[]): BearTrapRallyCaptainResult {
  const ranked = [...candidates].sort((a, b) => rallyCaptainScore(b) - rallyCaptainScore(a));
  const formation = ranked.slice(0, 3);

  const reasoning = formation.map(
    (h, i) =>
      `Slot ${i + 1}: ${h.name} (Gen ${h.generation}, ${h.stars}★, Lv ${h.level}) — scored highest ` +
      `on generation/stars/level and relevant role tags among available heroes.`
  );

  const counts: Record<TroopType, number> = { Infantry: 0, Lancer: 0, Marksman: 0 };
  for (const h of formation) counts[h.troopType] += 1;
  const totalHeroes = formation.length || 1;
  const troopRatioSuggestion: Record<TroopType, number> = {
    Infantry: Math.round((counts.Infantry / totalHeroes) * 100) / 100,
    Lancer: Math.round((counts.Lancer / totalHeroes) * 100) / 100,
    Marksman: Math.round((counts.Marksman / totalHeroes) * 100) / 100,
  };

  return { formation, reasoning, troopRatioSuggestion };
}

// ----------------------------------------------------------------------------
// Rally Joiner mode: the far-left hero matters most (its first expedition
// skill provides the joining bonus). Known rally-support specialists
// (Jessie, Jasser, Jeronimo, etc.) are prioritized for that slot instead of
// simply picking the highest raw-power hero.
// ----------------------------------------------------------------------------
function rallySupportScore(hero: Hero): number {
  let score = 0;
  if (KNOWN_RALLY_SUPPORT_HERO_IDS.includes(hero.id)) score += 100;
  if (hero.roleTags.includes("RallySupport")) score += 60;
  if (hero.roleTags.includes("BearTrap")) score += 20;
  // Generation/stars/level act only as tie-breakers, NOT the primary driver —
  // raw power must never override known first-skill rally support value.
  score += hero.generation * 2 + hero.stars + hero.level * 0.05;
  return score;
}

export function recommendRallyJoiner(candidates: Hero[]): BearTrapRallyJoinerResult {
  if (candidates.length === 0) {
    throw new Error("recommendRallyJoiner requires at least one candidate hero");
  }
  const ranked = [...candidates].sort((a, b) => rallySupportScore(b) - rallySupportScore(a));
  const farLeftHero = ranked[0];
  const supportingHeroes = ranked.slice(1, 4);

  const reasoning: string[] = [];
  if (farLeftHero) {
    reasoning.push(
      KNOWN_RALLY_SUPPORT_HERO_IDS.includes(farLeftHero.id)
        ? `${farLeftHero.name} is a known rally-support specialist — placed far-left for their first expedition skill bonus, not because of raw power.`
        : `${farLeftHero.name} scored highest for far-left placement based on rally-support role tags and generation/star tie-breakers.`
    );
  }
  for (const h of supportingHeroes) {
    reasoning.push(`${h.name} recommended as a supporting joiner hero.`);
  }

  return { farLeftHero, supportingHeroes, reasoning };
}
