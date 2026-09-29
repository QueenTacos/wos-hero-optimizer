"use client";

import { NumericInput } from "@/components/NumericInput";
import { useMemo, useState } from "react";
import { HeroSelect } from "@/components/HeroSelect";
import { TroopBadge } from "@/components/TroopBadge";
import { HeroPortrait } from "@/components/HeroPortrait";
import { getHeroDefinition } from "@/lib/data/heroDatabase";
import { Hero, emptyHeroGear } from "@/lib/types";
import { recommendRallyCaptain, recommendRallyJoiner } from "@/lib/optimizer/bearTrap";

interface Row {
  rowId: string;
  heroDefId: string;
  level: number;
  stars: number;
}

function newRow(): Row {
  return { rowId: Math.random().toString(36).slice(2), heroDefId: "", level: 1, stars: 0 };
}

function toHero(r: Row): Hero | null {
  if (!r.heroDefId) return null;
  const def = getHeroDefinition(r.heroDefId)!;
  return {
    id: r.rowId,
    heroDefId: def.id,
    name: def.name,
    generation: def.generation,
    troopType: def.troopType,
    rarity: def.rarity,
    level: r.level,
    stars: r.stars,
    power: 0,
    roleTags: def.defaultRoleTags,
    gear: emptyHeroGear(),
    sourceConfidence: 1,
  };
}

export default function BearTrapPage() {
  const [mode, setMode] = useState<"captain" | "joiner">("captain");
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow(), newRow(), newRow()]);

  const heroes = useMemo(() => rows.map(toHero).filter((h): h is Hero => h !== null), [rows]);

  const captainResult = mode === "captain" && heroes.length > 0 ? recommendRallyCaptain(heroes) : null;
  const joinerResult = mode === "joiner" && heroes.length > 0 ? recommendRallyJoiner(heroes) : null;

  function updateRow(rowId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex gap-2">
        <button
          className={`flex-1 py-2 rounded-lg text-sm ${mode === "captain" ? "bg-blue-600" : "bg-slate-800"}`}
          onClick={() => setMode("captain")}
        >
          Rally Captain
        </button>
        <button
          className={`flex-1 py-2 rounded-lg text-sm ${mode === "joiner" ? "bg-blue-600" : "bg-slate-800"}`}
          onClick={() => setMode("joiner")}
        >
          Rally Joiner
        </button>
      </div>

      <p className="text-xs text-slate-400">
        {mode === "captain"
          ? "Rally Captain uses 3 heroes whose stats and expedition skills all matter. Add your available heroes below."
          : "Rally Joiner: the far-left hero matters most — known rally-support specialists (Jessie, Jasser, Jeronimo) are prioritized over raw power."}
      </p>

      <section className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.rowId} className="card flex flex-col gap-2">
            <HeroSelect value={row.heroDefId} onChange={(v) => updateRow(row.rowId, { heroDefId: v })} />
            {row.heroDefId && (
              <div className="flex gap-3 items-center text-sm">
                <TroopBadge troopType={getHeroDefinition(row.heroDefId)!.troopType} />
                <label className="flex items-center gap-1">
                  Lv
                  <NumericInput
                    min={1}
                    max={80}
                    className="w-16 bg-slate-800 rounded px-2 py-1"
                    value={row.level}
                    onCommit={(level) => updateRow(row.rowId, { level })}
                  />
                </label>
                <label className="flex items-center gap-1">
                  ★
                  <NumericInput
                    allowDecimal
                    min={0}
                    max={5}
                    className="w-14 bg-slate-800 rounded px-2 py-1"
                    value={row.stars}
                    onCommit={(stars) => updateRow(row.rowId, { stars })}
                  />
                </label>
              </div>
            )}
          </div>
        ))}
        <button onClick={() => setRows((p) => [...p, newRow()])} className="text-sm text-blue-400 border border-blue-900 rounded-lg py-2">
          + Add Hero
        </button>
      </section>

      {captainResult && (
        <div className="card">
          <h3 className="font-semibold mb-2">Recommended Formation</h3>
          {captainResult.formation.map((h, i) => (
            <div key={h.id} className="text-sm py-1 flex items-center gap-2">
              Slot {i + 1}: <HeroPortrait heroId={h.heroDefId} size="sm" decorative /> {h.name} <TroopBadge troopType={h.troopType} />
            </div>
          ))}
          <div className="text-xs text-slate-400 mt-2">
            Troop ratio suggestion: Infantry {Math.round(captainResult.troopRatioSuggestion.Infantry * 100)}% · Lancer{" "}
            {Math.round(captainResult.troopRatioSuggestion.Lancer * 100)}% · Marksman{" "}
            {Math.round(captainResult.troopRatioSuggestion.Marksman * 100)}%
          </div>
          <ul className="text-xs text-slate-300 list-disc pl-4 mt-2 flex flex-col gap-1">
            {captainResult.reasoning.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {joinerResult && (
        <div className="card">
          <h3 className="font-semibold mb-2">Recommended Lineup</h3>
          <div className="text-sm flex items-center gap-2">
            Far-left: <HeroPortrait heroId={joinerResult.farLeftHero.heroDefId} size="sm" decorative /> <span className="font-medium">{joinerResult.farLeftHero.name}</span>{" "}
            <TroopBadge troopType={joinerResult.farLeftHero.troopType} />
          </div>
          {joinerResult.supportingHeroes.map((h) => (
            <div key={h.id} className="text-sm text-slate-300 flex items-center gap-2 mt-1">
              Support: <HeroPortrait heroId={h.heroDefId} size="sm" decorative /> {h.name} <TroopBadge troopType={h.troopType} />
            </div>
          ))}
          <ul className="text-xs text-slate-300 list-disc pl-4 mt-2 flex flex-col gap-1">
            {joinerResult.reasoning.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
