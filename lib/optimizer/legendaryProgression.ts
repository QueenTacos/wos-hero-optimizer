// ============================================================================
// Mythic → Legendary ascension and Legendary threshold steps.
// Uses ONLY: Mastery requirement (checked, not spent), Mithril, spare Mythic
// gear. Never touches Enhancement XP or Essence Stones.
// ============================================================================

import { EquippedGearPiece, masteryOf } from "../types";
import { ASCENSION, LegendaryThreshold, legendaryThresholdAt } from "../data/legendaryProgression";
import { compareMastery } from "../data/masteryForgingTable";

export interface LegendaryResources {
  mithril: number;
  spareMythicGear: number;
}

export interface Eligibility {
  eligible: boolean;
  /** Plain-language reasons it isn't possible yet. */
  missing: string[];
}

/** Mythic +100 AND Mastery ≥ 10 AND 2 spare Mythic gear. */
export function canAscend(piece: EquippedGearPiece, res: Pick<LegendaryResources, "spareMythicGear">): Eligibility {
  const missing: string[] = [];
  if (piece.rarity !== "mythic") missing.push(`Must be Mythic (is ${piece.rarity}).`);
  if (piece.enhancementLevel < ASCENSION.requiredEnhancement) missing.push(`Enhancement +${ASCENSION.requiredEnhancement} needed (is +${piece.enhancementLevel}).`);
  if (compareMastery(masteryOf(piece), ASCENSION.requiredMastery) < 0) missing.push(`Mastery ${ASCENSION.requiredMastery.level} needed (is ${masteryOf(piece).level}).`);
  if (res.spareMythicGear < ASCENSION.mythicGearCost) missing.push(`${ASCENSION.mythicGearCost} spare Mythic gear needed (have ${res.spareMythicGear}).`);
  return { eligible: missing.length === 0, missing };
}

/** Ascends a Mythic piece. Enhancement restarts on the Legendary scale; Mastery is kept. Consumes spare Mythic gear. */
export function ascendToLegendary<R extends Pick<LegendaryResources, "spareMythicGear">>(piece: EquippedGearPiece, res: R): { piece: EquippedGearPiece; resources: R } {
  const e = canAscend(piece, res);
  if (!e.eligible) throw new Error(`Can't ascend: ${e.missing.join(" ")}`);
  return {
    piece: { ...piece, rarity: "legendary", enhancementLevel: 0, mastery: masteryOf(piece) },
    resources: { ...res, spareMythicGear: res.spareMythicGear - ASCENSION.mythicGearCost },
  };
}

/** The threshold a Legendary piece is currently sitting on (XP can't move it further), if any. */
export function currentLegendaryThreshold(piece: EquippedGearPiece): LegendaryThreshold | undefined {
  return piece.rarity === "legendary" ? legendaryThresholdAt(piece.enhancementLevel) : undefined;
}

export function canPassThreshold(piece: EquippedGearPiece, res: LegendaryResources): Eligibility & { threshold?: LegendaryThreshold; unknownData: boolean } {
  const t = currentLegendaryThreshold(piece);
  if (!t) return { eligible: false, missing: ["Not at a Legendary threshold."], unknownData: false };
  const missing: string[] = [];
  const unknownData = t.requiredMasteryLevel === null || t.mithrilCost === null || t.mythicGearCost === null;
  if (unknownData) missing.push(t.note ?? "Requirements for this threshold aren't known yet.");
  if (t.requiredMasteryLevel !== null && masteryOf(piece).level < t.requiredMasteryLevel) {
    missing.push(`Mastery ${t.requiredMasteryLevel} needed (is ${masteryOf(piece).level}).`);
  }
  if (t.mithrilCost !== null && res.mithril < t.mithrilCost) missing.push(`${t.mithrilCost} Mithril needed (have ${res.mithril}).`);
  if (t.mythicGearCost !== null && res.spareMythicGear < t.mythicGearCost) missing.push(`${t.mythicGearCost} spare Mythic gear needed (have ${res.spareMythicGear}).`);
  return { eligible: missing.length === 0, missing, threshold: t, unknownData };
}

/** Passes the current threshold: consumes Mithril + Mythic gear, enhancement moves to the next band. */
export function passThreshold<R extends LegendaryResources>(piece: EquippedGearPiece, res: R): { piece: EquippedGearPiece; resources: R } {
  const c = canPassThreshold(piece, res);
  if (!c.eligible || !c.threshold) throw new Error(`Can't pass threshold: ${c.missing.join(" ")}`);
  const t = c.threshold;
  return {
    piece: { ...piece, enhancementLevel: t.resultingEnhancementLevel },
    resources: { ...res, mithril: res.mithril - (t.mithrilCost ?? 0), spareMythicGear: res.spareMythicGear - (t.mythicGearCost ?? 0) },
  };
}
