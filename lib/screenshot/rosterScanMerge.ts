// ============================================================================
// Merge overlapping roster screenshots into ONE unique, Power-ordered roster.
//
//   screenshot 1 + screenshot 2 + ...
//   → cards (already identified by portrait)
//   → compare each card with heroes already collected
//   → merge duplicates (hero id is the primary key)
//   → one unique roster, powerRank 1..N
//
// A hero can only appear once in a real roster, so two cards with the same
// hero id are the same hero seen twice (screenshots overlap when scrolling).
// Secondary signals — troop icon, stars/tier, level, card order — are used
// to decide how sure we are:
//   • signals agree                → merged silently
//   • signals disagree, both cards
//     confidently identified       → merged, but flagged for review
//   • signals disagree, either card
//     uncertain                    → kept separate and flagged "possible
//                                    duplicate" — the user decides
//
// Ordering: cards keep the order they had in their own screenshot. A new
// screenshot's unseen heroes are inserted next to the heroes it shares with
// earlier screenshots (so uploading page 2 before page 1 still works). A
// screenshot that shares no heroes is appended in upload order, with a note.
// Pure; no browser APIs.
// ============================================================================

import { DetectedScreenshotHero } from "../types";

export interface ScanCardRef {
  /** Stable id: `${shotIndex}:${cardIndex}` */
  key: string;
  shotIndex: number;
  cardIndex: number;
  det: DetectedScreenshotHero;
  /** User's hero choice for this card, if they changed it — overrides detection. */
  heroOverride?: string | null;
}

export interface MergedRosterEntry {
  /** Key of the first card this hero was seen on (stable across re-merges). */
  key: string;
  heroId: string | null;
  /** Best reading among the merged cards (full card beats cut-off, then higher confidence). */
  primary: ScanCardRef;
  sources: ScanCardRef[];
  powerRank: number;
  /** Signals that disagreed between merged cards, in plain language. */
  mergeNotes: string[];
  /** Set when this card MIGHT be the same hero as another entry but wasn't merged. */
  possibleDuplicateOfKey?: string;
}

export interface RosterMergeResult {
  entries: MergedRosterEntry[];
  duplicatesMerged: number;
  notes: string[];
}

const heroOf = (c: ScanCardRef) => (c.heroOverride !== undefined ? c.heroOverride : c.det.candidateHeroId);
const confOf = (c: ScanCardRef) => (c.heroOverride ? 1 : c.det.confidence);

/** Differences between two readings of (supposedly) the same hero. */
export function signalConflicts(a: ScanCardRef, b: ScanCardRef): string[] {
  const out: string[] = [];
  const A = a.det, B = b.det;
  if (A.troopIconDetected && B.troopIconDetected && (A.troopIconConfidence ?? 0) >= 0.5 && (B.troopIconConfidence ?? 0) >= 0.5 && A.troopIconDetected !== B.troopIconDetected) {
    out.push(`troop icon ${A.troopIconDetected} vs ${B.troopIconDetected}`);
  }
  if (!A.partial && !B.partial && A.starsDetected != null && B.starsDetected != null && (A.starsConfidence ?? 0) >= 0.5 && (B.starsConfidence ?? 0) >= 0.5) {
    if (A.starsDetected !== B.starsDetected || (A.starTierDetected ?? 0) !== (B.starTierDetected ?? 0)) {
      out.push(`stars ${A.starsDetected}★+${A.starTierDetected ?? 0} vs ${B.starsDetected}★+${B.starTierDetected ?? 0}`);
    }
  }
  if (A.levelDetected != null && B.levelDetected != null && (A.levelConfidence ?? 0) >= 0.8 && (B.levelConfidence ?? 0) >= 0.8 && A.levelDetected !== B.levelDetected) {
    out.push(`level ${A.levelDetected} vs ${B.levelDetected}`);
  }
  return out;
}

function better(a: ScanCardRef, b: ScanCardRef): ScanCardRef {
  if (!!a.det.partial !== !!b.det.partial) return a.det.partial ? b : a;
  return confOf(b) > confOf(a) ? b : a;
}

const CONFIDENT = 0.8;

export function mergeRosterScans(shots: ScanCardRef[][]): RosterMergeResult {
  const entries: MergedRosterEntry[] = [];
  const notes: string[] = [];
  let duplicatesMerged = 0;

  shots.forEach((cards, shotIndex) => {
    // Decide, for every card of this screenshot, whether it duplicates an existing entry.
    const decisions = cards.map((card) => {
      const id = heroOf(card);
      if (!id) return { card, match: null as MergedRosterEntry | null, possible: null as MergedRosterEntry | null, conflicts: [] as string[] };
      const same = entries.find((e) => e.heroId === id);
      if (!same) return { card, match: null, possible: null, conflicts: [] };
      // Same screenshot can't show a hero twice: one of the two matches is wrong.
      if (same.sources.some((src) => src.shotIndex === card.shotIndex)) {
        return { card, match: null, possible: same, conflicts: ["both cards are in the same screenshot"] };
      }
      const conflicts = signalConflicts(same.primary, card);
      const bothSure = confOf(card) >= CONFIDENT && confOf(same.primary) >= CONFIDENT;
      if (conflicts.length === 0 || bothSure) return { card, match: same, possible: null, conflicts };
      return { card, match: null, possible: same, conflicts };
    });

    const anchors = decisions.filter((d) => d.match);
    if (entries.length > 0 && anchors.length === 0 && cards.length > 0) {
      notes.push(
        `Screenshot ${shotIndex + 1} doesn't share any heroes with the earlier ones, so its heroes were placed after them (upload order). If it belongs higher in the Power list, check the order.`
      );
    }

    // New heroes before the first overlap go just above it; after that, just below the previous card.
    let insertAt = anchors.length ? entries.indexOf(anchors[0].match!) : entries.length;
    const newInThisShot = new Map<string, MergedRosterEntry>();
    for (const d of decisions) {
      if (d.match) {
        const e = d.match;
        e.sources.push(d.card);
        e.primary = better(e.primary, d.card);
        if (d.conflicts.length) e.mergeNotes.push(`Seen twice with different readings (${d.conflicts.join(", ")}). Kept the clearer card — please check.`);
        duplicatesMerged++;
        insertAt = entries.indexOf(e) + 1;
        continue;
      }
      const entry: MergedRosterEntry = {
        key: d.card.key,
        heroId: heroOf(d.card) ?? null,
        primary: d.card,
        sources: [d.card],
        powerRank: 0,
        mergeNotes: [],
      };
      const sameShot = entry.heroId ? newInThisShot.get(entry.heroId) : undefined;
      if (d.possible) {
        entry.possibleDuplicateOfKey = d.possible.key;
        entry.mergeNotes.push(`Possibly the same hero as another card (${d.conflicts.join(", ")}). Not merged because the match is uncertain.`);
      } else if (sameShot) {
        entry.possibleDuplicateOfKey = sameShot.key;
        entry.mergeNotes.push("Another card in the same screenshot was matched to this hero too — one of them is wrong.");
      }
      if (entry.heroId && !sameShot) newInThisShot.set(entry.heroId, entry);
      entries.splice(insertAt, 0, entry);
      insertAt++;
    }
  });

  entries.forEach((e, i) => (e.powerRank = i + 1));
  return { entries, duplicatesMerged, notes };
}

/** Convenience: wrap raw parse results (one array per screenshot) as ScanCardRefs. */
export function toScanCards(shots: DetectedScreenshotHero[][], overrides: Record<string, string | null | undefined> = {}): ScanCardRef[][] {
  return shots.map((dets, shotIndex) =>
    dets.map((det, cardIndex) => {
      const key = `${shotIndex}:${cardIndex}`;
      return { key, shotIndex, cardIndex, det, ...(key in overrides ? { heroOverride: overrides[key] } : {}) };
    })
  );
}
