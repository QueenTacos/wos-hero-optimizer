"use client";

// Hero card, in the order the spec asks for (§19):
//   Hero selector → Level → Stars → Hero Gear (Goggles, Gloves, Belt, Boots)

import { HeroSelect, genLabel } from "@/components/HeroSelect";
import { TroopBadge } from "@/components/TroopBadge";
import { GearEditor, RowGear } from "@/components/GearEditor";
import { getHeroDefinition } from "@/lib/data/heroDatabase";
import { HERO_MAX_LEVEL } from "@/lib/data/heroXpTable";
import { TIERS_PER_STAR, fromStarValue, toStarValue } from "@/lib/data/shardTable";

export interface RosterRow {
  rowId: string;
  heroDefId: string;
  level: number;
  /** stars + tier/6, see shardTable.toStarValue */
  stars: number;
  gear: RowGear;
}

export function HeroCard({
  row,
  rank,
  takenIds,
  onChange,
  onRemove,
}: {
  row: RosterRow;
  /** 1-based position in the list; shown when Manual Top 5 is on. */
  rank?: number;
  takenIds: string[];
  onChange: (rowId: string, patch: Partial<RosterRow>) => void;
  onRemove: (rowId: string) => void;
}) {
  const def = row.heroDefId ? getHeroDefinition(row.heroDefId) : undefined;
  const { stars, tier } = fromStarValue(row.stars);

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex gap-2 items-center">
        {rank !== undefined && (
          <span className={`text-xs font-bold w-6 text-center ${rank <= 3 ? "text-amber-300" : rank <= 5 ? "text-blue-300" : "text-slate-500"}`}>
            #{rank}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <HeroSelect value={row.heroDefId} takenIds={takenIds} onChange={(v) => onChange(row.rowId, { heroDefId: v })} />
        </div>
        <button
          onClick={() => onRemove(row.rowId)}
          className="text-red-400 text-xs px-2 py-1 border border-red-900 rounded"
          aria-label={def ? `Remove ${def.name}` : "Remove row"}
        >
          Remove
        </button>
      </div>

      {def && (
        <>
          <div className="flex items-center gap-2 -mt-1">
            <TroopBadge troopType={def.troopType} />
            <span className="text-xs text-slate-400">{genLabel(def.generation)}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Level
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={HERO_MAX_LEVEL}
                className="field"
                value={row.level}
                onChange={(e) => onChange(row.rowId, { level: clampInt(e.target.value, 1, HERO_MAX_LEVEL) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Stars
              <select
                className="field"
                value={stars}
                onChange={(e) => onChange(row.rowId, { stars: toStarValue(Number(e.target.value), tier) })}
              >
                {[0, 1, 2, 3, 4, 5].map((s) => (
                  <option key={s} value={s}>
                    {s}★
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Tier
              <select
                className="field disabled:opacity-40"
                value={tier}
                disabled={stars >= 5}
                onChange={(e) => onChange(row.rowId, { stars: toStarValue(stars, Number(e.target.value)) })}
              >
                {Array.from({ length: TIERS_PER_STAR }, (_, t) => (
                  <option key={t} value={t}>
                    {t}/{TIERS_PER_STAR}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <GearEditor gear={row.gear} onChange={(gear) => onChange(row.rowId, { gear })} />
        </>
      )}
    </div>
  );
}

function clampInt(raw: string, min: number, max: number) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
