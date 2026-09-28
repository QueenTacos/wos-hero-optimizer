// ============================================================================
// Mastery Forging — spends ESSENCE STONES (and, from Level 11, spare Mythic
// gear). Never touches Enhancement XP or Mithril.
// ============================================================================

import { EquippedGearPiece, MasteryState, masteryOf } from "../types";
import { MASTERY_FORGING_TABLE, masteryCost, masteryIndex } from "../data/masteryForgingTable";

export interface MasteryResources {
  essenceStones: number;
  spareMythicGear: number;
}

export interface ForgeResult<R extends MasteryResources> {
  piece: EquippedGearPiece;
  resources: R;
  reached: MasteryState;
  essenceSpent: number;
  mythicSpent: number;
  /** true when the target was reached. */
  complete: boolean;
  stoppedBecause?: string;
}

/** Forges step by step toward `target`, stopping when a step can't be paid for. */
export function forgeMastery<R extends MasteryResources>(piece: EquippedGearPiece, res: R, target: MasteryState): ForgeResult<R> {
  const from = masteryOf(piece);
  let i = masteryIndex(from.level, from.stage);
  const end = masteryIndex(target.level, target.stage);
  let essence = res.essenceStones, mythic = res.spareMythicGear, essenceSpent = 0, mythicSpent = 0;
  let stoppedBecause: string | undefined;
  while (i < end) {
    const step = MASTERY_FORGING_TABLE[i + 1];
    if (!step) { stoppedBecause = "No data beyond this Mastery step."; break; }
    if (step.essenceStoneCost > essence) { stoppedBecause = `Not enough Essence Stones for Mastery ${step.level}.${step.stage} (${step.essenceStoneCost} needed).`; break; }
    if (step.mythicGearCost > mythic) { stoppedBecause = `Not enough spare Mythic gear for Mastery ${step.level}.${step.stage} (${step.mythicGearCost} needed).`; break; }
    essence -= step.essenceStoneCost; mythic -= step.mythicGearCost;
    essenceSpent += step.essenceStoneCost; mythicSpent += step.mythicGearCost;
    i++;
  }
  const row = MASTERY_FORGING_TABLE[i];
  const reached = i < 0 ? { level: 0, stage: 0 } : { level: row.level, stage: row.stage };
  return {
    piece: { ...piece, mastery: reached },
    resources: { ...res, essenceStones: essence, spareMythicGear: mythic },
    reached,
    essenceSpent,
    mythicSpent,
    complete: i >= end,
    stoppedBecause,
  };
}

export { masteryCost };
