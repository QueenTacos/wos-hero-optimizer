"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeroCard, RosterRow } from "@/components/HeroCard";
import { emptyRowGear } from "@/components/GearEditor";
import { HeroPortrait } from "@/components/HeroPortrait";
import { HeroPickerSheet } from "@/components/HeroSelect";
import { OptimizationResults } from "@/components/OptimizationResults";
import { UnassignedGearGrid } from "@/components/UnassignedGearGrid";
import { ScreenshotImport } from "@/components/ScreenshotImport";
import { RosterScanReview } from "@/components/RosterScanReview";
import { ConfirmedRosterEntry, mergeRosterEntries } from "@/lib/screenshot/rosterMerge";
import { applyConfirmedValues, ScreenshotTarget } from "@/lib/screenshot/targets";
import { getHeroDefinition } from "@/lib/data/heroDatabase";
import { getAvailableHeroExp, getAvailableEnhancementXp, parseExpInput, spareMythicGearCount } from "@/lib/utils/inventory";
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
  const [scanTarget, setScanTarget] = useState<ScreenshotTarget | null>(null);
  const [rosterScanOpen, setRosterScanOpen] = useState(false);
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
    setRosterScanOpen(false);
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
  function applyScan(target: ScreenshotTarget, values: Record<string, number | null>) {
    setInventory((prev) => applyConfirmedValues(prev, target, values));
    if (target === "hero_exp_total" && values.total != null) setExpTotalDraft(String(values.total));
    setScanTarget(null);
    setShowResults(false);
  }

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
        <SectionHeader title="1. Your Heroes" onScan={() => setRosterScanOpen(true)} label="Scan roster" />
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
            />
          ))}
          <button onClick={() => setPickerOpen(true)} className="text-sm text-blue-400 border border-blue-900 rounded-lg py-2">
            + Add Hero
          </button>
        </div>
      </section>

      <section>
        <SectionHeader
          title="2. Hero EXP"
          onScan={() => setScanTarget(inventory.heroExp.mode === "items" && getAvailableHeroExp(inventory) > 0 ? "hero_exp_items" : "hero_exp_total")}
        />
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
        <SectionHeader title="3. Hero Gear Enhancement" onScan={() => setScanTarget("enhancement_components")} />
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
        <h2 className="font-semibold mb-2">4. Extra / Unassigned Hero Gear</h2>
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
          />
          <InventoryField
            label="Mithril"
            value={inventory.mithril}
            onChange={(v) => setInventory((p) => ({ ...p, mithril: v }))}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Essence Stones → Mastery Forging. Mithril → Legendary thresholds. Spare Mythic gear (from the unassigned
          gear above, after re-equipping): {spareMythicGearCount(inventory.unassignedGear)} — used for ascension, Legendary
          thresholds and Mastery 11+. None of these are Enhancement XP.
        </p>
      </section>

      <section>
        <h2 className="font-semibold mb-2">6. Strategy</h2>
        <div className="card flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Hero EXP mode</span>
            <select className="field" value={levelingMode} onChange={(e) => setLevelingMode(e.target.value as LevelingMode)}>
              <option value="balanced">Balanced Top 5</option>
              <option value="priority">Priority (Hero #1 first)</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span>Gear Enhancement mode</span>
            <select className="field" value={enhancementMode} onChange={(e) => setEnhancementMode(e.target.value as EnhancementMode)}>
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

      {rosterScanOpen && <RosterScanReview onConfirm={applyRosterScan} onClose={() => setRosterScanOpen(false)} />}

      {scanTarget && (
        <ScreenshotImport
          key={scanTarget}
          target={scanTarget}
          alternativeTargets={
            scanTarget === "hero_exp_total" ? ["hero_exp_items"] : scanTarget === "hero_exp_items" ? ["hero_exp_total"] : []
          }
          onConfirm={(values, t) => applyScan(t, values)}
          onClose={() => setScanTarget(null)}
        />
      )}
    </div>
  );
}

function SectionHeader({ title, onScan, label = "Scan screenshot" }: { title: string; onScan: () => void; label?: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="font-semibold">{title}</h2>
      <button onClick={onScan} className="text-xs text-blue-300 border border-blue-900 rounded-lg px-3 py-1.5">
        {label}
      </button>
    </div>
  );
}

function InventoryField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label}
      <input
        type="number"
        min={0}
        className="field"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
      />
    </label>
  );
}
