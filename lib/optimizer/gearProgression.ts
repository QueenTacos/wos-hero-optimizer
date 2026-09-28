// ============================================================================
// Hero Gear progression ranking — safe sorting / fallback comparison.
//
// Order of importance:
//   1. quality / progression state (… Mythic < Legendary)
//   2. Mastery (level, stage)
//   3. Enhancement WITHIN that state
//   4. Empowerment (if tracked)
// Enhancement numbers from different states are never compared directly:
// Legendary +19 outranks Mythic +100.
//
// If BOTH pieces have actualPower (real gear power/stats), that decides —
// the progression rank is only a fallback when real stats aren't known.
// ============================================================================

import { EquippedGearPiece, masteryOf } from "../types";
import { gearRarityRank } from "../data/gearRarity";
import { masteryIndex } from "../data/masteryForgingTable";

type Comparable = Pick<EquippedGearPiece, "rarity" | "enhancementLevel" | "mastery" | "empowermentLevel" | "actualPower">;

/** Monotonic progression rank. Only meaningful for ordering, not as a stat value. */
export function getGearProgressionRank(piece: Comparable | null | undefined): number {
  if (!piece) return -1;
  const q = gearRarityRank(piece.rarity); // 0 … 5
  const m = masteryOf(piece);
  const mi = masteryIndex(m.level, m.stage) + 1; // 0 … ~86
  const e = Math.max(0, Math.min(100, piece.enhancementLevel)); // 0 … 100
  const emp = Math.max(0, Math.min(999, piece.empowermentLevel ?? 0));
  return q * 1e9 + mi * 1e6 + e * 1e3 + emp;
}

/** >0 if a is better, <0 if b is better, 0 if equal. Uses actualPower when both are known. */
export function compareGear(a: Comparable | null | undefined, b: Comparable | null | undefined): number {
  if (a?.actualPower != null && b?.actualPower != null) return a.actualPower - b.actualPower;
  return getGearProgressionRank(a) - getGearProgressionRank(b);
}

export function isBetterGear(a: Comparable | null | undefined, b: Comparable | null | undefined): boolean {
  return compareGear(a, b) > 0;
}

/** "Legendary +19 · Mastery 10" — never a single generic "level". */
export function describeGear(piece: Comparable | null | undefined): string {
  if (!piece) return "empty";
  const q = piece.rarity.charAt(0).toUpperCase() + piece.rarity.slice(1);
  const m = masteryOf(piece);
  const mastery = m.level > 0 ? ` · Mastery ${m.level}${m.level >= 4 ? `.${m.stage}` : ""}` : "";
  return `${q} +${piece.enhancementLevel}${mastery}`;
}
