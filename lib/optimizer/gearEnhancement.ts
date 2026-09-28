// ============================================================================
// Top 3 Hero Gear Enhancement — Enhancement XP only (10/100 XP components +
// sacrificed gear XP). Heroes #4+ are never passed in, so they can't receive
// any. Essence Stones, Mithril and Mythic gear are NOT used here (see
// masteryForging.ts / legendaryProgression.ts / gearProgressionPlan.ts).
//
// Strategy "priority-pieces" (default):
//   1. The 6 PRIORITY pieces of the Top 3 are finished first, in Top 3 order.
//      A piece is finished when Enhancement XP can't take it further:
//        Mythic/lower → +100
//        Legendary    → its current threshold (+19, +39, …); passing that needs
//                       Mastery + Mithril + Mythic gear, not XP.
//      Already-finished priority pieces cost nothing.
//   2. Only when all priority pieces are finished, remaining XP is balanced
//      across the other 6 (lowest enhancement first).
// Strategy "hero-order": Hero #1's pieces to their goal, then #2's, then #3's.
//
// Priority pieces: pieces marked `priority: true` by the user; otherwise the
// 2 most-progressed pieces of each Top 3 hero (by getGearProgressionRank).
// ============================================================================

import {
  Hero,
  GearEnhancementPlan,
  GearEnhancementStep,
  EnhancementMode,
  EnhancementPieceReport,
  EquippedGearPiece,
  GEAR_SLOTS,
  GearSlot,
  masteryOf,
} from "../types";
import { GEAR_MAX_LEVEL, xpToNextGearLevel } from "../data/gearXpTable";
import { legendaryThresholdAt, legendaryXpToNext } from "../data/legendaryProgression";
import { ASCENSION } from "../data/legendaryProgression";
import { compareGear } from "./gearProgression";

interface Piece {
  heroIdx: number;
  slot: GearSlot;
  piece: EquippedGearPiece;
  level: number;
  start: number;
  priority: boolean;
  phase?: GearEnhancementStep["phase"];
}

/** XP for the next enhancement level, or null when XP alone can't go further. */
export function xpToNextEnhancement(piece: Pick<EquippedGearPiece, "rarity">, level: number): number | null {
  if (piece.rarity === "legendary") return legendaryXpToNext(level);
  return level < GEAR_MAX_LEVEL ? xpToNextGearLevel(level) : null;
}

/** What the piece needs next once Enhancement XP can't move it. */
export function nextRequirement(piece: EquippedGearPiece, level: number): string | undefined {
  if (piece.rarity === "legendary") {
    const t = legendaryThresholdAt(level);
    if (!t) return undefined;
    if (t.source === "unknown") {
      return `Legendary +${level} → +${t.resultingEnhancementLevel} is a material step, not Enhancement XP. Its cost isn't known yet — needs confirmation.`;
    }
    const parts = [
      t.requiredMasteryLevel !== null ? `Mastery ${t.requiredMasteryLevel}` : "Mastery requirement unknown",
      t.mithrilCost !== null ? `${t.mithrilCost} Mithril` : "Mithril cost unknown",
      t.mythicGearCost !== null ? `${t.mythicGearCost} Mythic gear` : "Mythic gear cost unknown",
    ];
    return `Legendary +${level} → +${t.resultingEnhancementLevel} needs ${parts.join(", ")} (not Enhancement XP).`;
  }
  if (level >= GEAR_MAX_LEVEL) {
    if (piece.rarity === "mythic") {
      const m = masteryOf(piece);
      return m.level >= ASCENSION.requiredMastery.level
        ? `Ready for Legendary ascension (${ASCENSION.mythicGearCost} spare Mythic gear).`
        : `Next: Mastery ${ASCENSION.requiredMastery.level} (Essence Stones), then Legendary ascension.`;
    }
    return "At +100 (max for this quality).";
  }
  return undefined;
}

/** The priority designation for the Top 3 (see file header). */
export function priorityPieceKeys(top3: Hero[]): { keys: Set<string>; source: "manual" | "automatic" } {
  const manual = new Set<string>();
  top3.forEach((h) => GEAR_SLOTS.forEach((slot) => h.gear[slot]?.priority && manual.add(`${h.id}:${slot}`)));
  if (manual.size > 0) return { keys: manual, source: "manual" };
  const auto = new Set<string>();
  for (const h of top3) {
    const equipped = GEAR_SLOTS.filter((slot) => h.gear[slot]);
    // Stable: most progressed first; ties keep slot order (goggles, gloves, belt, boots).
    equipped
      .map((slot, i) => ({ slot, i }))
      .sort((a, b) => compareGear(h.gear[b.slot], h.gear[a.slot]) || a.i - b.i)
      .slice(0, 2)
      .forEach(({ slot }) => auto.add(`${h.id}:${slot}`));
  }
  return { keys: auto, source: "automatic" };
}

export function optimizeGearEnhancement(top3: Hero[], xpBudget: number, mode: EnhancementMode = "priority-pieces"): GearEnhancementPlan {
  const { keys, source } = priorityPieceKeys(top3);
  const pieces: Piece[] = [];
  top3.forEach((hero, heroIdx) => {
    for (const slot of GEAR_SLOTS) {
      const piece = hero.gear[slot];
      if (!piece) continue;
      const lvl = Math.max(0, Math.min(100, piece.enhancementLevel));
      pieces.push({ heroIdx, slot, piece, level: lvl, start: lvl, priority: keys.has(`${hero.id}:${slot}`) });
    }
  });

  let remaining = Math.max(0, xpBudget);
  const notes: string[] = [];

  const fillToGoal = (p: Piece, phase: GearEnhancementStep["phase"]) => {
    for (;;) {
      const c = xpToNextEnhancement(p.piece, p.level);
      if (c === null || c > remaining) return;
      remaining -= c;
      p.level++;
      p.phase = phase;
    }
  };
  const atGoal = (p: Piece) => xpToNextEnhancement(p.piece, p.level) === null;

  if (mode === "hero-order") {
    for (const p of pieces) fillToGoal(p, "hero-order");
  } else {
    const priority = pieces.filter((p) => p.priority);
    const secondary = pieces.filter((p) => !p.priority);
    if (source === "manual" && priority.length !== 6) {
      notes.push(`${priority.length} priority piece(s) are marked; the strategy expects 6 (2 per Top 3 hero).`);
    }
    for (const p of priority) fillToGoal(p, "priority");

    if (priority.every(atGoal)) {
      // Balance the rest: repeatedly raise the lowest affordable piece by one level.
      for (;;) {
        const candidates = secondary
          .filter((p) => !atGoal(p))
          .sort((a, b) => a.level - b.level || pieces.indexOf(a) - pieces.indexOf(b));
        const next = candidates.find((p) => (xpToNextEnhancement(p.piece, p.level) ?? Infinity) <= remaining);
        if (!next) break;
        remaining -= xpToNextEnhancement(next.piece, next.level)!;
        next.level++;
        next.phase = "secondary";
      }
    } else if (secondary.length > 0) {
      notes.push("Priority pieces aren't finished yet, so the other 6 pieces get no Enhancement XP this round.");
    }
  }

  const cost = (p: Piece) => {
    let s = 0;
    for (let l = p.start; l < p.level; l++) s += xpToNextEnhancement(p.piece, l) ?? 0;
    return s;
  };

  const steps: GearEnhancementStep[] = pieces
    .filter((p) => p.level > p.start)
    .map((p) => ({
      heroId: top3[p.heroIdx].id,
      heroName: top3[p.heroIdx].name,
      slot: p.slot,
      fromLevel: p.start,
      toLevel: p.level,
      xpSpent: cost(p),
      phase: p.phase,
      quality: p.piece.rarity,
    }));

  const allPriorityDone = pieces.filter((p) => p.priority).every(atGoal);
  const report: EnhancementPieceReport[] = pieces.map((p) => {
    const goal = atGoal(p);
    const next = goal ? nextRequirement(p.piece, p.level) : undefined;
    // Legendary pieces at a threshold are "blocked" (they need non-XP materials);
    // everything else at its XP goal is "complete".
    const status: EnhancementPieceReport["status"] = goal
      ? p.piece.rarity === "legendary" ? "blocked" : "complete"
      : mode === "priority-pieces" && !p.priority && !allPriorityDone
        ? "waiting"
        : "partial";
    return {
      heroId: top3[p.heroIdx].id,
      heroName: top3[p.heroIdx].name,
      slot: p.slot,
      quality: p.piece.rarity,
      mastery: masteryOf(p.piece),
      priority: p.priority,
      fromLevel: p.start,
      toLevel: p.level,
      xpSpent: cost(p),
      status,
      next,
    };
  });

  return { steps, xpUsed: Math.max(0, xpBudget) - remaining, xpRemaining: remaining, pieces: report, prioritySource: source, notes };
}
