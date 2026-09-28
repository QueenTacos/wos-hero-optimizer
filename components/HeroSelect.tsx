"use client";

// ============================================================================
// Hero selector with portraits. A native <select> can't show images, so this
// is a compact button that opens a searchable, generation-grouped portrait
// grid. Same props as the original <HeroSelect> so callers didn't change.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { getHeroDefinition } from "@/lib/data/heroDatabase";
import { groupHeroesForPicker } from "@/lib/heroPicker";
import { HeroPortrait } from "@/components/HeroPortrait";
import { TroopType } from "@/lib/types";

const TROOPS: TroopType[] = ["Infantry", "Lancer", "Marksman"];

export function genLabel(generation: number) {
  return generation === 0 ? "Base" : `Gen ${generation}`;
}

export function HeroSelect({
  value,
  onChange,
  takenIds = [],
  placeholder = "Select hero…",
}: {
  value: string;
  onChange: (heroDefId: string) => void;
  /** Hero ids already used elsewhere in the roster — shown as "Added". */
  takenIds?: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const def = value ? getHeroDefinition(value) : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-left text-sm"
        aria-haspopup="dialog"
      >
        {def ? (
          <>
            <HeroPortrait heroId={def.id} size="md" showTroopRing decorative />
            <span className="flex-1 min-w-0">
              <span className="block font-medium truncate">{def.name}</span>
              <span className="block text-[11px] text-slate-400">
                {genLabel(def.generation)} · {def.troopType}
              </span>
            </span>
          </>
        ) : (
          <>
            <HeroPortrait heroId={null} size="md" decorative />
            <span className="flex-1 text-slate-400">{placeholder}</span>
          </>
        )}
        <span aria-hidden className="text-slate-500 text-xs">▼</span>
      </button>

      {open && (
        <HeroPickerSheet
          value={value}
          takenIds={takenIds}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Alias matching the component name used in the project package spec. */
export const HeroSelector = HeroSelect;

export function HeroPickerSheet({
  value,
  takenIds = [],
  onPick,
  onClose,
  title = "Choose a hero",
}: {
  value?: string;
  takenIds?: string[];
  onPick: (heroDefId: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const [troop, setTroop] = useState<TroopType | "all">("all");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Base → Gen 1 → … → Gen 17, for every filter and search (see lib/heroPicker.ts).
  const groups = useMemo(() => groupHeroesForPicker({ query, troop }), [query, troop]);

  const taken = new Set(takenIds);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-w-xl w-full mx-auto px-4 pt-4 pb-2 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-sm text-slate-300 px-3 py-1 border border-slate-700 rounded-lg">
            Close
          </button>
        </div>
        <input
          ref={searchRef}
          type="search"
          placeholder="Search by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <div className="flex gap-1.5">
          {(["all", ...TROOPS] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTroop(t)}
              className={`flex-1 text-xs py-1.5 rounded-lg border ${
                troop === t ? "bg-blue-600 border-blue-600" : "border-slate-700 text-slate-300"
              }`}
            >
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-xl mx-auto px-4 pb-8 flex flex-col gap-4">
          {groups.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No heroes match “{query}”.</p>}
          {groups.map(([gen, heroes]) => (
            <section key={gen}>
              <h3 className="text-xs font-semibold text-slate-400 mb-2">{genLabel(gen)}</h3>
              <div className="grid grid-cols-4 gap-2">
                {heroes.map((h) => {
                  const selected = h.id === value;
                  const isTaken = taken.has(h.id) && !selected;
                  return (
                    <button
                      key={h.id}
                      onClick={() => onPick(h.id)}
                      className={`flex flex-col items-center gap-1 rounded-lg p-1.5 border ${
                        selected ? "border-blue-500 bg-blue-500/15" : "border-transparent hover:bg-slate-800"
                      } ${isTaken ? "opacity-50" : ""}`}
                      aria-pressed={selected}
                    >
                      <HeroPortrait heroId={h.id} size="lg" showTroopRing decorative />
                      <span className="text-[11px] leading-tight text-center line-clamp-2">{h.name}</span>
                      {isTaken && <span className="text-[10px] text-slate-400 -mt-0.5">Added</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
