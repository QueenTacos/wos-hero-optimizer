"use client";

// Small shared pieces for every scan review screen (confidence chips,
// "Detected X · Use X" prompts for low-confidence values, progress bar,
// full-screen sheet frame).

import { useEffect } from "react";
import { ConfidenceBand, confidenceBand } from "@/lib/screenshot/scanTypes";

const BAND_STYLE: Record<ConfidenceBand, string> = {
  high: "bg-green-500/20 text-green-300",
  medium: "bg-amber-500/20 text-amber-300",
  low: "bg-red-500/20 text-red-300",
};

export function ConfidenceChip({ confidence, userSet, missing }: { confidence: number; userSet?: boolean; missing?: boolean }) {
  if (missing) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300">Missing</span>;
  if (userSet) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300">Set by you</span>;
  const band = confidenceBand(confidence);
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${BAND_STYLE[band]}`} title={`${Math.round(confidence * 100)}% sure`}>
      {band === "high" ? "Read" : band === "medium" ? "Check" : "Guess"} · {Math.round(confidence * 100)}%
    </span>
  );
}

/** Shown instead of pre-filling a low-confidence value. */
export function UseDetected({ label, confidence, onUse }: { label: string; confidence: number; onUse: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-red-500/10 border border-red-900/60 px-2 py-1">
      <span className="text-[11px] text-red-200">
        Detected {label} ({Math.round(confidence * 100)}%)
      </span>
      <button type="button" onClick={onUse} className="text-[11px] px-2 py-0.5 rounded bg-slate-800 border border-slate-600">
        Use {label}
      </button>
    </div>
  );
}

export function ProgressBar({ label, p }: { label: string; p: number }) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="text-sm text-slate-300">{label}…</div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(p * 100)}>
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.max(5, p * 100)}%` }} />
      </div>
    </div>
  );
}

/** Full-screen sheet with a title, Cancel, and a fixed footer. Locks page scroll while open. */
export function ScanSheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 overflow-y-auto overflow-x-hidden overscroll-contain" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-w-xl mx-auto px-4 py-4 pb-32 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-sm text-slate-300 px-3 py-1 border border-slate-700 rounded-lg">
            Cancel
          </button>
        </div>
        {children}
      </div>
      {footer && (
        <div className="fixed bottom-0 inset-x-0 bg-slate-950 border-t border-slate-800">
          <div className="max-w-xl mx-auto px-4 py-3 flex flex-col gap-2">{footer}</div>
        </div>
      )}
    </div>
  );
}

/** Screenshot with tappable outlines over detected values. Coordinates are in image pixels. */
export function TokenOverlay({
  src,
  size,
  boxes,
}: {
  src: string;
  size: { width: number; height: number };
  boxes: { id: string; box: { x: number; y: number; width: number; height: number }; label: string; used: boolean; onTap?: () => void; kind?: "value" | "tile" }[];
}) {
  return (
    <div className="relative w-full select-none overflow-hidden rounded-lg">
      <img src={src} alt="Your screenshot with detected values outlined" className="w-full rounded-lg block" />
      {boxes.map((b) => {
        const tile = b.kind === "tile";
        const style = tile
          ? {
              left: `${(b.box.x / size.width) * 100}%`,
              top: `${(b.box.y / size.height) * 100}%`,
              width: `${(b.box.width / size.width) * 100}%`,
              height: `${(b.box.height / size.height) * 100}%`,
            }
          : {
              left: `${((b.box.x + b.box.width / 2) / size.width) * 100}%`,
              top: `${((b.box.y + b.box.height / 2) / size.height) * 100}%`,
              width: `max(${((b.box.width + 8) / size.width) * 100}%, 32px)`,
              height: `max(${((b.box.height + 8) / size.height) * 100}%, 26px)`,
              transform: "translate(-50%, -50%)",
            };
        const cls = tile
          ? "border-dashed border-sky-400/80 pointer-events-none"
          : b.used
            ? "border-green-400 bg-green-400/20"
            : "border-amber-400 bg-amber-400/15";
        return b.onTap && !tile ? (
          <button key={b.id} type="button" onClick={b.onTap} aria-label={b.label} title={b.label} className={`absolute rounded border-2 ${cls}`} style={style} />
        ) : (
          <div key={b.id} aria-hidden className={`absolute rounded border-2 ${cls}`} style={style}>
            {tile && <span className="absolute -top-4 left-0 text-[9px] text-sky-300 whitespace-nowrap">{b.label}</span>}
          </div>
        );
      })}
    </div>
  );
}
