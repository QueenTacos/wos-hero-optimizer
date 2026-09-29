"use client";

// ============================================================================
// Hero Gear screenshots → review → Confirm Gear.
//
// One review card per screenshot: hero (from the page header, or the card
// the scan was started from), then Goggles / Gloves / Belt / Boots with
// Quality, Enhancement (+N) and Mastery kept as separate fields. Tap a slot
// field, then tap its number on the screenshot to fix a misread. Nothing
// reaches the roster until Confirm Gear; existing gear is only changed for
// the slots left ticked.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { GearRarity, GearSlot, GEAR_SLOTS } from "@/lib/types";
import { GEAR_RARITY_LABELS, GEAR_RARITY_ORDER } from "@/lib/data/gearRarity";
import { GEAR_MAX_LEVEL } from "@/lib/data/gearXpTable";
import { MASTERY_MAX } from "@/lib/data/masteryForgingTable";
import { getHeroDefinition } from "@/lib/data/heroDatabase";
import { getSharedOcrEngine } from "@/imageRecognition/tesseractOcr";
import { createHeroGearParser } from "@/screenshotParser/gearParser";
import { GearScreenScan } from "@/lib/screenshot/gearScreenReading";
import { ConfirmedGearScan, RowGearLike, SlotDraft, confirmedFromDraft, draftProblems, initialSlotDrafts } from "@/lib/screenshot/gearScanApply";
import { confidenceBand, initialReviewValue } from "@/lib/screenshot/scanTypes";
import { ScreenshotPicker } from "@/components/ScreenshotPicker";
import { HeroSelect, genLabel } from "@/components/HeroSelect";
import { NumericInput } from "@/components/NumericInput";
import { RARITY_TEXT, SLOT_LABELS } from "@/components/GearEditor";
import { ConfidenceChip, ProgressBar, ScanSheet, TokenOverlay, UseDetected } from "@/components/ScanReviewBits";

interface Entry {
  id: string;
  url: string;
  size: { width: number; height: number };
  scan: GearScreenScan;
  heroId: string;
  slots: Record<GearSlot, SlotDraft>;
}

type Active = { entryId: string; slot: GearSlot; field: "enhancement" | "mastery" } | null;

const describe = (p: { rarity: GearRarity; enhancementLevel: number; masteryLevel?: number } | null | undefined) =>
  p ? `${GEAR_RARITY_LABELS[p.rarity]} +${p.enhancementLevel} · Mastery ${p.masteryLevel ?? 0}` : "Empty";

export function GearScanReview({
  existingGear,
  initialHeroId,
  onConfirm,
  onClose,
}: {
  /** Current gear per hero id in the roster (to show what will change). */
  existingGear: Record<string, RowGearLike>;
  /** Set when the scan was started from a hero card. */
  initialHeroId?: string;
  onConfirm: (scans: ConfirmedGearScan[]) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState<{ label: string; p: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Active>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => () => entries.forEach((e) => URL.revokeObjectURL(e.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(files: File[]) {
    setError(null);
    const parser = createHeroGearParser(getSharedOcrEngine());
    for (const [i, file] of files.entries()) {
      const url = URL.createObjectURL(file);
      try {
        const res = await parser.parse(file, {
          expectedHeroId: files.length === 1 && entries.length === 0 ? initialHeroId : undefined,
          onProgress: (p, stage) => setBusy({ label: files.length > 1 ? `${stage} (${i + 1}/${files.length})` : stage, p }),
        });
        const heroId = initialReviewValue(res.scan.hero) ?? (files.length === 1 && entries.length === 0 ? initialHeroId ?? "" : "");
        setEntries((prev) => [
          ...prev,
          { id: `${Date.now()}-${i}`, url, size: res.size, scan: res.scan, heroId, slots: initialSlotDrafts(res.scan, heroId ? existingGear[heroId] : null) },
        ]);
      } catch (e) {
        console.error(e);
        URL.revokeObjectURL(url);
        setError(
          e instanceof Error && /network|fetch/i.test(e.message)
            ? "Couldn't download the text reader. Check your connection and try again."
            : "Something went wrong reading that image. Try another screenshot, or enter the gear by hand."
        );
      }
    }
    setBusy(null);
    setChecked(false);
  }

  function updateSlot(entryId: string, slot: GearSlot, patch: Partial<SlotDraft>) {
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, slots: { ...e.slots, [slot]: { ...e.slots[slot], ...patch, userSet: { ...e.slots[slot].userSet, ...Object.fromEntries(Object.keys(patch).filter((k) => k !== "include" && k !== "stage").map((k) => [k, true])) } } } } : e))
    );
    setChecked(false);
  }
  function setHero(entryId: string, heroId: string) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        // Re-base slot defaults on the newly chosen hero's current gear, keeping anything the user set.
        const base = initialSlotDrafts(e.scan, existingGear[heroId]);
        const slots = { ...e.slots };
        for (const s of GEAR_SLOTS) if (!e.slots[s].userSet.quality) slots[s] = { ...slots[s], quality: base[s].quality, stage: base[s].stage };
        return { ...e, heroId, slots };
      })
    );
    setChecked(false);
  }
  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const problems = useMemo(() => entries.map((e) => draftProblems(e.heroId, e.slots)), [entries]);
  const blocking = problems.reduce((n, p) => n + p.length, 0);
  const dupHeroes = useMemo(() => {
    const seen = new Map<string, number>();
    entries.forEach((e) => e.heroId && seen.set(e.heroId, (seen.get(e.heroId) ?? 0) + 1));
    return [...seen].filter(([, n]) => n > 1).map(([id]) => getHeroDefinition(id)?.name ?? id);
  }, [entries]);

  function confirm() {
    onConfirm(entries.map((e) => confirmedFromDraft(e.heroId, e.slots, existingGear[e.heroId])));
  }

  return (
    <ScanSheet
      title="Scan Hero Gear"
      onClose={onClose}
      footer={
        <>
          {entries.length > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={blocking > 0} />
              <span>
                I've checked this gear against my game.
                {blocking > 0 && <span className="block text-xs text-amber-300">{blocking} thing{blocking > 1 ? "s" : ""} to fill in first (see below)</span>}
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <div className={entries.length ? "flex-1" : "flex-[3]"}>
              <ScreenshotPicker
                multiple
                disabled={!!busy}
                label={entries.length ? "Add screenshot" : "Choose gear screenshots"}
                showCamera={entries.length === 0}
                primaryClassName={entries.length ? "flex-1 w-full rounded-xl py-3 border border-slate-700 text-sm" : "flex-[2] bg-blue-600 rounded-xl py-3 font-semibold disabled:bg-slate-700"}
                onFiles={addFiles}
              />
            </div>
            {entries.length > 0 && (
              <button
                onClick={confirm}
                disabled={!checked || blocking > 0 || !!busy}
                className="flex-[2] py-3 rounded-xl bg-blue-600 disabled:bg-slate-700 disabled:text-slate-400 font-semibold text-sm"
              >
                Confirm Gear
              </button>
            )}
          </div>
        </>
      }
    >
      {entries.length === 0 && !busy && (
        <div className="card flex flex-col gap-2">
          <p className="text-sm text-slate-300">
            Open a hero in the game, go to their <b>Gear</b> page, and screenshot it so all four slots and the hero's name show.
            Add one screenshot per hero — several at once is fine.
          </p>
          <ul className="text-xs text-slate-400 list-disc pl-4 flex flex-col gap-1">
            <li>Enhancement (+19) and Mastery (Lv.10) are read separately and never mixed up.</li>
            <li>Quality comes from the slot tile's colour — you confirm it, especially Mythic vs Legendary.</li>
            <li>Nothing changes on your hero cards until you press Confirm Gear. Screenshots stay on this device.</li>
          </ul>
          <p className="text-[11px] text-amber-300/90">
            New: not yet tested on real gear screenshots with equipped gear. Check every value.
          </p>
        </div>
      )}

      {error && <div className="card border border-red-900 text-sm text-red-300">{error}</div>}
      {busy && <ProgressBar label={busy.label} p={busy.p} />}
      {dupHeroes.length > 0 && (
        <div className="card border border-amber-900 text-xs text-amber-200">
          {dupHeroes.join(", ")} appear{dupHeroes.length === 1 ? "s" : ""} in more than one screenshot. The later screenshot's slots win.
        </div>
      )}

      {entries.map((e, idx) => {
        const def = e.heroId ? getHeroDefinition(e.heroId) : undefined;
        const current = e.heroId ? existingGear[e.heroId] : undefined;
        const used = new Set(GEAR_SLOTS.flatMap((s) => [e.scan.slots[s].enhancementTokenId, e.scan.slots[s].masteryTokenId]).filter(Boolean) as string[]);
        return (
          <div key={e.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Screenshot {idx + 1}</h3>
              <button onClick={() => removeEntry(e.id)} className="text-xs text-slate-400">Remove</button>
            </div>

            <div className="card flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">Hero</span>
                {e.scan.hero.value && <ConfidenceChip confidence={e.scan.hero.confidence} userSet={e.heroId !== e.scan.hero.value} />}
              </div>
              <HeroSelect value={e.heroId} onChange={(id) => setHero(e.id, id)} placeholder="Choose the hero" />
              {!e.heroId && e.scan.hero.value && (
                <UseDetected label={getHeroDefinition(e.scan.hero.value)?.name ?? e.scan.hero.value} confidence={e.scan.hero.confidence} onUse={() => setHero(e.id, e.scan.hero.value!)} />
              )}
              {def && (
                <div className="text-[11px] text-slate-400">
                  {genLabel(def.generation)} · {def.troopType} · {current ? "already on your list — only ticked slots change" : "not on your list yet — will be added"}
                </div>
              )}
            </div>

            <div className="card flex flex-col gap-2">
              <div className="text-xs text-slate-400">
                {active?.entryId === e.id
                  ? `Now tap the ${active.field === "enhancement" ? "“+N”" : "“Lv.”"} number for ${SLOT_LABELS[active.slot]} on the screenshot.`
                  : "Outlined: numbers read. Dashed: gear slots found. To fix a value, tap its field below, then tap the number here."}
              </div>
              <TokenOverlay
                src={e.url}
                size={e.size}
                boxes={[
                  ...GEAR_SLOTS.filter((s) => e.scan.slots[s].tileBox).map((s) => ({ id: `tile-${s}`, box: e.scan.slots[s].tileBox!, label: SLOT_LABELS[s], used: false, kind: "tile" as const })),
                  ...e.scan.tokens.map((t) => ({
                    id: t.id,
                    box: t.bbox,
                    label: `Use ${t.rawText}`,
                    used: used.has(t.id),
                    onTap:
                      active?.entryId === e.id
                        ? () => {
                            updateSlot(e.id, active.slot, { [active.field]: t.value, include: true } as Partial<SlotDraft>);
                            setActive(null);
                          }
                        : undefined,
                  })),
                ]}
              />
              {!e.scan.tilesFound && <div className="text-[11px] text-amber-300">Slots weren't found on the image — numbers were matched by position.</div>}
            </div>

            <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2">
              {GEAR_SLOTS.map((slot) => (
                <SlotCard
                  key={slot}
                  slot={slot}
                  draft={e.slots[slot]}
                  read={e.scan.slots[slot]}
                  current={current?.[slot] ?? null}
                  activeField={active?.entryId === e.id && active.slot === slot ? active.field : null}
                  onPickField={(field) => setActive(active?.entryId === e.id && active.slot === slot && active.field === field ? null : { entryId: e.id, slot, field })}
                  onChange={(patch) => updateSlot(e.id, slot, patch)}
                />
              ))}
            </div>

            {(e.scan.warnings.length > 0 || problems[idx].length > 0) && (
              <div className="card border border-amber-900">
                <ul className="text-xs text-amber-200 list-disc pl-4 flex flex-col gap-1">
                  {problems[idx].map((p) => (
                    <li key={p} className="text-amber-300">{p}</li>
                  ))}
                  {e.scan.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </ScanSheet>
  );
}

function SlotCard({
  slot,
  draft,
  read,
  current,
  activeField,
  onPickField,
  onChange,
}: {
  slot: GearSlot;
  draft: SlotDraft;
  read: GearScreenScan["slots"][GearSlot];
  current: RowGearLike[GearSlot];
  activeField: "enhancement" | "mastery" | null;
  onPickField: (f: "enhancement" | "mastery") => void;
  onChange: (patch: Partial<SlotDraft>) => void;
}) {
  const legendary = draft.quality === "legendary";
  const medium = (c: number) => confidenceBand(c) === "medium";
  const fieldCls = (set: boolean | undefined, conf: number, missing: boolean) =>
    `field !px-1.5 !py-1 text-right w-full ${missing ? "!border-red-700" : !set && medium(conf) ? "!border-amber-500" : ""}`;
  return (
    <div className={`rounded-lg border p-2 flex flex-col gap-1.5 ${draft.include ? (legendary ? "border-orange-700/70" : "border-slate-600") : "border-slate-800 opacity-70"}`}>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-semibold">
          <input type="checkbox" checked={draft.include} onChange={(e) => onChange({ include: e.target.checked })} aria-label={`Update ${SLOT_LABELS[slot]}`} />
          {SLOT_LABELS[slot]}
        </label>
        {read.equipped.value === false && <span className="text-[10px] text-slate-400">Looks empty</span>}
      </div>
      <div className="text-[10px] text-slate-500">Now: {describe(current)}</div>

      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-slate-400">Quality</span>
        {draft.quality && read.quality.value === draft.quality && !draft.userSet.quality ? (
          <ConfidenceChip confidence={read.quality.confidence} />
        ) : draft.userSet.quality ? (
          <ConfidenceChip confidence={1} userSet />
        ) : null}
      </div>
      <select
        aria-label={`${SLOT_LABELS[slot]} quality`}
        className={`field w-full ${draft.quality ? RARITY_TEXT[draft.quality] : "text-slate-400"} ${draft.include && !draft.quality ? "!border-red-700" : ""}`}
        value={draft.quality}
        onChange={(e) => onChange({ quality: e.target.value as GearRarity | "" })}
      >
        <option value="">Choose…</option>
        {GEAR_RARITY_ORDER.map((r) => (
          <option key={r} value={r}>
            {GEAR_RARITY_LABELS[r]}
          </option>
        ))}
      </select>
      {!draft.quality && read.quality.value && confidenceBand(read.quality.confidence) === "low" && (
        <UseDetected label={GEAR_RARITY_LABELS[read.quality.value]} confidence={read.quality.confidence} onUse={() => onChange({ quality: read.quality.value! })} />
      )}
      {read.quality.warning && draft.quality && !draft.userSet.quality && <div className="text-[10px] text-amber-300">{read.quality.warning}</div>}

      <div className="grid grid-cols-3 gap-1">
        <label className="flex flex-col text-[10px] text-slate-400 gap-0.5">
          <span className="flex items-center justify-between">
            Enh. +
            <button type="button" onClick={() => onPickField("enhancement")} className={`text-[9px] px-1 rounded ${activeField === "enhancement" ? "bg-blue-600 text-white" : "text-blue-300"}`} aria-label={`Tap the ${SLOT_LABELS[slot]} enhancement on the screenshot`}>
              tap
            </button>
          </span>
          <NumericInput
            min={0}
            max={GEAR_MAX_LEVEL}
            aria-label={`${SLOT_LABELS[slot]} enhancement`}
            className={fieldCls(draft.userSet.enhancement, read.enhancement.confidence, draft.include && draft.enhancement === null)}
            placeholder="?"
            value={draft.enhancement}
            onCommit={(v) => onChange({ enhancement: v })}
            onClear={() => onChange({ enhancement: null })}
          />
        </label>
        <label className="flex flex-col text-[10px] text-slate-400 gap-0.5">
          <span className="flex items-center justify-between">
            Mastery
            <button type="button" onClick={() => onPickField("mastery")} className={`text-[9px] px-1 rounded ${activeField === "mastery" ? "bg-blue-600 text-white" : "text-blue-300"}`} aria-label={`Tap the ${SLOT_LABELS[slot]} mastery on the screenshot`}>
              tap
            </button>
          </span>
          <NumericInput
            min={0}
            max={MASTERY_MAX.level}
            aria-label={`${SLOT_LABELS[slot]} mastery level`}
            className={fieldCls(draft.userSet.mastery, read.mastery.confidence, draft.include && draft.mastery === null)}
            placeholder="?"
            value={draft.mastery}
            onCommit={(v) => onChange({ mastery: v })}
            onClear={() => onChange({ mastery: null })}
          />
        </label>
        <label className="flex flex-col text-[10px] text-slate-400 gap-0.5">
          Stage
          <select
            aria-label={`${SLOT_LABELS[slot]} mastery stage`}
            className="field !px-1 !py-1 disabled:opacity-40"
            disabled={(draft.mastery ?? 0) < 4 || (draft.mastery ?? 0) >= MASTERY_MAX.level}
            value={draft.stage}
            onChange={(e) => onChange({ stage: Number(e.target.value) })}
          >
            {[0, 1, 2, 3, 4].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      {draft.enhancement === null && read.enhancement.value !== null && (
        <UseDetected label={`+${read.enhancement.value}`} confidence={read.enhancement.confidence} onUse={() => onChange({ enhancement: read.enhancement.value!, include: true })} />
      )}
      {draft.mastery === null && read.mastery.value !== null && (
        <UseDetected label={`Lv.${read.mastery.value}`} confidence={read.mastery.confidence} onUse={() => onChange({ mastery: read.mastery.value!, include: true })} />
      )}
      {legendary && <div className="text-[10px] text-orange-300/90">Legendary: +N is on its own Legendary scale</div>}
    </div>
  );
}
