"use client";

import { GearSlot, GearRarity, UnassignedGearInventory, GEAR_SLOTS } from "@/lib/types";
import { GEAR_RARITY_LABELS, GEAR_RARITY_ORDER } from "@/lib/data/gearRarity";

// Common … Mythic, Legendary. Mythic counts double as spare Mythic gear material.
const RARITIES: GearRarity[] = GEAR_RARITY_ORDER;
const SLOT_LABELS: Record<GearSlot, string> = { goggles: "Goggles", gloves: "Gloves", belt: "Belt", boots: "Boots" };

export function UnassignedGearGrid({
  value,
  onChange,
}: {
  value: UnassignedGearInventory;
  onChange: (v: UnassignedGearInventory) => void;
}) {
  function setCell(slot: GearSlot, rarity: GearRarity, qty: number) {
    onChange({ ...value, [slot]: { ...value[slot], [rarity]: Math.max(0, qty) } });
  }

  return (
    <div className="card">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400">
              <th className="text-left font-normal pb-2">Slot</th>
              {RARITIES.map((r) => (
                <th key={r} className="font-normal pb-2 px-1">
                  {GEAR_RARITY_LABELS[r].slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GEAR_SLOTS.map((slot) => (
              <tr key={slot}>
                <td className="py-1 pr-2 text-slate-300">{SLOT_LABELS[slot]}</td>
                {RARITIES.map((rarity) => (
                  <td key={rarity} className="py-1 px-1">
                    <input
                      type="number"
                      min={0}
                      className="field w-12 !px-1 text-center"
                      value={value[slot][rarity]}
                      onChange={(e) => setCell(slot, rarity, Number(e.target.value))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
