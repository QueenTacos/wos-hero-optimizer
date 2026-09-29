"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { HeroCard, RosterRow } from "@/components/HeroCard";
import { emptyRowGear } from "@/components/GearEditor";
import { HeroPortrait } from "@/components/HeroPortrait";
import { NumericInput } from "@/components/NumericInput";
import { HeroPickerSheet } from "@/components/HeroSelect";
import { OptimizationResults } from "@/components/OptimizationResults";
import { UnassignedGearGrid } from "@/components/UnassignedGearGrid";
import { ScanButton, ScanDetected } from "@/components/ScanButton";
import { ConfirmedRosterEntry, mergeRosterEntries } from "@/lib/screenshot/rosterMerge";
import { applyConfirmedValues } from "@/lib/screenshot/targets";
import { mergeGearScans, RowGearLike } from "@/lib/screenshot/gearScanApply";
import { getHeroDefinition } from "@/lib/data/heroDatabase";
import { getAvailableHeroExp, getAvailableEnhancementXp, parseExpInput, spareMythicGearBySlot, spareMythicGearCount } from "@/lib/utils/inventory";
import { loadSavedState, saveState, SavedStateV2 } from "@/lib/storage/savedState";
import { runOptimization } from "@/lib/optimizer/runOptimization";
import { Hero, Inventory, LevelingMode, EnhancementMode, GEAR_SLOTS, emptyHeroGear, emptyInventory } from "@/lib/types";

function newRow(heroDefId = ""): RosterRow {
  return { rowId: Math.random().toString(36).slice(2), heroDefId, level: 1, stars: 0, gear: emptyRowGear() };
}

function rowsToHeroes(rows: RosterRow[]): Hero[] {
  return rows
    .filter((r) => r.heroDefId && getHeroDefinition(r.heroDefId))
    .map((r) => {
      const def = getHeroDefinition(r.heroDefId)!;
      const gear = emptyHeroGear();
      for (const slot of GEAR_SLOTS) {
        const piece = r.gear[slot];
        if (piece) {
          gear[slot] = {
            slot,
            rarity: piece.rarity,
            enhancementLevel: piece.enhancementLevel,
            mastery: { level: piece.masteryLevel ?? 0, stage: piece.masteryStage ?? 0 },
            ...(piece.priority ? { priority: true } : {}),
          };
        }
      }
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
        gear,
        sourceConfidence: 1,
      };
    });
}

export default function OptimizePage() {
  // First visit: no heroes. Saved data (if any) is loaded after mount — see the effect below.
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [inventory, setInventory] = useState<Inventory>(emptyInventory);
  const [expTotalDraft, setExpTotalDraft] = useState("");
  const [levelingMode, setLevelingMode] = useState<LevelingMode>("balanced");
  const [enhancementMode, setEnhancementMode] = useState<EnhancementMode>("priority-pieces");
  const [manualMode, setManualMode] = useState(false);
  const [manualTop3, setManualTop3] = useState(false);
  const [top3RowIds, setTop3RowIds] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<string | undefined>(undefined);
  /** true while the next state change comes from loading a save (not an edit) — don't re-stamp it. */
  const loadingSave = useRef(true);
  const [rosterNotice, setRosterNotice] = useState<string | null>(null);

  const heroes = useMemo(() => rowsToHeroes(rows), [rows]);
  const heroExpTotal = getAvailableHeroExp(inventory);
  const enhancementTotal = getAvailableEnhancementXp(inventory);

  // Apply a saved state without treating it as a new edit.
  const applySaved = useCallback((saved: SavedStateV2) => {
    loadingSave.current = true;
    setRows(saved.rows);
    setInventory(saved.inventory);
    setExpTotalDraft(saved.expTotalDraft);
    setLevelingMode(saved.levelingMode);
    setEnhancementMode(saved.enhancementMode);
    setManualMode(saved.manualMode);
    setManualTop3(saved.manualTop3);
    setTop3RowIds(saved.top3RowIds);
    setSavedAt(saved.savedAt);
    setShowResults(false);
  }, []);

  // Load this device's save once (localStorage, migrated to the current schema).
  useEffect(() => {
    const saved = loadSavedState();
    if (saved) applySaved(saved);
    setHydrated(true);
  }, [applySaved]);

  // Save on every change. Real edits get a new savedAt; loading a save keeps its own.
  useEffect(() => {
    if (!hydrated) return;
    let at = savedAt;
    if (loadingSave.current) loadingSave.current = false;
    else {
      at = new Date().toISOString();
      setSavedAt(at);
    }
    saveState({ rows, inventory, expTotalDraft, levelingMode, enhancementMode, manualMode, manualTop3, top3RowIds, savedAt: at });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, rows, inventory, expTotalDraft, levelingMode, enhancementMode, manualMode, manualTop3, top3RowIds]);

  const result = useMemo(() => {
    if (!showResults || heroes.length === 0) return null;
    const manualTop5Ids = manualMode ? heroes.map((h) => h.id).slice(0, 5) : undefined;
    const manualTop3Ids = manualMode && manualTop3 && top3RowIds.length === 3 ? top3RowIds : undefined;
    return runOptimization(heroes, inventory, { levelingMode, enhancementMode, manualTop5Ids, manualTop3Ids });
  }, [showResults, heroes, inventory, levelingMode, enhancementMode, manualMode, manualTop3, top3RowIds]);

  const top5Candidates = heroes.slice(0, 5);
  const takenDefIds = rows.map((r) => r.heroDefId).filter(Boolean);

  function updateRow(rowId: string, patch: Partial<RosterRow>) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
    setShowResults(false);
  }
  function applyRosterScan(entries: ConfirmedRosterEntry[]) {
    const res = mergeRosterEntries(rows, entries, newRow);
    setRows(res.rows);
    setShowResults(false);
    const parts = [
      res.added && `${res.added} added`,
      res.updated && `${res.updated} updated (level & stars)`,
      res.duplicatesIgnored && `${res.duplicatesIgnored} duplicate${res.duplicatesIgnored > 1 ? "s" : ""} ignored`,
    ].filter(Boolean);
    setRosterNotice(`Roster scan: ${parts.join(", ")}. Gear isn't read from roster screenshots — add it on each card.`);
  }

  function toggleTop3(rowId: string) {
    setTop3RowIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : prev.length < 3 ? [...prev, rowId] : prev
    );
    setShowResults(false);
  }
  /** Every scanner lands here, only after its review step was confirmed. */
  function applyDetected(d: ScanDetected) {
    setShowResults(false);
    switch (d.type) {
      case "hero-roster":
        return applyRosterScan(d.entries);
      case "hero-gear": {
        const res = mergeGearScans(rows, d.scans, newRow);
        setRows(res.rows);
        setRosterNotice(
          `Gear scan: ${res.slotsWritten} slot${res.slotsWritten === 1 ? "" : "s"} updated` +
            (res.heroesAdded ? `, ${res.heroesAdded} hero${res.heroesAdded > 1 ? "es" : ""} added (set their level and stars)` : "") +
            "."
        );
        return;
      }
      case "resource":
        setInventory((prev) => applyConfirmedValues(prev, d.target, d.values));
        if (d.target === "hero_exp_total" && d.values.total != null) setExpTotalDraft(String(d.values.total));
        return;
      case "gear-inventory":
        setInventory((prev) => ({ ...prev, unassignedGear: d.unassignedGear }));
        return;
    }
  }
  const gearByHero = useMemo(() => {
    const m: Record<string, RowGearLike> = {};
    for (const r of rows) if (r.heroDefId) m[r.heroDefId] = r.gear;
    return m;
  }, [rows]);

  function addHero(heroDefId: string) {
    setRows((prev) => [...prev, newRow(heroDefId)]);
    setPickerOpen(false);
    setShowResults(false);
  }
  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
    setTop3RowIds((prev) => prev.filter((id) => id !== rowId));
    setShowResults(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeader title="1. Your Heroes">
          <ScanButton scanType="hero-roster" onDetected={applyDetected} />
          <ScanButton scanType="hero-gear" onDetected={applyDetected} existingGear={gearByHero} />
        </SectionHeader>
        {rosterNotice && (
          <div className="card !py-2 mb-3 text-xs text-green-200 border border-green-900 flex justify-between gap-2">
            <span>{rosterNotice}</span>
            <button onClick={() => setRosterNotice(null)} className="text-slate-400" aria-label="Dismiss">✕</button>
          </div>
        )}
        <p className="text-xs text-slate-400 mb-3">
          Add every hero you want considered, with their currently equipped gear and its enhancement level — the
          optimizer needs to know exactly what's assigned before recommending upgrades.
        </p>
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <HeroCard
              key={row.rowId}
              row={row}
              rank={manualMode && row.heroDefId ? heroes.findIndex((h) => h.id === row.rowId) + 1 : undefined}
              takenIds={takenDefIds.filter((id) => id !== row.heroDefId)}
              onChange={updateRow}
              onRemove={removeRow}
              gearScan={
                row.heroDefId ? (
                  <ScanButton scanType="hero-gear" size="sm" heroId={row.heroDefId} existingGear={gearByHero} onDetected={applyDetected} />
                ) : undefined
              }
            />
          ))}
          <button onClick={() => setPickerOpen(true)} className="text-sm text-blue-400 border border-blue-900 rounded-lg py-2">
            + Add Hero
          </button>
        </div>
      </section>

      <section>
        <SectionHeader title="2. Hero EXP">
          <ScanButton
            scanType="hero-exp"
            heroExpMode={inventory.heroExp.mode === "items" && getAvailableHeroExp(inventory) > 0 ? "items" : "total"}
            onDetected={applyDetected}
          />
        </SectionHeader>
        <div className="card flex gap-2 mb-2">
          <button
            className={`flex-1 py-2 rounded-lg text-sm ${inventory.heroExp.mode === "total" ? "bg-blue-600" : "bg-slate-800"}`}
            onClick={() => setInventory((p) => ({ ...p, heroExp: { ...p.heroExp, mode: "total" } }))}
          >
            Total EXP
          </button>
          <button
            className={`flex-1 py-2 rounded-lg text-sm ${inventory.heroExp.mode === "items" ? "bg-blue-600" : "bg-slate-800"}`}
            onClick={() => setInventory((p) => ({ ...p, heroExp: { ...p.heroExp, mode: "items" } }))}
          >
            EXP Items
          </button>
        </div>

        {inventory.heroExp.mode === "total" ? (
          <div className="card">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Total Hero EXP (accepts 750k, 3.6m, or a raw number)
              <input
                className="field"
                placeholder="e.g. 3.6m"
                value={expTotalDraft}
                onChange={(e) => {
                  setExpTotalDraft(e.target.value);
                  const parsed = parseExpInput(e.target.value);
                  setInventory((p) => ({ ...p, heroExp: { ...p.heroExp, manualTotal: parsed } }));
                }}
              />
            </label>
          </div>
        ) : (
          <div className="card grid grid-cols-2 gap-3">
            <InventoryField
              label="1K EXP items"
              value={inventory.heroExp.items.exp1k}
              onChange={(v) => setInventory((p) => ({ ...p, heroExp: { ...p.heroExp, items: { ...p.heroExp.items, exp1k: v } } }))}
            />
            <InventoryField
              label="5K EXP items"
              value={inventory.heroExp.items.exp5k}
              onChange={(v) => setInventory((p) => ({ ...p, heroExp: { ...p.heroExp, items: { ...p.heroExp.items, exp5k: v } } }))}
            />
            <InventoryField
              label="10K EXP items"
              value={inventory.heroExp.items.exp10k}
              onChange={(v) => setInventory((p) => ({ ...p, heroExp: { ...p.heroExp, items: { ...p.heroExp.items, exp10k: v } } }))}
            />
            <InventoryField
              label="50K EXP items"
              value={inventory.heroExp.items.exp50k}
              onChange={(v) => setInventory((p) => ({ ...p, heroExp: { ...p.heroExp, items: { ...p.heroExp.items, exp50k: v } } }))}
            />
          </div>
        )}
        <p className="text-xs text-slate-400 mt-1">Calculated: {heroExpTotal.toLocaleString()} EXP</p>
      </section>

      <section>
        <SectionHeader title="3. Hero Gear Enhancement">
          <ScanButton scanType="enhancement-components" onDetected={applyDetected} />
        </SectionHeader>
        <div className="card grid grid-cols-2 gap-3">
          <InventoryField
            label="10 XP components"
            value={inventory.enhancementComponents.xp10}
            onChange={(v) => setInventory((p) => ({ ...p, enhancementComponents: { ...p.enhancementComponents, xp10: v } }))}
          />
          <InventoryField
            label="100 XP components"
            value={inventory.enhancementComponents.xp100}
            onChange={(v) => setInventory((p) => ({ ...p, enhancementComponents: { ...p.enhancementComponents, xp100: v } }))}
          />
          <InventoryField
            label="Sacrificed gear XP (optional)"
            value={inventory.sacrificedGearXp ?? 0}
            onChange={(v) => setInventory((p) => ({ ...p, sacrificedGearXp: v }))}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Calculated: {enhancementTotal.toLocaleString()} Enhancement XP · Top 3 only. Mark up to 6 priority pieces on the
          hero cards (2 per hero), or leave them unmarked and each hero's 2 most-progressed pieces are used.
        </p>
      </section>

      <section>
        <SectionHeader title="4. Extra / Unassigned Hero Gear">
          <ScanButton scanType="extra-gear" unassignedGear={inventory.unassignedGear} onDetected={applyDetected} />
        </SectionHeader>
        <p className="text-xs text-slate-400 mb-2">
          Gear you own but haven't equipped yet. Kept separate from gear already on a hero card above — nothing is
          double-counted.
        </p>
        <UnassignedGearGrid
          value={inventory.unassignedGear}
          onChange={(v) => setInventory((p) => ({ ...p, unassignedGear: v }))}
        />
      </section>

      <section>
        <h2 className="font-semibold mb-2">5. Mastery &amp; Legendary Resources</h2>
        <div className="card grid grid-cols-2 gap-3">
          <InventoryField
            label="Essence Stones"
            value={inventory.essenceStones}
            onChange={(v) => setInventory((p) => ({ ...p, essenceStones: v }))}
            action={<ScanButton scanType="essence-stones" size="sm" onDetected={applyDetected} />}
          />
          <InventoryField
            label="Mithril"
            value={inventory.mithril}
            onChange={(v) => setInventory((p) => ({ ...p, mithril: v }))}
            action={<ScanButton scanType="mithril" size="sm" onDetected={applyDetected} />}
          />
          <div className="col-span-2 flex flex-col gap-1 text-xs text-slate-400">
            <div className="flex items-center justify-between gap-2">
              <span>Spare Mythic Gear: {spareMythicGearCount(inventory.unassignedGear)}</span>
              <ScanButton scanType="mythic-gear" size="sm" unassignedGear={inventory.unassignedGear} onDetected={applyDetected} />
            </div>
            <span className="text-[11px]">
              {(() => {
                const b = spareMythicGearBySlot(inventory.unassignedGear);
                return `Goggles ${b.goggles} · Gloves ${b.gloves} · Belt ${b.belt} · Boots ${b.boots} — the Mythic column of Extra Gear above. Edit it there.`;
              })()}
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Essence Stones → Mastery Forging. Mithril → Legendary thresholds. Spare Mythic gear (counted after re-equipping)
          → ascension, Legendary thresholds and Mastery 11+. None of these are Enhancement XP.
        </p>
      </section>

      <section>
        <h2 className="font-semibold mb-2">6. Strategy</h2>
        <div className="card flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span>Hero EXP mode</span>
            <select className="field max-w-full" value={levelingMode} onChange={(e) => setLevelingMode(e.target.value as LevelingMode)}>
              <option value="balanced">Balanced Top 5</option>
              <option value="priority">Priority (Hero #1 first)</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span>Gear Enhancement mode</span>
            <select className="field max-w-full" value={enhancementMode} onChange={(e) => setEnhancementMode(e.target.value as EnhancementMode)}>
              <option value="priority-pieces">Priority pieces first (recommended)</option>
              <option value="hero-order">Hero #1 first</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={manualMode}
              onChange={(e) => {
                setManualMode(e.target.checked);
                setShowResults(false);
              }}
            />
            Manual Top 5 (the first 5 heroes listed above, in that order)
          </label>
          {manualMode && (
            <div className="flex flex-col gap-2 pl-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={manualTop3}
                  onChange={(e) => {
                    setManualTop3(e.target.checked);
                    setShowResults(false);
                  }}
                />
                Manual Top 3 (pick 3 of your Top 5 for Enhancement Components)
              </label>
              {manualTop3 && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {top5Candidates.map((h) => {
                      const on = top3RowIds.includes(h.id);
                      return (
                        <button
                          key={h.id}
                          onClick={() => toggleTop3(h.id)}
                          aria-pressed={on}
                          className={`flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-xs border ${
                            on ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-slate-700 text-slate-300"
                          }`}
                        >
                          <HeroPortrait heroId={h.heroDefId} size="xs" decorative />
                          {h.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400">
                    {top3RowIds.filter((id) => top5Candidates.some((h) => h.id === id)).length}/3 selected
                    {top3RowIds.length !== 3 && " — until 3 are picked, the first 3 of your Top 5 are used."}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <button
        onClick={() => setShowResults(true)}
        disabled={heroes.length === 0}
        className="bg-blue-600 disabled:bg-slate-700 rounded-xl py-3 font-semibold"
      >
        Run Optimization
      </button>

      {result && (
        <div id="optimization-results" className="scroll-mt-4">
          <OptimizationResults result={result} />
        </div>
      )}

      {pickerOpen && (
        <HeroPickerSheet
          title="Add a hero"
          takenIds={takenDefIds}
          onPick={addHero}
          onClose={() => setPickerOpen(false)}
        />
      )}

    </div>
  );
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
      <h2 className="font-semibold">{title}</h2>
      {children && <div className="flex items-center gap-2 flex-wrap justify-end">{children}</div>}
    </div>
  );
}

function InventoryField({ label, value, onChange, action }: { label: string; value: number; onChange: (v: number) => void; action?: React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-xs text-slate-400">
      <div className="flex items-center justify-between gap-1 min-h-[26px]">
        <label htmlFor={id}>{label}</label>
        {action}
      </div>
      <NumericInput id={id} className="field" min={0} value={value} onCommit={onChange} />
    </div>
  );
}
