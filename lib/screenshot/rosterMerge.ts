// Merging user-CONFIRMED roster scan results into the hero list. Pure.
// Only called after the Review screen; never with raw detections.

export interface ConfirmedRosterEntry {
  heroDefId: string;
  level: number;
  /** stars + tier/6 */
  stars: number;
  powerRank: number;
}

export interface MergeableRow {
  rowId: string;
  heroDefId: string;
  level: number;
  stars: number;
}

/**
 * - Hero already listed → update its level and stars (gear is left alone).
 * - New hero → fills the first empty row, else is appended.
 * - Duplicate heroes in `entries` → only the first (highest Power) is used.
 * Returns the new rows plus counts for the confirmation message.
 */
export function mergeRosterEntries<R extends MergeableRow>(
  rows: R[],
  entries: ConfirmedRosterEntry[],
  makeRow: () => R
): { rows: R[]; added: number; updated: number; duplicatesIgnored: number } {
  const next = rows.map((r) => ({ ...r }));
  let added = 0, updated = 0, duplicatesIgnored = 0;
  const seen = new Set<string>();

  for (const e of [...entries].sort((a, b) => a.powerRank - b.powerRank)) {
    if (seen.has(e.heroDefId)) {
      duplicatesIgnored++;
      continue;
    }
    seen.add(e.heroDefId);
    const existing = next.find((r) => r.heroDefId === e.heroDefId);
    if (existing) {
      existing.level = e.level;
      existing.stars = e.stars;
      updated++;
      continue;
    }
    const empty = next.find((r) => !r.heroDefId);
    if (empty) {
      empty.heroDefId = e.heroDefId;
      empty.level = e.level;
      empty.stars = e.stars;
    } else {
      next.push({ ...makeRow(), heroDefId: e.heroDefId, level: e.level, stars: e.stars });
    }
    added++;
  }
  return { rows: next, added, updated, duplicatesIgnored };
}
