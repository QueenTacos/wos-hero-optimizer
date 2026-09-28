"use client";

import { GearRarity } from "@/lib/types";
import { GEAR_RARITY_LABELS } from "@/lib/data/gearRarity";

const RARITIES: GearRarity[] = ["common", "uncommon", "rare", "epic", "mythic"];

export function GearRaritySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: GearRarity | null;
  onChange: (v: GearRarity | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label}
      <select
        className="bg-slate-800 rounded px-2 py-1.5 text-sm text-slate-100"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? (e.target.value as GearRarity) : null)}
      >
        <option value="">None</option>
        {RARITIES.map((r) => (
          <option key={r} value={r}>
            {GEAR_RARITY_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  );
}
