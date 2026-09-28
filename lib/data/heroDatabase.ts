import { TroopType, Rarity, RoleTag } from "../types";
import { getHeroPortraitPath, normalizeHeroId } from "./heroPortraits";

// Source of truth: §13 "Hero Master Database Through Gen 17" of
// WOS_Hero_Optimizer_Complete_Breakdown.md. Generation and troop type come
// from that table only — never from portrait filenames.
// Note: the spec lists Base heroes under "Base / Epic-Rare" but gives no
// rarity for Gen 1-17; "Mythic" for generation heroes is a pre-existing app
// assumption and is not used by any optimizer math.

export interface HeroDefinition {
  id: string; // stable slug, e.g. "smith"
  name: string;
  generation: number; // 0 = Base/Epic-Rare roster
  troopType: TroopType;
  rarity: Rarity;
  /** Heroes with known rally/support relevance get pre-tagged; user can still override. */
  defaultRoleTags: RoleTag[];
  /** Public path into the local portrait library, or null if no portrait exists. */
  portrait: string | null;
}

const slug = normalizeHeroId;

function def(
  name: string,
  generation: number,
  troopType: TroopType,
  rarity: Rarity,
  defaultRoleTags: RoleTag[] = []
): HeroDefinition {
  const id = slug(name);
  return { id, name, generation, troopType, rarity, defaultRoleTags, portrait: getHeroPortraitPath(id) };
}

// ----------------------------------------------------------------------------
// Base / Epic-Rare roster (generation 0)
// ----------------------------------------------------------------------------
const BASE_HEROES: HeroDefinition[] = [
  def("Smith", 0, "Infantry", "Epic-Rare"),
  def("Eugene", 0, "Infantry", "Epic-Rare"),
  def("Charlie", 0, "Lancer", "Epic-Rare"),
  def("Cloris", 0, "Marksman", "Epic-Rare"),
  def("Sergey", 0, "Infantry", "Epic-Rare"),
  def("Jessie", 0, "Lancer", "Epic-Rare", ["RallySupport", "BearTrap"]),
  def("Patrick", 0, "Lancer", "Epic-Rare"),
  def("Lumak Bokan", 0, "Lancer", "Epic-Rare"),
  def("Ling Xue", 0, "Lancer", "Epic-Rare"),
  def("Gina", 0, "Marksman", "Epic-Rare"),
  def("Bahiti", 0, "Marksman", "Epic-Rare"),
  def("Jasser", 0, "Marksman", "Epic-Rare", ["RallySupport", "BearTrap"]),
  def("Seo-yoon", 0, "Marksman", "Epic-Rare"),
];

// ----------------------------------------------------------------------------
// Generation rosters (Gen 1 - Gen 17). Pattern: Infantry, Lancer, Marksman.
// ----------------------------------------------------------------------------
const GEN_ROSTERS: [number, string, string, string][] = [
  [1, "Natalia", "Molly", "Zinman"],
  [2, "Flint", "Philly", "Alonso"],
  [3, "Logan", "Mia", "Greg"],
  [4, "Ahmose", "Reina", "Lynn"],
  [5, "Hector", "Norah", "Gwen"],
  [6, "Wu Ming", "Renee", "Wayne"],
  [7, "Edith", "Gordon", "Bradley"],
  [8, "Gatot", "Sonya", "Hendrik"],
  [9, "Magnus", "Fred", "Xura"],
  [10, "Gregory", "Freya", "Blanchette"],
  [11, "Eleonora", "Lloyd", "Rufus"],
  [12, "Hervor", "Karol", "Ligeia"],
  [13, "Gisela", "Flora", "Vulcanus"],
  [14, "Elif", "Dominic", "Cara"],
  [15, "Hank", "Estrella", "Viveca"],
  [16, "Seigel", "Ursar", "Aisling"],
  [17, "Aiden", "Bertha", "Eleanor"],
];

// Gen 1 also has an extra Infantry hero (Jeronimo) per the source list.
const GEN_EXTRA: HeroDefinition[] = [
  def("Jeronimo", 1, "Infantry", "Mythic", ["RallySupport", "BearTrap"]),
];

const GEN_HEROES: HeroDefinition[] = GEN_ROSTERS.flatMap(([gen, inf, lan, mark]) => [
  def(inf, gen, "Infantry", "Mythic"),
  def(lan, gen, "Lancer", "Mythic"),
  def(mark, gen, "Marksman", "Mythic"),
]).concat(GEN_EXTRA);

export const HERO_DATABASE: HeroDefinition[] = [...BASE_HEROES, ...GEN_HEROES];

export function getHeroDefinition(idOrName: string): HeroDefinition | undefined {
  const target = slug(idOrName);
  return HERO_DATABASE.find((h) => h.id === target);
}

export function findHeroesByTroopType(troopType: TroopType): HeroDefinition[] {
  return HERO_DATABASE.filter((h) => h.troopType === troopType);
}

export function findHeroesByGeneration(generation: number): HeroDefinition[] {
  return HERO_DATABASE.filter((h) => h.generation === generation);
}

/** Known rally-support specialists commonly prioritized for Rally Joiner (far-left). */
export const KNOWN_RALLY_SUPPORT_HERO_IDS = ["jessie", "jasser", "jeronimo"];
