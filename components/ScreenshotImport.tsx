"use client";

// ============================================================================
// Screenshot Import — upload → scan → Review/Confirm (Phase 2).
//
// Nothing detected here touches the inventory until the user has reviewed
// every value and pressed Confirm. Values can be fixed by typing, or by
// tapping the correct number on the screenshot.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { getSharedOcrEngine } from "@/imageRecognition/tesseractOcr";
import { createResourceInventoryParser, ResourceParseData } from "@/screenshotParser";
import { SCREENSHOT_TARGETS, ScreenshotTarget } from "@/lib/screenshot/targets";
import { QuantityToken, confidenceLevel } from "@/lib/screenshot/quantityTokens";
import { ScreenshotParseResult } from "@/lib/types";
import { confidenceBand } from "@/lib/screenshot/scanTypes";
import { ScreenshotPicker } from "@/components/ScreenshotPicker";
import { appendScanLog, LOG_FIELD_NAMES } from "@/lib/screenshot/scanLog";
import type { BBox } from "@/lib/screenshot/quantityTokens";

type Step = "upload" | "scanning" | "review" | "error";

interface FieldState {
  value: string; // kept as text so the user can clear/edit freely
  tokenId: string | null;
  confidence: number;
  userVerified: boolean;
}

export function ScreenshotImport({
  target: initialTarget,
  alternativeTargets = [],
  onConfirm,
  onClose,
}: {
  target: ScreenshotTarget;
  /** Other screenshot kinds the user may switch to on the upload step (e.g. Hero EXP: total vs items). */
  alternativeTargets?: ScreenshotTarget[];
  onConfirm: (values: Record<string, number | null>, target: ScreenshotTarget) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<ScreenshotTarget>(initialTarget);
  const def = SCREENSHOT_TARGETS[target];
  const [reasons, setReasons] = useState<Record<string, string>>({});
  /** Low-confidence detections: shown as "Detected: X · Use X", never pre-filled. */
  const [held, setHeld] = useState<Record<string, { value: number; tokenId: string | null; confidence: number }>>({});
  /** Per field: other plausible readings and the tile the value came from. */
  const [extras, setExtras] = useState<Record<string, { alternates: number[]; sourceBox?: BBox; raw: number | null; rawConfidence: number }>>({});
  const [step, setStep] = useState<Step>("upload");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [progress, setProgress] = useState({ p: 0, stage: "" });
  const [result, setResult] = useState<ScreenshotParseResult<ResourceParseData> | null>(null);
  const [fields, setFields] = useState<Record<string, FieldState>>({});
  const [activeField, setActiveField] = useState<string>(def.fields[0].key);
  const [checked, setChecked] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (imageUrl && URL.revokeObjectURL(imageUrl)), [imageUrl]);

  // Lock background scroll while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const tokensById = useMemo(() => {
    const m = new Map<string, QuantityToken>();
    result?.data.tokens.forEach((t) => m.set(t.id, t));
    return m;
  }, [result]);

  async function handleFile(file: File) {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setChecked(false);
    setStep("scanning");
    setProgress({ p: 0, stage: "Loading text reader (first time only)" });

    try {
      const bmp = await createImageBitmap(file);
      setImageSize({ w: bmp.width, h: bmp.height });
      bmp.close();

      const parser = createResourceInventoryParser(getSharedOcrEngine());
      const res = await parser.parse(file, target, { onProgress: (p, stage) => setProgress({ p, stage }) });
      setResult(res);

      const initial: Record<string, FieldState> = {};
      setReasons(Object.fromEntries(res.data.suggestions.map((s) => [s.fieldKey, s.reason])));
      const hold: typeof held = {};
      for (const s of res.data.suggestions) {
        const low = s.value !== null && confidenceBand(s.confidence) === "low";
        if (low) hold[s.fieldKey] = { value: s.value!, tokenId: s.tokenId, confidence: s.confidence };
        initial[s.fieldKey] = {
          value: s.value === null || low ? "" : String(s.value),
          tokenId: low ? null : s.tokenId,
          confidence: low ? 0 : s.confidence,
          userVerified: false,
        };
      }
      setHeld(hold);
      setExtras(
        Object.fromEntries(
          res.data.suggestions.map((s) => [s.fieldKey, { alternates: s.alternates ?? [], sourceBox: s.sourceBox, raw: s.value, rawConfidence: s.confidence }])
        )
      );
      setFields(initial);
      setActiveField(def.fields[0].key);
      setStep("review");
    } catch (e) {
      console.error(e);
      setErrorMsg(
        e instanceof Error && /network|fetch/i.test(e.message)
          ? "Couldn't download the text reader. Check your connection and try again."
          : "Something went wrong reading that image. Try another screenshot, or enter the values by hand."
      );
      setStep("error");
    }
  }

  function assignToken(token: QuantityToken) {
    setFields((prev) => ({
      ...prev,
      [activeField]: { value: String(token.value), tokenId: token.id, confidence: token.confidence, userVerified: true },
    }));
    // Advance to the next field so tapping numbers in order fills the whole form.
    const idx = def.fields.findIndex((f) => f.key === activeField);
    const next = def.fields[idx + 1];
    if (next) setActiveField(next.key);
  }

  function editField(key: string, value: string) {
    setFields((prev) => ({
      ...prev,
      [key]: { ...prev[key], value: value.replace(/[^\d]/g, ""), tokenId: null, confidence: 1, userVerified: true },
    }));
  }

  function confirm() {
    const values: Record<string, number | null> = {};
    for (const f of def.fields) {
      const raw = fields[f.key]?.value ?? "";
      values[f.key] = raw === "" ? null : Number(raw);
    }
    // Local-only log of what OCR read vs. what was confirmed (no screenshots).
    appendScanLog(
      def.fields
        .filter((f) => extras[f.key])
        .map((f) => ({
          at: new Date().toISOString(),
          scanType: target,
          field: LOG_FIELD_NAMES[f.key] ?? f.key,
          rawValue: extras[f.key].raw,
          correctedValue: values[f.key],
          confidence: extras[f.key].rawConfidence,
          alternates: extras[f.key].alternates,
          reads: result?.data.rawReadings?.[f.key]?.reads,
        }))
    );
    onConfirm(values, target);
  }

  function choose(key: string, value: number) {
    setFields((prev) => ({ ...prev, [key]: { value: String(value), tokenId: prev[key]?.tokenId ?? null, confidence: 1, userVerified: true } }));
  }

  const assignedTokenIds = new Set(Object.values(fields).map((f) => f.tokenId).filter(Boolean) as string[]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 overflow-y-auto overflow-x-hidden overscroll-contain" role="dialog" aria-modal="true" aria-label={`Scan ${def.title}`}>
      <div className="max-w-xl mx-auto px-4 py-4 pb-28 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Scan: {def.title}</h2>
          <button onClick={onClose} className="text-sm text-slate-300 px-3 py-1 border border-slate-700 rounded-lg">
            Cancel
          </button>
        </div>

        {step === "upload" && (
          <div className="card flex flex-col gap-3">
            {alternativeTargets.length > 0 && (
              <div className="flex gap-1.5" role="radiogroup" aria-label="Screenshot type">
                {[initialTarget, ...alternativeTargets].map((t) => (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={t === target}
                    onClick={() => setTarget(t)}
                    className={`flex-1 text-xs py-2 rounded-lg border ${t === target ? "bg-blue-600 border-blue-600" : "border-slate-700 text-slate-300"}`}
                  >
                    {SCREENSHOT_TARGETS[t].title}
                  </button>
                ))}
              </div>
            )}
            <p className="text-sm text-slate-300">{def.instructions}</p>
            <ul className="text-xs text-slate-400 list-disc pl-4 flex flex-col gap-1">
              <li>Crop out chat and menus if you can — fewer stray numbers means better matching.</li>
              <li>Your screenshot is read on this device and never uploaded anywhere.</li>
              <li>You'll check every value before anything is used.</li>
            </ul>
            <ScreenshotPicker onFiles={(f) => handleFile(f[0])} />
          </div>
        )}

        {step === "scanning" && (
          <div className="card flex flex-col gap-3">
            {imageUrl && <img src={imageUrl} alt="Your screenshot" className="rounded-lg max-h-64 object-contain" />}
            <div className="text-sm text-slate-300">{progress.stage}…</div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress.p * 100)}>
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.max(5, progress.p * 100)}%` }} />
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="card flex flex-col gap-3 border border-red-900">
            <p className="text-sm text-red-300">{errorMsg}</p>
            <ScreenshotPicker onFiles={(f) => handleFile(f[0])} label="Try another screenshot" />
          </div>
        )}

        {step === "review" && result && imageUrl && imageSize && (
          <>
            <div className="card flex flex-col gap-2">
              <div className="text-xs text-slate-400">
                Tap a field below, then tap its number on the screenshot. Numbers found:{" "}
                <span className="text-slate-200">{result.data.tokens.length}</span>
              </div>
              <div className="relative w-full select-none overflow-hidden rounded-lg">
                <img src={imageUrl} alt="Your screenshot with detected numbers outlined" className="w-full rounded-lg block" />
                {result.data.tokens.map((t) => {
                  const used = assignedTokenIds.has(t.id);
                  // Position by center so the minimum tap size grows evenly around the number.
                  const cx = ((t.bbox.x + t.bbox.width / 2) / imageSize.w) * 100;
                  const cy = ((t.bbox.y + t.bbox.height / 2) / imageSize.h) * 100;
                  const w = ((t.bbox.width + 8) / imageSize.w) * 100;
                  const h = ((t.bbox.height + 8) / imageSize.h) * 100;
                  return (
                    <button
                      key={t.id}
                      onClick={() => assignToken(t)}
                      title={`${t.value.toLocaleString()} (${Math.round(t.confidence * 100)}% sure)`}
                      className={`absolute rounded border-2 ${
                        used ? "border-green-400 bg-green-400/20" : "border-amber-400 bg-amber-400/15"
                      }`}
                      style={{
                        left: `${cx}%`,
                        top: `${cy}%`,
                        width: `max(${w}%, 32px)`,
                        height: `max(${h}%, 26px)`,
                        transform: "translate(-50%, -50%)",
                      }}
                      aria-label={`Use ${t.value}`}
                    />
                  );
                })}
              </div>
              <div className="flex gap-3 text-[11px] text-slate-400">
                <span><span className="inline-block w-2.5 h-2.5 border-2 border-green-400 rounded-sm mr-1 align-middle" />used</span>
                <span><span className="inline-block w-2.5 h-2.5 border-2 border-amber-400 rounded-sm mr-1 align-middle" />not used</span>
              </div>
            </div>

            <div className="card flex flex-col gap-2">
              <h3 className="font-semibold">Review values</h3>
              {def.fields.map((f) => {
                const st = fields[f.key];
                const active = activeField === f.key;
                return (
                  <div
                    key={f.key}
                    onClick={() => setActiveField(f.key)}
                    className={`rounded-lg p-2 border ${active ? "border-blue-500 bg-blue-500/10" : "border-slate-800"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={`scan-${f.key}`} className="text-sm">{f.label}</label>
                      <ConfidenceBadge state={st} />
                    </div>
                    <div className="flex items-center gap-2">
                      {extras[f.key]?.sourceBox && imageUrl && imageSize && (
                        <SourceCrop src={imageUrl} size={imageSize} box={extras[f.key].sourceBox!} label={`${f.label} tile from your screenshot`} />
                      )}
                      <input
                        id={`scan-${f.key}`}
                        inputMode="numeric"
                        className="mt-1 w-full bg-slate-900 border border-slate-700 focus:border-blue-500 outline-none rounded px-2 py-2 text-sm text-slate-100"
                        placeholder="Not found — type it in"
                        value={st?.value ?? ""}
                        onFocus={() => setActiveField(f.key)}
                        onChange={(e) => editField(f.key, e.target.value)}
                      />
                    </div>
                    <ValueChoices
                      current={st?.value ?? ""}
                      detected={held[f.key]?.value ?? extras[f.key]?.raw ?? null}
                      confidence={extras[f.key]?.rawConfidence ?? 0}
                      alternates={extras[f.key]?.alternates ?? []}
                      onChoose={(v) => choose(f.key, v)}
                    />
                    {st && !st.userVerified && reasons[f.key] ? (
                      <div className="text-[11px] text-slate-500 mt-1">{reasons[f.key]}</div>
                    ) : st?.tokenId && tokensById.get(st.tokenId) ? (
                      <div className="text-[11px] text-slate-500 mt-1">Read as “{tokensById.get(st.tokenId)!.rawText}”</div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <ResourceBreakdown target={target} fields={fields} />
            <ApplyNote target={target} />

            {result.warnings.length > 0 && (
              <div className="card border border-amber-900">
                <ul className="text-xs text-amber-200 list-disc pl-4 flex flex-col gap-1">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              I've checked these values against my game.
            </label>

            <div className="flex gap-2">
              <button onClick={() => fileRef.current?.click()} className="flex-1 py-3 rounded-xl border border-slate-700 text-sm">
                Different screenshot
              </button>
              <button
                onClick={confirm}
                disabled={!checked}
                className="flex-[2] py-3 rounded-xl bg-blue-600 disabled:bg-slate-700 disabled:text-slate-400 font-semibold"
              >
                Confirm & use values
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ConfidenceBadge({ state }: { state?: FieldState }) {
  if (!state || state.value === "")
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">{state && state.confidence === 0 ? "Uncertain — select value" : "Missing"}</span>;
  if (state.userVerified) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">Set by you</span>;
  const lvl = confidenceLevel(state.confidence);
  const cls =
    lvl === "high" ? "bg-green-500/20 text-green-300" : lvl === "medium" ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300";
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`} title={`${Math.round(state.confidence * 100)}% sure`}>
      {lvl === "high" ? "Detected" : lvl === "medium" ? `Please verify · ${Math.round(state.confidence * 100)}%` : "Uncertain — select value"}
    </span>
  );
}

/** Live totals from the values currently in the form, so the user sees exactly what will be used. */
function ResourceBreakdown({ target, fields }: { target: ScreenshotTarget; fields: Record<string, FieldState> }) {
  const n = (k: string) => {
    const v = fields[k]?.value;
    return v === undefined || v === "" ? null : Number(v);
  };
  const fmt = (v: number) => v.toLocaleString();
  let rows: { label: string; count: number | null; each: number }[] = [];
  let totalLabel = "";
  if (target === "enhancement_components") {
    rows = [
      { label: "100 XP components", count: n("xp100"), each: 100 },
      { label: "10 XP components", count: n("xp10"), each: 10 },
    ];
    totalLabel = "Total Enhancement XP";
  } else if (target === "hero_exp_items") {
    rows = [
      { label: "50K EXP items", count: n("exp50k"), each: 50_000 },
      { label: "10K EXP items", count: n("exp10k"), each: 10_000 },
      { label: "5K EXP items", count: n("exp5k"), each: 5_000 },
      { label: "1K EXP items", count: n("exp1k"), each: 1_000 },
    ];
    totalLabel = "Total Hero EXP";
  } else {
    const key = target === "hero_exp_total" ? "total" : "qty";
    const t = n(key);
    return (
      <div className="card flex items-center justify-between" aria-live="polite">
        <span className="text-sm text-slate-300">{target === "hero_exp_total" ? "Hero EXP" : SCREENSHOT_TARGETS[target].title}</span>
        <span className="text-lg font-semibold tabular-nums">{t === null ? "—" : fmt(t)}</span>
      </div>
    );
  }
  const total = rows.reduce((s, r) => s + (r.count ?? 0) * r.each, 0);
  return (
    <div className="card flex flex-col gap-1.5 text-sm" aria-live="polite">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-2 tabular-nums">
          <span className="text-slate-300">{r.label}</span>
          <span className="text-right">
            {r.count === null ? <span className="text-slate-500">—</span> : <>{fmt(r.count)} × {fmt(r.each)} = <b>{fmt(r.count * r.each)}</b></>}
          </span>
        </div>
      ))}
      <div className="flex justify-between border-t border-slate-700 pt-1.5 mt-0.5">
        <span className="font-semibold">{totalLabel}</span>
        <span className="font-semibold tabular-nums">{fmt(total)}</span>
      </div>
    </div>
  );
}

/** Says exactly what "Confirm" will change, so Total and Items Hero EXP are never added together. */
function ApplyNote({ target }: { target: ScreenshotTarget }) {
  const text: Record<ScreenshotTarget, string> = {
    hero_exp_total: "Confirming switches Hero EXP to Total mode with this number. Your EXP item counts are kept but not used — the two are never added together.",
    hero_exp_items: "Confirming switches Hero EXP to EXP Items mode with these counts. A Total you typed is kept but not used — the two are never added together.",
    enhancement_components: "Confirming replaces your 10 XP and 100 XP component counts. Sacrificed gear XP is not changed.",
    essence_stones: "Confirming replaces your Essence Stones amount.",
    mithril: "Confirming replaces your Mithril amount.",
  };
  return <p className="text-xs text-slate-400 px-1">{text[target]}</p>;
}

/**
 * Other plausible readings as buttons. Low confidence (field left empty):
 * "Uncertain — select value: [53] [23]". Otherwise: "Other possible readings".
 */
function ValueChoices({
  current,
  detected,
  confidence,
  alternates,
  onChoose,
}: {
  current: string;
  detected: number | null;
  confidence: number;
  alternates: number[];
  onChoose: (v: number) => void;
}) {
  const empty = current === "";
  const options = [...new Set([...(empty && detected !== null ? [detected] : []), ...alternates])].filter((v) => String(v) !== current);
  if (!options.length) return null;
  return (
    <div className={`mt-1.5 flex flex-wrap items-center gap-1.5 rounded px-2 py-1.5 ${empty ? "bg-red-500/10 border border-red-900/60" : "bg-slate-900/60 border border-slate-800"}`}>
      <span className={`text-[11px] ${empty ? "text-red-200" : "text-slate-400"}`}>
        {empty ? `Uncertain${detected !== null ? ` (${Math.round(confidence * 100)}%)` : ""} — select value:` : "Other possible readings:"}
      </span>
      {options.map((v) => (
        <button
          key={v}
          type="button"
          className="text-xs px-2.5 py-1 rounded bg-slate-800 border border-slate-600 tabular-nums"
          onClick={(e) => {
            e.stopPropagation();
            onChoose(v);
          }}
          aria-label={`Use ${v}`}
        >
          {v.toLocaleString()}
        </button>
      ))}
    </div>
  );
}

/** The part of the screenshot a value was read from (e.g. one component tile), shown next to the field. */
function SourceCrop({ src, size, box, label }: { src: string; size: { w: number; h: number }; box: BBox; label: string }) {
  const W = 96;
  const k = W / box.width;
  return (
    <div
      role="img"
      aria-label={label}
      className="mt-1 rounded-md border border-slate-700 shrink-0"
      style={{
        width: W,
        height: Math.round(box.height * k),
        backgroundImage: `url(${src})`,
        backgroundSize: `${size.w * k}px ${size.h * k}px`,
        backgroundPosition: `${-box.x * k}px ${-box.y * k}px`,
      }}
    />
  );
}
