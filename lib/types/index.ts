// ============================================================================
// WOS Hero Optimizer — Core Data Models (v2)
// ============================================================================

export type TroopType = "Infantry" | "Lancer" | "Marksman";

export type Rarity = "Epic" | "Epic-Rare" | "Mythic" | "Legendary" | "Base"; // hero rarity (distinct from gear rarity)

export type RoleTag =
  | "RallyCaptain"
  | "RallySupport"
  | "Garrison"
  | "PvP"
  | "PvE"
  | "BearTrap"
  | "Exploration"
  | "SurvivorTransport"
  | "Expedition";

// ----------------------------------------------------------------------------
// Hero Gear (v2): 4 fixed slots per hero, rarity + independent enhancement level.
// Gear is NOT troop-type restricted in this model.
// ----------------------------------------------------------------------------
export type GearSlot = "goggles" | "gloves" | "belt" | "boots";
export const GEAR_SLOTS: GearSlot[] = ["goggles", "gloves", "belt", "boots"];

/**
 * Gear quality / progression state. "legendary" is NOT just a colour: it is
 * the progression stage after Mythic +100 / Mastery 10 + ascension, with its
 * own enhancement numbers (see lib/data/legendaryProgression.ts).
 */
export type GearRarity = "common" | "uncommon" | "rare" | "epic" | "mythic" | "legendary";
/** Same thing, named as in the project spec. The stored field stays `rarity` for compatibility. */
export type GearQuality = GearRarity;

/** Mastery Forging (Essence Stones). Level 0 = never forged. Stage 0-4 exists from Level 4. */
export interface MasteryState {
  level: number;
  stage: number;
}

export interface EquippedGearPiece {
  slot: GearSlot;
  /** Quality / progression state (common … mythic, legendary). */
  rarity: GearRarity;
  /**
   * Enhancement value WITHIN the piece's progression state:
   *  - common…mythic: +0…+100, costs from gearXpTable.ts
   *  - legendary:     +0…+100 again, costs + thresholds from legendaryProgression.ts
   * Never compare enhancement numbers across states (Legendary +19 > Mythic +100).
   */
  enhancementLevel: number;
  /** Mastery Forging — separate from enhancement. Missing on old records = { level: 0, stage: 0 }. */
  mastery?: MasteryState;
  /** Optional explicit Legendary tier if the game shows one. */
  legendaryTier?: number;
  /** Later Empowerment progression, if tracked. */
  empowermentLevel?: number;
  /** Actual gear power/stats if known — preferred over the progression heuristic for comparisons. */
  actualPower?: number;
  /** User-designated Top 3 priority piece (see gearEnhancement.ts). Unset = automatic choice. */
  priority?: boolean;
  id?: string;
  equippedHeroId?: string;
}

export function masteryOf(piece: Pick<EquippedGearPiece, "mastery"> | null | undefined): MasteryState {
  return { level: piece?.mastery?.level ?? 0, stage: piece?.mastery?.stage ?? 0 };
}

export type HeroGear = Record<GearSlot, EquippedGearPiece | null>;

export function emptyHeroGear(): HeroGear {
  return { goggles: null, gloves: null, belt: null, boots: null };
}

export interface Hero {
  id: string;
  name: string;
  /** 0 = Base/Epic-Rare roster, 1-17 = Gen1..Gen17 */
  generation: number;
  troopType: TroopType;
  rarity: Rarity;
  /** 1-80 */
  level: number;
  /** 0-5, may include a fractional "half star" tier for display (e.g. 3.5) */
  stars: number;
  power: number;
  roleTags: RoleTag[];
  gear: HeroGear;
  /**
   * 0-1 confidence that automatic screenshot detection produced this hero's
   * data correctly. 1 = manually entered/confirmed by the user.
   */
  sourceConfidence: number;
  detectedPowerRank?: number;
  /** Hero master-database id (e.g. "sergey"). `id` is the roster-row id, which may differ. */
  heroDefId?: string;
}

// ----------------------------------------------------------------------------
// Inventory (v2)
// ----------------------------------------------------------------------------
export interface HeroExpInventory {
  mode: "total" | "items";
  /** Used when mode === "total". Parsed from user input like "3.6m" or "750k". */
  manualTotal: number;
  /** Used when mode === "items". */
  items: {
    exp1k: number;
    exp5k: number;
    exp10k: number;
    exp50k: number;
  };
}

export function emptyHeroExpInventory(): HeroExpInventory {
  return { mode: "items", manualTotal: 0, items: { exp1k: 0, exp5k: 0, exp10k: 0, exp50k: 0 } };
}

/** Gear the player owns but has NOT equipped on any hero, counted by slot + rarity. */
export type UnassignedGearInventory = Record<GearSlot, Record<GearRarity, number>>;

export function emptyUnassignedGearInventory(): UnassignedGearInventory {
  const zeroRarities = (): Record<GearRarity, number> => ({
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    mythic: 0,
    legendary: 0,
  });
  return { goggles: zeroRarities(), gloves: zeroRarities(), belt: zeroRarities(), boots: zeroRarities() };
}

export interface Inventory {
  heroExp: HeroExpInventory;
  enhancementComponents: {
    xp10: number;
    xp100: number;
  };
  /** Enhancement XP from gear you plan to sacrifice — kept separate from component counts. */
  sacrificedGearXp?: number;
  /** Unequipped gear by slot + quality. Its Mythic counts double as spare Mythic Gear material. */
  unassignedGear: UnassignedGearInventory;
  /** Mastery Forging resource. */
  essenceStones: number;
  /** Legendary threshold resource. */
  mithril: number;
}

/** The separate Hero Gear resource pools (spec §12). Never merged into one number. */
export interface HeroGearInventory {
  enhancementXp: number;
  essenceStones: number;
  mithril: number;
  /** Total spare Mythic gear usable as ascension / threshold / mastery material. */
  spareMythicGear: number;
}

export function emptyInventory(): Inventory {
  return {
    heroExp: emptyHeroExpInventory(),
    enhancementComponents: { xp10: 0, xp100: 0 },
    unassignedGear: emptyUnassignedGearInventory(),
    essenceStones: 0,
    mithril: 0,
  };
}

// ----------------------------------------------------------------------------
// Optimization plans / results
// ----------------------------------------------------------------------------

export interface HeroLevelStep {
  heroId: string;
  heroName: string;
  fromLevel: number;
  toLevel: number;
  xpSpent: number;
}

export interface HeroLevelPlan {
  steps: HeroLevelStep[];
  xpUsed: number;
  xpRemaining: number;
}

export interface GearAssignmentEntry {
  heroId: string;
  heroName: string;
  slot: GearSlot;
  newRarity: GearRarity;
  newEnhancementLevel: number;
  previousRarity: GearRarity | null;
  source: "inventory" | "reclaimed-from-hero";
  reclaimedFromHeroId?: string;
}

export interface ReturnedGear {
  slot: GearSlot;
  rarity: GearRarity;
  fromHeroId: string;
}

export interface GearAssignmentPlan {
  assignments: GearAssignmentEntry[];
  replacedGearReturnedToInventory: ReturnedGear[];
  finalUnassignedGear: UnassignedGearInventory;
  warnings: string[];
}

export interface GearEnhancementStep {
  heroId: string;
  heroName: string;
  slot: GearSlot;
  fromLevel: number;
  toLevel: number;
  xpSpent: number;
  /** Which pass spent the XP. */
  phase?: "priority" | "secondary" | "hero-order";
  quality?: GearRarity;
}

/** Every eligible Top 3 piece, including the ones that received nothing, with why. */
export interface EnhancementPieceReport {
  heroId: string;
  heroName: string;
  slot: GearSlot;
  quality: GearRarity;
  mastery: MasteryState;
  priority: boolean;
  fromLevel: number;
  toLevel: number;
  xpSpent: number;
  /**
   * complete — at its Enhancement XP goal (Mythic +100, or a Legendary threshold);
   * blocked  — the next step needs something other than Enhancement XP;
   * partial  — ran out of XP;
   * waiting  — secondary piece, held back because priority pieces aren't finished.
   */
  status: "complete" | "blocked" | "partial" | "waiting";
  /** Plain-language next requirement, e.g. "+19 → +20 needs Mastery 11, 10 Mithril, 3 Mythic gear". */
  next?: string;
}

export interface GearEnhancementPlan {
  steps: GearEnhancementStep[];
  xpUsed: number;
  xpRemaining: number;
  pieces?: EnhancementPieceReport[];
  prioritySource?: "manual" | "automatic";
  notes?: string[];
}

export interface OptimizationResult {
  selectedTop5: Hero[];
  selectedTop3: Hero[];
  heroLevelPlan: HeroLevelPlan;
  gearAssignmentPlan: GearAssignmentPlan;
  gearEnhancementPlan: GearEnhancementPlan;
  resourcesUsed: {
    heroExp: number;
    enhancementXp: number;
  };
  resourcesRemaining: {
    heroExp: number;
    enhancementXp: number;
  };
  resourcesAvailable: {
    heroExp: number;
    enhancementXp: number;
  };
  /** Every hero with the recommended gear applied (enhancement not yet applied). */
  heroesAfterGear: Hero[];
  /** Mastery / Legendary milestones (Essence Stones, Mithril, spare Mythic gear) — see gearProgressionPlan.ts. */
  progressionPlan?: import("../optimizer/gearProgressionPlan").ProgressionPlan;
  warnings: string[];
}

export type LevelingMode = "balanced" | "priority";
/**
 * "priority-pieces" (default): finish the 6 priority pieces of the Top 3 first, then balance the other 6.
 * "hero-order": Hero #1's pieces, then #2's, then #3's.
 */
export type EnhancementMode = "priority-pieces" | "hero-order";

export interface RankingWeights {
  generation: number;
  troopTypeBalance: number;
  stars: number;
  level: number;
  gearQuality: number;
  gearEnhancement: number;
  combatUsefulness: number;
  bearTrapUsefulness: number;
  externalTierList: number;
}

export interface BearTrapRallyCaptainResult {
  formation: Hero[];
  reasoning: string[];
  troopRatioSuggestion: Record<TroopType, number>;
}

export interface BearTrapRallyJoinerResult {
  farLeftHero: Hero;
  supportingHeroes: Hero[];
  reasoning: string[];
}

export interface DetectedScreenshotHero {
  candidateHeroId: string | null;
  candidateName: string | null;
  confidence: number;
  troopTypeDetected: TroopType | null;
  generationDetected: number | null;
  levelDetected: number | null;
  starsDetected: number | null;
  powerRankDetected: number | null;
  boundingBox: { x: number; y: number; width: number; height: number };
  /** Top portrait-match candidates, best first (Phase 2 roster scan). */
  candidates?: { heroId: string; confidence: number }[];
  /** Tier (0-5 petals) into the next star, read from the star icons. */
  starTierDetected?: number | null;
  starsConfidence?: number;
  levelConfidence?: number;
  /** Raw OCR text for the level label, shown on the review screen. */
  levelRawText?: string;
  /** Troop type read from the card's icon — a cross-check, independent of the portrait match. */
  troopIconDetected?: TroopType | null;
  troopIconConfidence?: number;
  /** Card was cut off by the screenshot edge (portrait visible, level/stars not). */
  partial?: boolean;
  /** Plain-language reasons this card needs a closer look on the Review screen. */
  reviewReasons?: string[];
}

export interface ScreenshotParseResult<T> {
  screenshotId: string;
  screenshotType:
    | "hero_roster"
    | "hero_exp_inventory"
    | "enhancement_components"
    | "resource_inventory"
    | "gear_inventory"
    | "hero_gear"
    | "opponent"
    | "bear_trap";
  data: T;
  overallConfidence: number;
  warnings: string[];
}
