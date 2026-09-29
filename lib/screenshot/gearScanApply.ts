// ============================================================================
// Gear scan → review drafts → hero roster. Pure functions (tested).
//
// Rules:
//   • Low-confidence readings are never pre-filled (initialReviewValue).
//   • If the hero already has gear in a slot, its quality / mastery stage /
//     Priority mark are the starting point; the scan only proposes changes.
//   • Only slots the user left ticked are written, and only after Confirm.
//   • A scanned Legendary +19 stays { rarity: "legendary", enhancementLevel: 19 }.
// ============================================================================

import { GearRarity, GearSlot, GEAR_SLOTS } from "../types";
import type { SavedGearPiece } from "../storage/savedState";
import { GearScreenScan } from "./gearScreenReading";
import { initialReviewValue } from "./scanTypes";

export type RowGearLike = Record<GearSlot, SavedGearPiece | null>;

export interface SlotDraft {
  include: boolean;
  quality: GearRarity | "";
  enhancement: number | null;
  mastery: number | null;
  stage: number;
  /** Which fields the user has set/confirmed by hand. */
  userSet: { quality?: boolean; enhancement?: boolean; mastery?: boolean };
}

export function initialSlotDrafts(scan: GearScreenScan, existing?: RowGearLike | null): Record<GearSlot, SlotDraft> {
  const out = {} as Record<GearSlot, SlotDraft>;
  for (const slot of GEAR_SLOTS) {
    const s = scan.slots[slot];
    const cur = existing?.[slot] ?? null;
    const quality = initialReviewValue(s.quality) ?? cur?.rarity ?? "";
    const enhancement = initialReviewValue(s.enhancement);
    const mastery = initialReviewValue(s.mastery);
    const anyRead = s.enhancement.value !== null || s.mastery.value !== null;
    out[slot] = {
      include: s.equipped.value !== false && anyRead,
      quality,
      enhancement,
      mastery,
      stage: cur?.masteryStage ?? 0,
      userSet: {},
    };
  }
  return out;
}

/** Problems that block Confirm for one screenshot's review. Empty = ready. */
export function draftProblems(heroId: string, slots: Record<GearSlot, SlotDraft>): string[] {
  const p: string[] = [];
  if (!heroId) p.push("Choose the hero");
  const included = GEAR_SLOTS.filter((s) => slots[s].include);
  if (!included.length) p.push("Tick at least one slot to update");
  for (const s of included) {
    const d = slots[s];
    const name = s[0].toUpperCase() + s.slice(1);
    if (!d.quality) p.push(`${name}: pick the quality`);
    if (d.enhancement === null) p.push(`${name}: enter Enhancement (+N)`);
    if (d.mastery === null) p.push(`${name}: enter Mastery (0 if none)`);
  }
  return p;
}

export interface ConfirmedGearScan {
  heroDefId: string;
  /** Only the slots the user approved. */
  slots: Partial<Record<GearSlot, SavedGearPiece>>;
}

export function confirmedFromDraft(heroId: string, slots: Record<GearSlot, SlotDraft>, existing?: RowGearLike | null): ConfirmedGearScan {
  const out: ConfirmedGearScan = { heroDefId: heroId, slots: {} };
  for (const slot of GEAR_SLOTS) {
    const d = slots[slot];
    if (!d.include || !d.quality || d.enhancement === null || d.mastery === null) continue;
    const cur = existing?.[slot];
    out.slots[slot] = {
      rarity: d.quality,
      enhancementLevel: d.enhancement,
      masteryLevel: d.mastery,
      masteryStage: d.mastery >= 4 && d.mastery < 20 ? d.stage : 0,
      ...(cur?.priority ? { priority: true } : {}),
    };
  }
  return out;
}

export interface GearMergeRow {
  rowId: string;
  heroDefId: string;
  gear: RowGearLike;
}

/**
 * Writes confirmed scans into the roster. Existing hero → only the approved
 * slots change. Unknown hero → a new row is added via `newRow`.
 */
export function mergeGearScans<R extends GearMergeRow>(
  rows: R[],
  scans: ConfirmedGearScan[],
  newRow: (heroDefId: string) => R
): { rows: R[]; heroesUpdated: number; heroesAdded: number; slotsWritten: number } {
  let next = [...rows];
  let heroesUpdated = 0, heroesAdded = 0, slotsWritten = 0;
  for (const scan of scans) {
    const n = Object.keys(scan.slots).length;
    if (!n) continue;
    const idx = next.findIndex((r) => r.heroDefId === scan.heroDefId);
    if (idx >= 0) {
      next[idx] = { ...next[idx], gear: { ...next[idx].gear, ...scan.slots } };
      heroesUpdated++;
    } else {
      const r = newRow(scan.heroDefId);
      next = [...next, { ...r, gear: { ...r.gear, ...scan.slots } }];
      heroesAdded++;
    }
    slotsWritten += n;
  }
  return { rows: next, heroesUpdated, heroesAdded, slotsWritten };
}
