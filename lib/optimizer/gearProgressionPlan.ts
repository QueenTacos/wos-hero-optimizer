// ============================================================================
// Mastery / Legendary milestone plan for the Top 3 — the non-XP resource
// pools, kept separate from Enhancement XP:
//   Essence Stones  → Mastery Forging
//   Mithril         → Legendary thresholds
//   Spare Mythic gear → ascension, Legendary thresholds, Mastery 11+
//
// For each piece (after this round's Enhancement XP) we find the NEXT
// milestone and its full cost. Resources are allocated all-or-nothing, priority
// pieces first, then the rest. Unknown data is reported, never guessed.
// Only the Top 3 are planned (same eligibility as Enhancement Components).
// ============================================================================

import { EquippedGearPiece, GearSlot, Hero, GEAR_SLOTS, MasteryState, masteryOf, GearRarity } from "../types";
import { ASCENSION, legendaryThresholdAt } from "../data/legendaryProgression";
import { compareMastery, masteryCost } from "../data/masteryForgingTable";
import { GEAR_MAX_LEVEL } from "../data/gearXpTable";

export interface ProgressionResources {
  essenceStones: number;
  mithril: number;
  spareMythicGear: number;
}

export type MilestoneKind = "mastery-to-ascension" | "ascension" | "legendary-threshold" | "none";

export interface PieceMilestone {
  heroId: string;
  heroName: string;
  slot: GearSlot;
  quality: GearRarity;
  enhancementLevel: number;
  mastery: MasteryState;
  priority: boolean;
  kind: MilestoneKind;
  /** e.g. "Legendary +19 → +20" */
  title: string;
  cost: { essenceStones: number; mithril: number; mythicGear: number };
  /** Some part of the cost isn't known yet. */
  unknown: string[];
  /** Resources allocated this round (all-or-nothing). */
  affordable: boolean;
  shortBy: string[];
  /** Mastery rows from the wiki were used in this cost. */
  usesWikiData: boolean;
  /** Plain-language explanation. */
  detail: string;
}

export interface ProgressionPlan {
  milestones: PieceMilestone[];
  resourcesAvailable: ProgressionResources;
  resourcesUsed: ProgressionResources;
  resourcesRemaining: ProgressionResources;
}

function milestoneFor(piece: EquippedGearPiece): Omit<PieceMilestone, "heroId" | "heroName" | "slot" | "priority" | "affordable" | "shortBy"> {
  const m = masteryOf(piece);
  const base = { quality: piece.rarity, enhancementLevel: piece.enhancementLevel, mastery: m, unknown: [] as string[], usesWikiData: false };
  const zero = { essenceStones: 0, mithril: 0, mythicGear: 0 };

  if (piece.rarity === "mythic" && piece.enhancementLevel >= GEAR_MAX_LEVEL) {
    if (compareMastery(m, ASCENSION.requiredMastery) < 0) {
      const c = masteryCost(m, ASCENSION.requiredMastery)!;
      return {
        ...base,
        kind: "mastery-to-ascension",
        title: `Mastery ${m.level} → ${ASCENSION.requiredMastery.level}`,
        cost: { essenceStones: c.essenceStones, mithril: 0, mythicGear: c.mythicGear },
        usesWikiData: c.usesWikiData,
        detail: `Mythic +100 needs Mastery ${ASCENSION.requiredMastery.level} before it can ascend to Legendary.`,
      };
    }
    return {
      ...base,
      kind: "ascension",
      title: "Ascend to Legendary",
      cost: { essenceStones: 0, mithril: 0, mythicGear: ASCENSION.mythicGearCost },
      detail: `Mythic +100 with Mastery ${m.level}: ascend using ${ASCENSION.mythicGearCost} spare Mythic gear.`,
    };
  }

  if (piece.rarity === "legendary") {
    const t = legendaryThresholdAt(piece.enhancementLevel);
    if (!t) {
      return { ...base, kind: "none", title: "Enhancement XP first", cost: zero, detail: `Legendary +${piece.enhancementLevel}: keep enhancing with Enhancement XP up to the next threshold.` };
    }
    const unknown: string[] = [];
    let essence = 0, mythicForMastery = 0, usesWikiData = false;
    if (t.requiredMasteryLevel === null) unknown.push("Mastery requirement");
    else if (m.level < t.requiredMasteryLevel) {
      const c = masteryCost(m, { level: t.requiredMasteryLevel, stage: 0 });
      if (c) {
        essence = c.essenceStones;
        mythicForMastery = c.mythicGear;
        usesWikiData = c.usesWikiData;
      } else unknown.push("Mastery cost");
    }
    if (t.mithrilCost === null) unknown.push("Mithril cost");
    if (t.mythicGearCost === null) unknown.push("Mythic gear cost");
    const masteryPart = t.requiredMasteryLevel !== null && m.level < t.requiredMasteryLevel ? `Mastery ${m.level} → ${t.requiredMasteryLevel} (${essence} Essence Stones${mythicForMastery ? ` + ${mythicForMastery} Mythic gear` : ""}), then ` : "";
    return {
      ...base,
      kind: "legendary-threshold",
      title: `Legendary +${t.currentEnhancementCap} → +${t.resultingEnhancementLevel}`,
      cost: { essenceStones: essence, mithril: t.mithrilCost ?? 0, mythicGear: mythicForMastery + (t.mythicGearCost ?? 0) },
      unknown,
      usesWikiData: usesWikiData || t.source === "wiki",
      detail: `${masteryPart}${t.mithrilCost ?? "?"} Mithril + ${t.mythicGearCost ?? "?"} Mythic gear.${t.note ? " " + t.note : ""}`,
    };
  }

  return { ...base, kind: "none", title: "Enhancement XP first", cost: zero, detail: `${piece.rarity} +${piece.enhancementLevel}: no Mastery/Legendary milestone until +100.` };
}

export function planGearProgression(top3: Hero[], priorityKeys: Set<string>, available: ProgressionResources): ProgressionPlan {
  const rows: { hero: Hero; slot: GearSlot; piece: EquippedGearPiece; priority: boolean }[] = [];
  for (const hero of top3) for (const slot of GEAR_SLOTS) {
    const piece = hero.gear[slot];
    if (piece) rows.push({ hero, slot, piece, priority: priorityKeys.has(`${hero.id}:${slot}`) });
  }
  // Priority pieces first, stable otherwise.
  const ordered = [...rows.filter((r) => r.priority), ...rows.filter((r) => !r.priority)];

  const left = { ...available };
  const milestones: PieceMilestone[] = ordered.map((r) => {
    const m = milestoneFor(r.piece);
    const shortBy: string[] = [];
    let affordable = false;
    if (m.kind !== "none" && m.unknown.length === 0) {
      if (m.cost.essenceStones > left.essenceStones) shortBy.push(`${m.cost.essenceStones - left.essenceStones} Essence Stones`);
      if (m.cost.mithril > left.mithril) shortBy.push(`${m.cost.mithril - left.mithril} Mithril`);
      if (m.cost.mythicGear > left.spareMythicGear) shortBy.push(`${m.cost.mythicGear - left.spareMythicGear} spare Mythic gear`);
      affordable = shortBy.length === 0;
      if (affordable) {
        left.essenceStones -= m.cost.essenceStones;
        left.mithril -= m.cost.mithril;
        left.spareMythicGear -= m.cost.mythicGear;
      }
    }
    return { ...m, heroId: r.hero.id, heroName: r.hero.name, slot: r.slot, priority: r.priority, affordable, shortBy };
  });

  return {
    milestones,
    resourcesAvailable: { ...available },
    resourcesUsed: {
      essenceStones: available.essenceStones - left.essenceStones,
      mithril: available.mithril - left.mithril,
      spareMythicGear: available.spareMythicGear - left.spareMythicGear,
    },
    resourcesRemaining: left,
  };
}
