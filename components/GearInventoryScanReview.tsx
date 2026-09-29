"use client";

// ============================================================================
// Gear inventory screenshots → review → counts for Extra / Unassigned Gear
// (and spare Mythic Gear, which is the Mythic column of the same grid).
//
// Each complete item tile found becomes a row: quality (from tile colour),
// quantity (number on the tile) and slot (chosen by you — not recognised
// yet). Nothing is applied until you confirm, and only rows left ticked count.
// ============================================================================

import { useMemo, useState } from "react";
import { GearRarity, GearSlot, GEAR_SLOTS, UnassignedGearInventory } from "@/lib/types";
import { GEAR_RARITY_LABELS, GEAR_RARITY_ORDER } from "@/lib/data/gearRarity";
import { getSharedOcrEngine } from "@/imageRecognition/tesseractOcr";
import { createGearInventoryParser } from "@/screenshotParser/gearParser";
import { GearCountApplyMode, GearInventoryItem, applyGearCounts, countReviewedItems } from "@/lib/screenshot/gearInventoryReading";
import { initialReviewValue } from "@/lib/screenshot/scanTypes";
import { ScreenshotPicker } from "@/components/ScreenshotPicker";
import { NumericInput } from "@/components/NumericInput";
import { RARITY_TEXT, SLOT_LABELS } from "@/components/GearEditor";
import { ConfidenceChip, ProgressBar, ScanSheet, TokenOverlay, UseDetected } from "@/components/ScanReviewBits";

interface RowDraft {
  key: string;
  n: number;
  read: GearInventoryItem;
  include: boolean;
  slot: GearSlot | "";
  quality: GearRarity | "";
  quantity: number | null;
}
interface Shot {
  id: string;
  url: string;
  size: { width: number; height: number };
  rows: RowDraft[];
  warnings: string[];
}

export function GearInventoryScanReview({
  mythicOnly = false,
  current,
  onConfirm,
  onClose,
}: {
  /** Spare Mythic Gear scan: only Mythic tiles are ticked by default. */
  mythicOnly?: boolean;
  current: UnassignedGearInventory;
  onConfirm: (next: UnassignedGearInventory, summary: string) => void;
  onClose: () => void;
}) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState<{ label: string; p: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<GearCountApplyMode>("replace");
  const [checked, setChecked] = useState(false);

  async function addFiles(files: File[]) {
    setError(null);
    const parser = createGearInventoryParser(getSharedOcrEngine());
    let n = shots.reduce((s, x) => s + x.rows.length, 0);
    for (const [i, file] of files.entries()) {
      const url = URL.createObjectURL(file);
      try {
        const res = await parser.parse(file, { onProgress: (p, stage) => setBusy({ label: files.length > 1 ? `${stage} (${i + 1}/${files.length})` : stage, p }) });
        const rows: RowDraft[] = res.items.map((it) => {
          const quality = initialReviewValue(it.quality) ?? "";
          return {
            key: `${url}-${it.id}`,
            n: ++n,
            read: it,
            include: mythicOnly ? quality === "mythic" : true,
            slot: "",
            quality,
            quantity: initialReviewValue(it.quantity),
          };
        });
        setShots((prev) => [...prev, { id: url, url, size: res.size, rows, warnings: res.warnings }]);
      } catch (e) {
        console.error(e);
        URL.revokeObjectURL(url);
        setError("Something went wrong reading that image. Try another screenshot, or enter the gear by hand.");
      }
    }
    setBusy(null);
    setChecked(false);
  }

  function update(shotId: string, key: string, patch: Partial<RowDraft>) {
    setShots((prev) => prev.map((s) => (s.id === shotId ? { ...s, rows: s.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) } : s)));
    setChecked(false);
  }

  const all = shots.flatMap((s) => s.rows);
  const kept = all.filter((r) => r.include);
  const problems = kept.filter((r) => !r.slot || !r.quality || r.quantity === null).length;
  const counts = useMemo(
    () => countReviewedItems(kept.map((r) => ({ slot: r.slot || null, quality: r.quality || null, quantity: r.quantity ?? 0, include: true }))),
    [kept]
  );
  const next = useMemo(() => applyGearCounts(current, counts, mode), [current, counts, mode]);
  const changes = GEAR_SLOTS.flatMap((slot) =>
    GEAR_RARITY_ORDER.filter((q) => counts[slot]?.[q] !== undefined).map((q) => ({ slot, q, from: current[slot][q], to: next[slot][q] }))
  );

  return (
    <ScanSheet
      title={mythicOnly ? "Scan spare Mythic Gear" : "Scan gear inventory"}
      onClose={onClose}
      footer={
        <>
          {all.length > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={checked} disabled={problems > 0 || kept.length === 0} onChange={(e) => setChecked(e.target.checked)} />
              <span>
                I've checked these items.
                {problems > 0 && <span className="block text-xs text-amber-300">{problems} ticked item{problems > 1 ? "s need" : " needs"} a slot, quality or quantity</span>}
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <div className={all.length ? "flex-1" : "flex-[3]"}>
              <ScreenshotPicker
                multiple
                disabled={!!busy}
                label={all.length ? "Add screenshot" : "Choose inventory screenshots"}
                showCamera={all.length === 0}
                primaryClassName={all.length ? "w-full flex-1 rounded-xl py-3 border border-slate-700 text-sm" : "flex-[2] bg-blue-600 rounded-xl py-3 font-semibold disabled:bg-slate-700"}
                onFiles={addFiles}
              />
            </div>
            {all.length > 0 && (
              <button
                disabled={!checked || problems > 0 || kept.length === 0}
                onClick={() => onConfirm(next, `${changes.length} gear count${changes.length === 1 ? "" : "s"} ${mode === "add" ? "added to" : "set from"} the scan`)}
                className="flex-[2] py-3 rounded-xl bg-blue-600 disabled:bg-slate-700 disabled:text-slate-400 font-semibold text-sm"
              >
                Use these counts
              </button>
            )}
          </div>
        </>
      }
    >
      {all.length === 0 && !busy && (
        <div className="card flex flex-col gap-2">
          <p className="text-sm text-slate-300">
            Screenshot the screen that lists your {mythicOnly ? "spare Mythic hero gear" : "unequipped hero gear"}. Each complete
            item tile is read; tiles cut off at the edge are skipped.
          </p>
          <ul className="text-xs text-slate-400 list-disc pl-4 flex flex-col gap-1">
            <li>Quality comes from the tile colour. Quantity from the number on the tile (no number = 1).</li>
            <li>The slot (Goggles, Gloves, Belt, Boots) isn't recognised yet — you choose it for each item you keep.</li>
            <li>Only ticked items count. Nothing changes until you confirm.</li>
          </ul>
        </div>
      )}
      {error && <div className="card border border-red-900 text-sm text-red-300">{error}</div>}
      {busy && <ProgressBar label={busy.label} p={busy.p} />}

      {shots.map((s, si) => (
        <div key={s.id} className="flex flex-col gap-2">
          <h3 className="font-semibold text-sm">Screenshot {si + 1}</h3>
          <div className="card">
            <TokenOverlay src={s.url} size={s.size} boxes={s.rows.map((r) => ({ id: r.key, box: r.read.box, label: `#${r.n}`, used: r.include, kind: "tile" as const }))} />
          </div>
          {s.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-200 px-1">{w}</p>
          ))}
          {s.rows.map((r) => (
            <div key={r.key} className={`card !p-2 flex flex-col gap-1.5 ${r.include ? "" : "opacity-60"}`}>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={r.include} onChange={(e) => update(s.id, r.key, { include: e.target.checked })} aria-label={`Use item ${r.n}`} />
                  Item #{r.n}
                </label>
                <ConfidenceChip confidence={r.read.quality.confidence} missing={!r.quality} />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <select aria-label={`Item ${r.n} slot`} className={`field !py-1 ${r.include && !r.slot ? "!border-red-700" : ""}`} value={r.slot} onChange={(e) => update(s.id, r.key, { slot: e.target.value as GearSlot | "" })}>
                  <option value="">Slot…</option>
                  {GEAR_SLOTS.map((g) => (
                    <option key={g} value={g}>{SLOT_LABELS[g]}</option>
                  ))}
                </select>
                <select aria-label={`Item ${r.n} quality`} className={`field !py-1 ${r.quality ? RARITY_TEXT[r.quality] : ""}`} value={r.quality} onChange={(e) => update(s.id, r.key, { quality: e.target.value as GearRarity | "" })}>
                  <option value="">Quality…</option>
                  {GEAR_RARITY_ORDER.map((q) => (
                    <option key={q} value={q}>{GEAR_RARITY_LABELS[q]}</option>
                  ))}
                </select>
                <NumericInput aria-label={`Item ${r.n} quantity`} className="field !py-1 text-right" min={0} placeholder="Qty" value={r.quantity} onCommit={(v) => update(s.id, r.key, { quantity: v })} onClear={() => update(s.id, r.key, { quantity: null })} />
              </div>
              {!r.quality && r.read.quality.value && (
                <UseDetected label={GEAR_RARITY_LABELS[r.read.quality.value]} confidence={r.read.quality.confidence} onUse={() => update(s.id, r.key, { quality: r.read.quality.value! })} />
              )}
              {r.read.quality.warning && r.quality && <p className="text-[10px] text-amber-300">{r.read.quality.warning}</p>}
              {r.read.quantity.warning && <p className="text-[10px] text-slate-400">{r.read.quantity.warning}</p>}
            </div>
          ))}
        </div>
      ))}

      {kept.length > 0 && (
        <div className="card flex flex-col gap-2 text-sm">
          <div className="flex gap-1.5" role="radiogroup" aria-label="How to apply">
            {(["replace", "add"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`flex-1 text-xs py-2 rounded-lg border ${mode === m ? "bg-blue-600 border-blue-600" : "border-slate-700 text-slate-300"}`}>
                {m === "replace" ? "Replace these counts" : "Add to current counts"}
              </button>
            ))}
          </div>
          {changes.length > 0 ? (
            <ul className="text-xs flex flex-col gap-0.5 tabular-nums">
              {changes.map((c) => (
                <li key={`${c.slot}-${c.q}`} className="flex justify-between">
                  <span>{SLOT_LABELS[c.slot]} · <span className={RARITY_TEXT[c.q]}>{GEAR_RARITY_LABELS[c.q]}</span></span>
                  <span>{c.from} → <b>{c.to}</b></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">Choose a slot and quality for the ticked items to see the changes.</p>
          )}
        </div>
      )}
    </ScanSheet>
  );
}
