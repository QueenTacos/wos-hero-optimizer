"use client";

// Equipped Hero Gear editor. Per slot, three SEPARATE progression numbers:
//   Quality (Common … Mythic, Legendary) · Enhancement (+N) · Mastery (Lv, stage)
// plus an optional "Priority" mark for the Top 3 enhancement strategy.
// 2-column grid from 440px (Goggles/Gloves, Belt/Boots); stacked below that so the three
// number fields per slot stay readable.

import { GearRarity, GearSlot, GEAR_SLOTS } from "@/lib/types";
import { GEAR_RARITY_LABELS, GEAR_RARITY_ORDER } from "@/lib/data/gearRarity";
import { GEAR_MAX_LEVEL } from "@/lib/data/gearXpTable";
import { MASTERY_MAX } from "@/lib/data/masteryForgingTable";
import { NumericInput } from "@/components/NumericInput";
import type { SavedGearPiece } from "@/lib/storage/savedState";

export type RowGearPiece = SavedGearPiece;
export type RowGear = Record<GearSlot, RowGearPiece | null>;

export const SLOT_LABELS: Record<GearSlot, string> = { goggles: "Goggles", gloves: "Gloves", belt: "Belt", boots: "Boots" };

export function emptyRowGear(): RowGear {
  return { goggles: null, gloves: null, belt: null, boots: null };
}


export function GearEditor({ gear, onChange, headerAction }: { gear: RowGear; onChange: (g: RowGear) => void; headerAction?: React.ReactNode }) {
  function setSlot(slot: GearSlot, piece: RowGearPiece | null) {
    onChange({ ...gear, [slot]: piece });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 min-h-[26px]">
        <span className="text-xs font-semibold text-slate-300">Hero Gear</span>
        {headerAction}
      </div>
      <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2">
        {GEAR_SLOTS.map((slot) => {
          const p = gear[slot];
          const upd = (patch: Partial<RowGearPiece>) => p && setSlot(slot, { ...p, ...patch });
          const legendary = p?.rarity === "legendary";
          return (
            <div key={slot} className={`rounded-lg border p-2 flex flex-col gap-1.5 ${legendary ? "border-orange-700/70" : "border-slate-700/70"}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{SLOT_LABELS[slot]}</span>
                {p && (
                  <label className={`flex items-center gap-1 text-[11px] ${p.priority ? "text-amber-300" : "text-slate-500"}`} title="Mark as one of the 6 Top 3 priority pieces">
                    <input
                      type="checkbox"
                      className="accent-amber-400"
                      checked={!!p.priority}
                      onChange={(e) => upd({ priority: e.target.checked || undefined })}
                      aria-label={`${SLOT_LABELS[slot]} is a priority piece`}
                    />
                    Priority
                  </label>
                )}
              </div>
              <select
                aria-label={`${SLOT_LABELS[slot]} quality`}
                className={`field w-full ${p ? RARITY_TEXT[p.rarity] : "text-slate-400"}`}
                value={p?.rarity ?? ""}
                onChange={(e) => {
                  const rarity = e.target.value as GearRarity | "";
                  if (!rarity) return setSlot(slot, null);
                  // Changing quality keeps Mastery; enhancement is on a different scale for Legendary, so reset it.
                  const crossesLegendary = p && (p.rarity === "legendary") !== (rarity === "legendary");
                  setSlot(slot, {
                    rarity,
                    enhancementLevel: crossesLegendary ? 0 : p?.enhancementLevel ?? 0,
                    masteryLevel: p?.masteryLevel ?? 0,
                    masteryStage: p?.masteryStage ?? 0,
                    priority: p?.priority,
                  });
                }}
              >
                <option value="">None</option>
                {GEAR_RARITY_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {GEAR_RARITY_LABELS[r]}
                  </option>
                ))}
              </select>

              <div className={`grid grid-cols-3 gap-1 ${p ? "" : "opacity-40"}`}>
                <label className="flex flex-col text-[10px] text-slate-400 gap-0.5" title={legendary ? "Legendary enhancement (its own +0…+100 scale)" : "Enhancement (+0…+100)"}>
                  Enh. +
                  <NumericInput
                    min={0}
                    max={GEAR_MAX_LEVEL}
                    disabled={!p}
                    aria-label={`${SLOT_LABELS[slot]} enhancement`}
                    className="field !px-1.5 !py-1 text-right"
                    value={p?.enhancementLevel ?? 0}
                    onCommit={(enhancementLevel) => upd({ enhancementLevel })}
                  />
                </label>
                <label className="flex flex-col text-[10px] text-slate-400 gap-0.5" title="Mastery Forging level (Essence Stones)">
                  Mastery
                  <NumericInput
                    min={0}
                    max={MASTERY_MAX.level}
                    disabled={!p}
                    aria-label={`${SLOT_LABELS[slot]} mastery level`}
                    className="field !px-1.5 !py-1 text-right"
                    value={p?.masteryLevel ?? 0}
                    onCommit={(lv) => upd({ masteryLevel: lv, masteryStage: lv >= 4 && lv < MASTERY_MAX.level ? p?.masteryStage ?? 0 : 0 })}
                  />
                </label>
                <label className="flex flex-col text-[10px] text-slate-400 gap-0.5" title="Mastery stage (0-4, from Mastery Lv.4)">
                  Stage
                  <select
                    disabled={!p || (p.masteryLevel ?? 0) < 4 || (p.masteryLevel ?? 0) >= MASTERY_MAX.level}
                    aria-label={`${SLOT_LABELS[slot]} mastery stage`}
                    className="field !px-1 !py-1 disabled:opacity-40"
                    value={p?.masteryStage ?? 0}
                    onChange={(e) => upd({ masteryStage: Number(e.target.value) })}
                  >
                    {[0, 1, 2, 3, 4].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {legendary && <div className="text-[10px] text-orange-300/90">Legendary scale — not comparable to Mythic +N</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const RARITY_TEXT: Record<GearRarity, string> = {
  common: "text-slate-200",
  uncommon: "text-green-300",
  rare: "text-sky-300",
  epic: "text-purple-300",
  mythic: "text-amber-300",
  legendary: "text-orange-400",
};
