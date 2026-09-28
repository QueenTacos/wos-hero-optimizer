// ============================================================================
// Local persistence for the Optimize page (roster, gear, inventory, strategy).
//
// Stored in localStorage under SAVE_KEY as { version, ... }. Every load goes
// through migrateSavedState(), which never throws: anything unreadable gives
// null (= empty first-time state), and older shapes are upgraded:
//   • gear pieces without Mastery      → mastery 0 / stage 0
//   • gear without "legendary" column   → legendary: 0 in unassigned gear
//   • enhancementMode "balanced"        → "priority-pieces"
//     enhancementMode "priority"        → "hero-order"
//   • unknown hero ids                  → row dropped
// ============================================================================

import { GEAR_SLOTS, GearRarity, GearSlot, EnhancementMode, LevelingMode, Inventory, emptyInventory } from "../types";
import { GEAR_RARITY_ORDER } from "../data/gearRarity";
import { getHeroDefinition } from "../data/heroDatabase";

export const SAVE_KEY = "wos-hero-optimizer:state";
export const SCHEMA_VERSION = 2;

/** One gear slot as entered on a hero card. */
export interface SavedGearPiece {
  rarity: GearRarity;
  enhancementLevel: number;
  masteryLevel: number;
  masteryStage: number;
  /** User marked this as one of the Top 3 priority pieces. */
  priority?: boolean;
}

export interface SavedRow {
  rowId: string;
  heroDefId: string;
  level: number;
  stars: number;
  gear: Record<GearSlot, SavedGearPiece | null>;
}

export interface SavedStateV2 {
  version: 2;
  rows: SavedRow[];
  inventory: Inventory;
  expTotalDraft: string;
  levelingMode: LevelingMode;
  enhancementMode: EnhancementMode;
  manualMode: boolean;
  manualTop3: boolean;
  top3RowIds: string[];
  /** When this state was last changed by the user (ISO time). */
  savedAt?: string;
}

const num = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function migratePiece(p: unknown): SavedGearPiece | null {
  if (!isObj(p)) return null;
  const rarity = (GEAR_RARITY_ORDER as string[]).includes(String(p.rarity)) ? (p.rarity as GearRarity) : null;
  if (!rarity) return null;
  const mastery = isObj(p.mastery) ? p.mastery : {};
  return {
    rarity,
    enhancementLevel: Math.round(num(p.enhancementLevel, 0, 100, 0)),
    masteryLevel: Math.round(num(p.masteryLevel ?? mastery.level, 0, 20, 0)),
    masteryStage: Math.round(num(p.masteryStage ?? mastery.stage, 0, 4, 0)),
    ...(p.priority === true ? { priority: true } : {}),
  };
}

function migrateInventory(v: unknown): Inventory {
  const inv = emptyInventory();
  if (!isObj(v)) return inv;
  const he = isObj(v.heroExp) ? v.heroExp : {};
  const items = isObj(he.items) ? he.items : {};
  inv.heroExp = {
    mode: he.mode === "total" ? "total" : "items",
    manualTotal: num(he.manualTotal, 0, 1e12, 0),
    items: { exp1k: num(items.exp1k, 0, 1e9, 0), exp5k: num(items.exp5k, 0, 1e9, 0), exp10k: num(items.exp10k, 0, 1e9, 0), exp50k: num(items.exp50k, 0, 1e9, 0) },
  };
  const ec = isObj(v.enhancementComponents) ? v.enhancementComponents : {};
  inv.enhancementComponents = { xp10: num(ec.xp10, 0, 1e9, 0), xp100: num(ec.xp100, 0, 1e9, 0) };
  inv.sacrificedGearXp = num(v.sacrificedGearXp, 0, 1e12, 0);
  inv.essenceStones = num(v.essenceStones, 0, 1e9, 0);
  inv.mithril = num(v.mithril, 0, 1e9, 0);
  const ug = isObj(v.unassignedGear) ? v.unassignedGear : {};
  for (const slot of GEAR_SLOTS) {
    const bySlot = isObj(ug[slot]) ? (ug[slot] as Record<string, unknown>) : {};
    for (const r of GEAR_RARITY_ORDER) inv.unassignedGear[slot][r] = Math.round(num(bySlot[r], 0, 1e6, 0)); // adds "legendary" to old saves
  }
  return inv;
}

/** Upgrades any saved shape to the current one. Returns null for missing/unreadable data. Never throws. */
export function migrateSavedState(raw: unknown): SavedStateV2 | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!isObj(data) || !Array.isArray(data.rows)) return null;
    const rows: SavedRow[] = [];
    for (const r of data.rows) {
      if (!isObj(r) || typeof r.heroDefId !== "string" || !getHeroDefinition(r.heroDefId)) continue;
      const gearIn = isObj(r.gear) ? r.gear : {};
      const gear = {} as SavedRow["gear"];
      for (const slot of GEAR_SLOTS) gear[slot] = migratePiece(gearIn[slot]);
      rows.push({
        rowId: typeof r.rowId === "string" && r.rowId ? r.rowId : Math.random().toString(36).slice(2),
        heroDefId: r.heroDefId,
        level: Math.round(num(r.level, 1, 80, 1)),
        stars: num(r.stars, 0, 5, 0),
        gear,
      });
    }
    const em = data.enhancementMode;
    const enhancementMode: EnhancementMode =
      em === "hero-order" || em === "priority" ? "hero-order" : "priority-pieces"; // v1 "balanced" → priority-pieces
    return {
      version: 2,
      rows,
      inventory: migrateInventory(data.inventory),
      expTotalDraft: typeof data.expTotalDraft === "string" ? data.expTotalDraft : "",
      levelingMode: data.levelingMode === "priority" ? "priority" : "balanced",
      enhancementMode,
      manualMode: data.manualMode === true,
      manualTop3: data.manualTop3 === true,
      top3RowIds: Array.isArray(data.top3RowIds) ? data.top3RowIds.filter((x): x is string => typeof x === "string").slice(0, 3) : [],
      ...(typeof data.savedAt === "string" && Number.isFinite(Date.parse(data.savedAt)) ? { savedAt: data.savedAt } : {}),
    };
  } catch {
    return null;
  }
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function loadSavedState(storage: StorageLike | undefined = safeLocalStorage()): SavedStateV2 | null {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    return raw ? migrateSavedState(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state: Omit<SavedStateV2, "version">, storage: StorageLike | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...state }));
  } catch {
    /* storage full or blocked — the app keeps working without saving */
  }
}

function safeLocalStorage(): StorageLike | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}
