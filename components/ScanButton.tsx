"use client";

// ============================================================================
// <ScanButton scanType=… onDetected=…/> — the one scan entry point used by
// every section. It renders the section's scan button (same look everywhere),
// opens the matching scanner sheet, and hands back ONLY what the user
// confirmed on the review step. After a confirmed scan it shows a quiet
// "✓ Scanned" next to the button.
//
//   hero-roster             → RosterScanReview        → roster entries
//   hero-gear               → GearScanReview          → gear per hero (approved slots only)
//   hero-exp                → ScreenshotImport        → Total OR Items (never both)
//   enhancement-components  → ScreenshotImport        → 10 XP / 100 XP counts
//   essence-stones, mithril → ScreenshotImport        → one amount
//   extra-gear, mythic-gear → GearInventoryScanReview → new Extra-gear grid
// ============================================================================

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ScanType, SCAN_TYPES } from "@/lib/screenshot/scanTypes";
import { ScreenshotTarget } from "@/lib/screenshot/targets";
import { ConfirmedRosterEntry } from "@/lib/screenshot/rosterMerge";
import { ConfirmedGearScan, RowGearLike } from "@/lib/screenshot/gearScanApply";
import { UnassignedGearInventory } from "@/lib/types";
import { ScreenshotImport } from "@/components/ScreenshotImport";
import { RosterScanReview } from "@/components/RosterScanReview";
import { GearScanReview } from "@/components/GearScanReview";
import { GearInventoryScanReview } from "@/components/GearInventoryScanReview";

export type ScanDetected =
  | { type: "hero-roster"; entries: ConfirmedRosterEntry[] }
  | { type: "hero-gear"; scans: ConfirmedGearScan[] }
  | { type: "resource"; scanType: "hero-exp" | "enhancement-components" | "essence-stones" | "mithril"; target: ScreenshotTarget; values: Record<string, number | null> }
  | { type: "gear-inventory"; scanType: "extra-gear" | "mythic-gear"; unassignedGear: UnassignedGearInventory; summary: string };

const RESOURCE_TARGET: Record<"enhancement-components" | "essence-stones" | "mithril", ScreenshotTarget> = {
  "enhancement-components": "enhancement_components",
  "essence-stones": "essence_stones",
  mithril: "mithril",
};

export function ScanButton({
  scanType,
  onDetected,
  label,
  size = "md",
  heroExpMode = "total",
  existingGear = {},
  heroId,
  unassignedGear,
}: {
  scanType: ScanType;
  onDetected: (d: ScanDetected) => void;
  label?: string;
  size?: "sm" | "md";
  /** hero-exp: which screenshot kind to offer first. */
  heroExpMode?: "total" | "items";
  /** hero-gear: current gear per hero id, to show what will change. */
  existingGear?: Record<string, RowGearLike>;
  /** hero-gear: scan started from this hero's card. */
  heroId?: string;
  /** extra-gear / mythic-gear: current grid. */
  unassignedGear?: UnassignedGearInventory;
}) {
  const [open, setOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const info = SCAN_TYPES[scanType];
  const done = (d: ScanDetected) => {
    setOpen(false);
    setScanned(true);
    onDetected(d);
  };

  return (
    <>
      <span className="inline-flex items-center gap-2">
        {scanned && <span className="text-[11px] text-green-400" aria-live="polite">✓ Scanned</span>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`text-blue-300 border border-blue-900 rounded-lg inline-flex items-center gap-1 ${size === "sm" ? "text-[11px] px-2 py-1" : "text-xs px-3 py-1.5"}`}
          aria-label={`${label ?? info.buttonLabel}: ${info.title}`}
        >
          <CameraIcon />
          {label ?? info.buttonLabel}
        </button>
      </span>

      {/* Sheets render into <body> so they're never clipped or captured by the section they were opened from. */}
      {mounted &&
        open &&
        createPortal(
          <>
            {open && scanType === "hero-roster" && (
              <RosterScanReview onConfirm={(entries) => done({ type: "hero-roster", entries })} onClose={() => setOpen(false)} />
            )}
            {open && scanType === "hero-gear" && (
              <GearScanReview existingGear={existingGear} initialHeroId={heroId} onConfirm={(scans) => done({ type: "hero-gear", scans })} onClose={() => setOpen(false)} />
            )}
            {open && scanType === "hero-exp" && (
              <ScreenshotImport
                target={heroExpMode === "items" ? "hero_exp_items" : "hero_exp_total"}
                alternativeTargets={[heroExpMode === "items" ? "hero_exp_total" : "hero_exp_items"]}
                onConfirm={(values, target) => done({ type: "resource", scanType, target, values })}
                onClose={() => setOpen(false)}
              />
            )}
            {open && (scanType === "enhancement-components" || scanType === "essence-stones" || scanType === "mithril") && (
              <ScreenshotImport
                target={RESOURCE_TARGET[scanType]}
                onConfirm={(values, target) => done({ type: "resource", scanType, target, values })}
                onClose={() => setOpen(false)}
              />
            )}
            {open && (scanType === "extra-gear" || scanType === "mythic-gear") && unassignedGear && (
              <GearInventoryScanReview
                mythicOnly={scanType === "mythic-gear"}
                current={unassignedGear}
                onConfirm={(next, summary) => done({ type: "gear-inventory", scanType, unassignedGear: next, summary })}
                onClose={() => setOpen(false)}
              />
            )}
          </>,
          document.body
        )}
    </>
  );
}

function CameraIcon() {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
