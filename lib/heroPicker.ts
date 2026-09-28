// Grouping + ordering for the "Choose a hero" sheet. Pure, so it can be tested.
// Generation groups are ASCENDING: Base (generation 0), Gen 1, Gen 2 … Gen 17.
// Heroes keep their database order inside each generation. Filtering (troop
// type, search) never changes the group order.

import { HERO_DATABASE, HeroDefinition } from "./data/heroDatabase";
import { TroopType } from "./types";

export function groupHeroesForPicker(
  opts: { query?: string; troop?: TroopType | "all" } = {},
  heroes: HeroDefinition[] = HERO_DATABASE
): [generation: number, heroes: HeroDefinition[]][] {
  const q = (opts.query ?? "").trim().toLowerCase();
  const troop = opts.troop ?? "all";
  const byGen = new Map<number, HeroDefinition[]>();
  for (const h of heroes) {
    if (troop !== "all" && h.troopType !== troop) continue;
    if (q && !h.name.toLowerCase().includes(q)) continue;
    byGen.set(h.generation, [...(byGen.get(h.generation) ?? []), h]);
  }
  return [...byGen.entries()].sort((a, b) => a[0] - b[0]);
}
