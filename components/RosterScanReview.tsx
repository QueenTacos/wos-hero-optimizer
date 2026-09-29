"use client";

// ============================================================================
// Roster screenshots → ONE merged roster → Review/Confirm.
//
// Screenshots can overlap (you scroll and take another). Cards are identified
// by portrait, then merged by hero id (lib/screenshot/rosterScanMerge.ts), so
// each hero appears once, in Power order. Every hero must be explicitly marked
// Correct, changed, or skipped before anything reaches the hero list.
// ============================================================================

import { NumericInput } from "@/components/NumericInput";
import { useEffect, useMemo, useRef, useState } from "react";
import { HeroPortrait } from "@/components/HeroPortrait";
import { HeroPickerSheet, genLabel } from "@/components/HeroSelect";
import { TroopBadge } from "@/components/TroopBadge";
import { getSharedHeroRecognizer } from "@/imageRecognition/heroRecognizer";
import { getSharedOcrEngine } from "@/imageRecognition/tesseractOcr";
import { createHeroRosterParser } from "@/screenshotParser";
import { getHeroDefinition } from "@/lib/data/heroDatabase";
import { HERO_MAX_LEVEL } from "@/lib/data/heroXpTable";
import { TIERS_PER_STAR, toStarValue } from "@/lib/data/shardTable";
import { confidenceLevel } from "@/lib/screenshot/quantityTokens";
import { ConfirmedRosterEntry } from "@/lib/screenshot/rosterMerge";
import { MergedRosterEntry, mergeRosterScans, toScanCards } from "@/lib/screenshot/rosterScanMerge";
import { DetectedScreenshotHero } from "@/lib/types";

type Status = "pending" | "confirmed" | "skipped";

/** The user's decision for one merged hero, keyed by entry key. */
interface Decision {
  status: Status;
  level: number | null;
  stars: number;
  tier: number;
  /** How many merge notes existed when the user decided — new conflicts reopen the card. */
  notesSeen: number;
}

interface Shot {
  url: string;
  width: number;
  height: number;
  dets: DetectedScreenshotHero[];
  warnings: string[];
}

export function RosterScanReview({
  onConfirm,
  onClose,
}: {
  onConfirm: (entries: ConfirmedRosterEntry[]) => void;
  onClose: () => void;
}) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  /** Card key → hero id chosen by the user. Applied to every card of that hero. */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    };
  }, []);

  const merged = useMemo(() => mergeRosterScans(toScanCards(shots.map((s) => s.dets), overrides)), [shots, overrides]);
  const entries = merged.entries;

  function decisionFor(e: MergedRosterEntry): Decision {
    const d = decisions[e.key];
    const det = e.primary.det;
    const fresh: Decision = {
      status: "pending",
      level: det.levelDetected ?? (det.partial ? null : 1),
      stars: det.starsDetected ?? 0,
      tier: det.starTierDetected ?? 0,
      notesSeen: 0,
    };
    if (!d) return fresh;
    // A new screenshot added conflicting readings after the user decided → ask again.
    if (d.status !== "pending" && e.mergeNotes.length > d.notesSeen) return { ...d, status: "pending" };
    return d;
  }

  async function addScreenshot(file: File) {
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      const bmp = await createImageBitmap(file);
      const size = { width: bmp.width, height: bmp.height };
      bmp.close();

      const recognizer = getSharedHeroRecognizer((l, t) => {
        setBusy(`Loading hero portraits (${l}/${t})`);
        setProgress(l / t);
      });
      setBusy("Loading hero portraits");
      await recognizer.warmUp();

      const parser = createHeroRosterParser(recognizer, getSharedOcrEngine());
      const res = await parser.parse(file, {
        onProgress: (done, total, stage) => {
          setBusy(`Screenshot ${shots.length + 1}: ${stage} (${done}/${total})`);
          setProgress(total ? done / total : 0);
        },
      });

      if (res.data.length === 0) {
        URL.revokeObjectURL(url);
        setError(res.warnings[0] ?? "No hero cards found in that screenshot.");
        return;
      }
      setShots((s) => [...s, { url, ...size, dets: res.data, warnings: res.warnings.map((w) => `Screenshot ${s.length + 1}: ${w}`) }]);
    } catch (e) {
      console.error(e);
      URL.revokeObjectURL(url);
      setError(
        e instanceof Error && /network|fetch/i.test(e.message)
          ? "Couldn't load the text reader or portraits. Check your connection and try again."
          : "Something went wrong reading that screenshot. Try another one, or add heroes by hand."
      );
    } finally {
      setBusy(null);
      setProgress(0);
    }
  }

  function decide(e: MergedRosterEntry, patch: Partial<Decision>) {
    setDecisions((prev) => ({ ...prev, [e.key]: { ...decisionFor(e), notesSeen: e.mergeNotes.length, ...patch } }));
  }

  function changeHero(e: MergedRosterEntry, heroId: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const src of e.sources) next[src.key] = heroId;
      return next;
    });
    decide(e, { status: "confirmed" });
  }

  const counts = { pending: 0, confirmed: 0, skipped: 0 };
  for (const e of entries) counts[decisionFor(e).status]++;
  const needsLevel = entries.filter((e) => decisionFor(e).status === "confirmed" && decisionFor(e).level == null).length;
  const totalCards = shots.reduce((s, sh) => s + sh.dets.length, 0);
  const allWarnings = [...merged.notes, ...shots.flatMap((s) => s.warnings.filter((w) => !/were both matched/.test(w)))];

  function confirmAll() {
    const out: ConfirmedRosterEntry[] = [];
    for (const e of entries) {
      const d = decisionFor(e);
      if (d.status !== "confirmed" || !e.heroId) continue;
      out.push({
        heroDefId: e.heroId,
        level: Math.max(1, Math.min(HERO_MAX_LEVEL, d.level ?? 1)),
        stars: toStarValue(d.stars, d.tier),
        powerRank: e.powerRank,
      });
    }
    onConfirm(out);
  }

  const pickerEntry = entries.find((e) => e.key === pickerFor);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="Scan hero roster">
      <div className="max-w-xl mx-auto px-4 py-4 pb-32 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Scan hero roster</h2>
          <button onClick={onClose} className="text-sm text-slate-300 px-3 py-1 border border-slate-700 rounded-lg">
            Cancel
          </button>
        </div>

        {entries.length === 0 && !busy && (
          <div className="card flex flex-col gap-3">
            <p className="text-sm text-slate-300">
              Open <b>Heroes</b> in the game, sort by <b>Power</b>, and screenshot the grid. Scroll and add more
              screenshots — overlapping ones are fine, each hero is only counted once.
            </p>
            <ul className="text-xs text-slate-400 list-disc pl-4 flex flex-col gap-1">
              <li>Heroes are identified by matching the card art to the app's portrait library — not by reading names.</li>
              <li>The troop icon is checked against the matched hero. Level is read from the “Lv.” label; stars from the star icons.</li>
              <li>Cards cut off at the screen edge are flagged or skipped, never guessed.</li>
              <li>You'll confirm or correct every hero before anything is added. Screenshots stay on this device.</li>
            </ul>
            <p className="text-[11px] text-amber-300/90">
              Prototype: tested on 4 real roster screenshots from 2 phones (all heroes matched). Check each result.
            </p>
          </div>
        )}

        {error && <div className="card border border-red-900 text-sm text-red-300">{error}</div>}

        {busy && (
          <div className="card flex flex-col gap-2">
            <div className="text-sm text-slate-300">{busy}…</div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.max(5, progress * 100)}%` }} />
            </div>
          </div>
        )}

        {entries.length > 0 && (
          <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-slate-950/95 backdrop-blur border-b border-slate-800 text-xs flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span>
                <b className="text-slate-100">{counts.confirmed + counts.skipped}</b>
                <span className="text-slate-400"> of {entries.length} heroes reviewed</span>
                {counts.pending > 0 && <span className="text-amber-300"> · {counts.pending} to check</span>}
              </span>
              <span className="text-slate-400">{counts.confirmed} ✓ · {counts.skipped} skipped</span>
            </div>
            <div className="text-[11px] text-slate-500">
              {shots.length} screenshot{shots.length > 1 ? "s" : ""} · {totalCards} cards · {entries.length} unique heroes
              {merged.duplicatesMerged > 0 && ` · ${merged.duplicatesMerged} duplicate${merged.duplicatesMerged > 1 ? "s" : ""} merged`}
            </div>
          </div>
        )}

        {entries.map((e) => (
          <ReviewCard
            key={e.key}
            entry={e}
            shot={shots[e.primary.shotIndex]}
            decision={decisionFor(e)}
            changedByUser={e.sources.some((s) => s.key in overrides)}
            duplicateOfRank={e.possibleDuplicateOfKey ? entries.find((x) => x.key === e.possibleDuplicateOfKey)?.powerRank : undefined}
            onDecide={(p) => decide(e, p)}
            onPickAlternative={(id) => changeHero(e, id)}
            onChangeHero={() => setPickerFor(e.key)}
          />
        ))}

        {allWarnings.length > 0 && (
          <div className="card border border-amber-900">
            <ul className="text-xs text-amber-200 list-disc pl-4 flex flex-col gap-1">
              {allWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-slate-950 border-t border-slate-800">
        <div className="max-w-xl mx-auto px-4 py-3 flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
            className={`py-3 rounded-xl text-sm ${entries.length ? "flex-1 border border-slate-700" : "flex-1 bg-blue-600 font-semibold"}`}
          >
            {entries.length ? "Add screenshots" : "Choose roster screenshots"}
          </button>
          {entries.length > 0 && (
            <button
              onClick={confirmAll}
              disabled={counts.pending > 0 || counts.confirmed === 0 || needsLevel > 0 || !!busy}
              className="flex-[2] py-3 rounded-xl bg-blue-600 disabled:bg-slate-700 disabled:text-slate-400 font-semibold text-sm"
            >
              {counts.pending > 0
                ? `Review ${counts.pending} more`
                : needsLevel > 0
                  ? `Enter ${needsLevel} missing level${needsLevel > 1 ? "s" : ""}`
                  : `Add ${counts.confirmed} hero${counts.confirmed === 1 ? "" : "es"}`}
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="roster-input"
        onChange={async (ev) => {
          // Several screenshots can be picked at once; they're read one after another.
          const files = Array.from(ev.target.files ?? []);
          ev.target.value = "";
          for (const f of files) await addScreenshot(f);
        }}
      />

      {pickerEntry && (
        <HeroPickerSheet
          title="Which hero is this?"
          value={pickerEntry.heroId ?? undefined}
          onPick={(id) => {
            changeHero(pickerEntry, id);
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}

function CardThumb({ shot, box, width = 64 }: { shot: Shot; box: DetectedScreenshotHero["boundingBox"]; width?: number }) {
  const s = width / box.width;
  return (
    <div
      role="img"
      aria-label="Card from your screenshot"
      className="rounded-md shrink-0 bg-slate-800"
      style={{
        width,
        height: Math.round(box.height * s),
        backgroundImage: `url(${shot.url})`,
        backgroundSize: `${shot.width * s}px ${shot.height * s}px`,
        backgroundPosition: `${-box.x * s}px ${-box.y * s}px`,
      }}
    />
  );
}

function ConfidenceLabel({ c }: { c: number }) {
  const lvl = confidenceLevel(c);
  const cls = lvl === "high" ? "text-green-300" : lvl === "medium" ? "text-amber-300" : "text-red-300";
  return (
    <span className={cls}>
      {Math.round(c * 100)}% <span className="text-slate-400">({lvl})</span>
    </span>
  );
}

function ReviewCard({
  entry,
  shot,
  decision,
  changedByUser,
  duplicateOfRank,
  onDecide,
  onPickAlternative,
  onChangeHero,
}: {
  entry: MergedRosterEntry;
  shot: Shot;
  decision: Decision;
  changedByUser: boolean;
  duplicateOfRank?: number;
  onDecide: (p: Partial<Decision>) => void;
  onPickAlternative: (heroId: string) => void;
  onChangeHero: () => void;
}) {
  const det = entry.primary.det;
  const def = entry.heroId ? getHeroDefinition(entry.heroId) : undefined;
  const status = decision.status;
  const border = status === "confirmed" ? "border-green-700" : status === "skipped" ? "border-slate-800 opacity-60" : "border-amber-700/70";
  const alternatives = (det.candidates ?? []).filter((c) => c.heroId !== entry.heroId).slice(0, 2);
  const shotsSeen = [...new Set(entry.sources.map((s) => s.shotIndex + 1))];
  const flags = [...(det.reviewReasons ?? []), ...entry.mergeNotes];
  if (duplicateOfRank) flags.push(`Compare with hero #${duplicateOfRank} — they may be the same.`);
  const levelMissing = decision.level == null;

  return (
    <div className={`card border ${border} flex gap-3`}>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] text-slate-500">#{entry.powerRank}</span>
        <CardThumb shot={shot} box={det.boundingBox} />
        {shotsSeen.length > 1 && (
          <span className="text-[9px] text-sky-300 text-center leading-tight">
            in shots
            <br />
            {shotsSeen.join(" & ")}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <HeroPortrait heroId={entry.heroId} size="lg" confidence={changedByUser ? undefined : det.confidence} decorative />
          <div className="min-w-0 text-sm">
            <div className="text-[11px] text-slate-400">Detected Hero</div>
            <div className="font-semibold truncate">{def?.name ?? "Unknown"}</div>
            {def && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <TroopBadge troopType={def.troopType} /> {genLabel(def.generation)}
              </div>
            )}
            <div className="text-[11px] mt-0.5">
              {changedByUser ? <span className="text-green-300">Chosen by you</span> : <>Confidence: <ConfidenceLabel c={det.confidence} /></>}
            </div>
          </div>
        </div>

        {flags.length > 0 && status !== "skipped" && (
          <ul className="text-[11px] text-amber-300 list-disc pl-4 flex flex-col gap-0.5">
            {flags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        )}

        {status === "pending" ? (
          <div className="flex gap-1.5">
            <button
              onClick={() => onDecide({ status: "confirmed" })}
              disabled={!entry.heroId}
              className="flex-1 py-1.5 rounded-lg bg-green-700 disabled:bg-slate-700 text-xs font-semibold"
            >
              Correct
            </button>
            <button onClick={onChangeHero} className="flex-1 py-1.5 rounded-lg border border-slate-600 text-xs">
              Change Hero
            </button>
            <button onClick={() => onDecide({ status: "skipped" })} className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-400">
              Skip
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs">
            <span className={status === "confirmed" ? "text-green-300" : "text-slate-400"}>{status === "confirmed" ? "✓ Confirmed" : "Skipped"}</span>
            <span className="flex gap-3">
              {status === "confirmed" && (
                <button onClick={onChangeHero} className="text-blue-300 underline-offset-2 hover:underline">
                  Change Hero
                </button>
              )}
              <button onClick={() => onDecide({ status: "pending" })} className="text-slate-400 underline-offset-2 hover:underline">
                Undo
              </button>
            </span>
          </div>
        )}

        {status === "pending" && !changedByUser && alternatives.length > 0 && confidenceLevel(det.confidence) !== "high" && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 flex-wrap">
            Or:
            {alternatives.map((a) => (
              <button
                key={a.heroId}
                onClick={() => onPickAlternative(a.heroId)}
                className="flex items-center gap-1 rounded-full border border-slate-700 pl-0.5 pr-2 py-0.5"
              >
                <HeroPortrait heroId={a.heroId} size="xs" decorative />
                {getHeroDefinition(a.heroId)?.name}
              </button>
            ))}
          </div>
        )}

        {status !== "skipped" && (
          <div className="grid grid-cols-3 gap-1.5">
            <label className="flex flex-col text-[10px] text-slate-400 gap-0.5">
              Level
              <NumericInput
                min={1}
                max={HERO_MAX_LEVEL}
                placeholder="?"
                className={`field !py-1 ${levelMissing ? "!border-amber-500" : ""}`}
                value={decision.level}
                onCommit={(level) => onDecide({ level })}
                onClear={() => onDecide({ level: null })}
              />
            </label>
            <label className="flex flex-col text-[10px] text-slate-400 gap-0.5">
              Stars
              <select className="field !py-1" value={decision.stars} onChange={(ev) => onDecide({ stars: Number(ev.target.value), tier: Number(ev.target.value) >= 5 ? 0 : decision.tier })}>
                {[0, 1, 2, 3, 4, 5].map((s) => (
                  <option key={s} value={s}>{s}★</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-[10px] text-slate-400 gap-0.5">
              Tier
              <select className="field !py-1 disabled:opacity-40" disabled={decision.stars >= 5} value={decision.tier} onChange={(ev) => onDecide({ tier: Number(ev.target.value) })}>
                {Array.from({ length: TIERS_PER_STAR }, (_, t) => (
                  <option key={t} value={t}>{t}/{TIERS_PER_STAR}</option>
                ))}
              </select>
            </label>
            <div className="col-span-3 text-[10px] text-slate-500">
              {det.partial
                ? "Level & stars not visible on this card — please enter them"
                : det.levelRawText
                  ? `Level read as “${det.levelRawText}” · stars read from icons`
                  : "Level not read — please check"}
              {!det.partial && (det.levelConfidence ?? 0) < 0.8 && <span className="text-amber-300"> · check level</span>}
              {!det.partial && (det.starsConfidence ?? 0) < 0.5 && <span className="text-amber-300"> · check stars</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
