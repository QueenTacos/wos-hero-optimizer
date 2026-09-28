"use client";

// ============================================================================
// <HeroPortrait heroId="sergey" />
//
// Renders a hero from the local portrait library (lib/data/heroPortraits.ts).
//  - consistent square sizing, object-fit: cover
//  - falls back to initials if the id is unknown OR the image fails to load
//  - optional confidence indicator for screenshot-detection results
//  - never throws
// ============================================================================

import { useState } from "react";
import { getHeroPortraitPath, normalizeHeroId } from "@/lib/data/heroPortraits";
import { getHeroDefinition } from "@/lib/data/heroDatabase";
import { confidenceLevel } from "@/lib/screenshot/quantityTokens";

export type HeroPortraitSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<HeroPortraitSize, number> = { xs: 24, sm: 32, md: 44, lg: 64, xl: 96 };

const TROOP_RING: Record<string, string> = {
  Infantry: "ring-blue-400/70",
  Lancer: "ring-amber-400/70",
  Marksman: "ring-green-400/70",
};

export function HeroPortrait({
  heroId,
  size = "md",
  confidence,
  showTroopRing = false,
  className = "",
  title,
  decorative = false,
}: {
  heroId: string | null | undefined;
  size?: HeroPortraitSize;
  /** 0-1. When provided, shows a small % badge coloured by confidence level. */
  confidence?: number;
  /** Outline the portrait in the hero's troop colour. */
  showTroopRing?: boolean;
  className?: string;
  title?: string;
  /** Set when the hero's name is already shown next to the portrait, so screen readers don't read it twice. */
  decorative?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const def = heroId ? getHeroDefinition(heroId) : undefined;
  const src = getHeroPortraitPath(heroId);
  const px = SIZE_PX[size];
  const label = title ?? def?.name ?? (heroId ? heroId : "Unknown hero");
  const showImage = src !== null && failedSrc !== src;

  const ring = showTroopRing && def ? `ring-2 ${TROOP_RING[def.troopType] ?? ""}` : "";

  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: px, height: px }}
      title={decorative ? undefined : label}
      data-hero-id={heroId ? normalizeHeroId(heroId) : undefined}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={decorative ? "" : label}
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src)}
          className={`block w-full h-full rounded-lg object-cover bg-slate-700 ${ring}`}
        />
      ) : (
        <span
          role={decorative ? undefined : "img"}
          aria-label={decorative ? undefined : label}
          aria-hidden={decorative || undefined}
          className={`flex w-full h-full items-center justify-center rounded-lg bg-slate-700 text-slate-300 font-semibold ${ring}`}
          style={{ fontSize: Math.max(10, px * 0.38) }}
        >
          {initials(def?.name ?? heroId ?? "")}
        </span>
      )}

      {confidence !== undefined && <ConfidenceDot confidence={confidence} px={px} />}
    </span>
  );
}

function ConfidenceDot({ confidence, px }: { confidence: number; px: number }) {
  const c = Math.max(0, Math.min(1, confidence));
  const lvl = confidenceLevel(c);
  const color = lvl === "high" ? "bg-green-500" : lvl === "medium" ? "bg-amber-500" : "bg-red-500";
  return (
    <span
      className={`absolute -bottom-1 -right-1 rounded-full px-1 leading-4 text-[10px] font-bold text-white shadow ${color}`}
      style={{ minWidth: Math.min(px, 30) }}
      aria-label={`${Math.round(c * 100)}% confidence`}
    >
      {Math.round(c * 100)}%
    </span>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[-_]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
