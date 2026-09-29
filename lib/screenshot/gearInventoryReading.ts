// ============================================================================
// Gear inventory screenshot → item tiles (quality + quantity). Pure.
//
// Slot (Goggles/Gloves/Belt/Boots) is NOT read automatically: no gear icon
// templates exist yet, so the review screen asks the user for each tile's
// slot. Quality comes from the tile's border colour; quantity from the
// number printed on the tile (none printed = 1, flagged for review).
// ============================================================================

import { GearRarity, GearSlot } from "../types";
import { BBox, OcrWord, parseQuantityText } from "./quantityTokens";
import { ScanFieldResult } from "./scanTypes";
import type { FoundTile } from "../../imageRecognition/gearTiles";
import { TILE_COLOUR_CONFIDENCE, TILE_COLOUR_QUALITY } from "../../imageRecognition/gearTiles";

export interface GearInventoryItem {
  id: string;
  box: BBox;
  quality: ScanFieldResult<GearRarity | null>;
  quantity: ScanFieldResult<number>;
  slot: ScanFieldResult<GearSlot | null>;
}

const cx = (b: BBox) => b.x + b.width / 2;
const cy = (b: BBox) => b.y + b.height / 2;

export function readGearInventory(tiles: FoundTile[], words: OcrWord[]): GearInventoryItem[] {
  return tiles
    .filter((t) => t.colour !== "empty")
    .map((t, i) => {
      const colour = t.colour as Exclude<FoundTile["colour"], "empty">;
      // Quantity: a number in the lower half of the tile (the top can hold other labels).
      const nums = words
        .filter((w) => {
          const inside = cx(w.bbox) > t.box.x && cx(w.bbox) < t.box.x + t.box.width && cy(w.bbox) > t.box.y + t.box.height * 0.5 && cy(w.bbox) < t.box.y + t.box.height;
          return inside && parseQuantityText(w.text) !== null;
        })
        .sort((a, b) => b.bbox.x + b.bbox.width - (a.bbox.x + a.bbox.width));
      const q = nums[0] ? parseQuantityText(nums[0].text)! : null;
      return {
        id: `tile-${i}`,
        box: t.box,
        quality: {
          value: TILE_COLOUR_QUALITY[colour],
          confidence: TILE_COLOUR_CONFIDENCE[colour],
          source: `${colour} tile border`,
          warning: colour === "orange" || colour === "red" ? "Mythic vs Legendary is judged by colour — confirm it." : undefined,
        },
        quantity:
          q !== null
            ? { value: q, confidence: Math.min(0.85, nums[0].confidence), source: `“${nums[0].text}”` }
            : { value: 1, confidence: 0.5, source: "no number on the tile", warning: "No count shown — assumed 1." },
        slot: { value: null, confidence: 0, warning: "Choose the slot." },
      };
    });
}

/** Adds reviewed items into per-slot/per-quality counts (only rows the user kept). */
export function countReviewedItems(items: { slot: GearSlot | null; quality: GearRarity | null; quantity: number; include: boolean }[]) {
  const counts: Partial<Record<GearSlot, Partial<Record<GearRarity, number>>>> = {};
  for (const it of items) {
    if (!it.include || !it.slot || !it.quality || it.quantity <= 0) continue;
    const s = (counts[it.slot] ??= {});
    s[it.quality] = (s[it.quality] ?? 0) + it.quantity;
  }
  return counts;
}

export type GearCountApplyMode = "replace" | "add";

/**
 * Applies reviewed counts to the Extra / Unassigned gear grid.
 *   replace — each slot+quality that appears in the scan is set to the scanned count
 *             (re-scanning the same screen never double-counts)
 *   add     — scanned counts are added on top (for items spread over several screens
 *             that you haven't entered yet)
 * Cells not in the scan are never touched.
 */
export function applyGearCounts<T extends Record<GearSlot, Record<GearRarity, number>>>(
  current: T,
  counts: Partial<Record<GearSlot, Partial<Record<GearRarity, number>>>>,
  mode: GearCountApplyMode
): T {
  const next = { ...current };
  for (const slot of Object.keys(counts) as GearSlot[]) {
    const row = { ...next[slot] };
    for (const [q, n] of Object.entries(counts[slot] ?? {}) as [GearRarity, number][]) {
      row[q] = mode === "add" ? (row[q] ?? 0) + n : n;
    }
    next[slot] = row;
  }
  return next;
}
