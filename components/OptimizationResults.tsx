"use client";

// Result screen per spec §24.

import { HeroPortrait } from "@/components/HeroPortrait";
import { TroopBadge } from "@/components/TroopBadge";
import { RARITY_TEXT, SLOT_LABELS } from "@/components/GearEditor";
import { GEAR_RARITY_LABELS, GEAR_RARITY_ORDER } from "@/lib/data/gearRarity";
import { GearRarity, GEAR_SLOTS, Hero, OptimizationResult } from "@/lib/types";

const fmt = (n: number) => n.toLocaleString();

function Totals({ available, used, remaining, unit }: { available: number; used: number; remaining: number; unit: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
      {[
        ["Available", available],
        ["Used", used],
        ["Remaining", remaining],
      ].map(([label, v]) => (
        <div key={label as string} className="rounded-lg bg-slate-900/70 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
          <div className="text-sm font-semibold tabular-nums">{fmt(v as number)}</div>
        </div>
      ))}
      <div className="col-span-3 text-[10px] text-slate-500 -mt-1">{unit}</div>
    </div>
  );
}

function HeroLine({ hero, rank, children }: { hero: Hero; rank?: number; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-slate-800 last:border-0">
      {rank !== undefined && <span className="text-xs text-slate-400 w-5">#{rank}</span>}
      <HeroPortrait heroId={hero.heroDefId} size="sm" decorative />
      <span className="flex-1 min-w-0">
        <span className="text-sm truncate block">{hero.name}</span>
        <TroopBadge troopType={hero.troopType} />
      </span>
      {children}
    </div>
  );
}

function StatusChip({ status }: { status: "complete" | "blocked" | "partial" | "waiting" }) {
  const map = {
    complete: ["Done", "bg-green-500/15 text-green-300"],
    blocked: ["Needs materials", "bg-orange-500/15 text-orange-300"],
    partial: ["Ran out of XP", "bg-slate-700 text-slate-300"],
    waiting: ["Waiting for priority", "bg-slate-700 text-slate-400"],
  } as const;
  const [label, cls] = map[status];
  return <span className={`text-[10px] px-1.5 rounded ${cls}`}>{label}</span>;
}

function RarityText({ rarity }: { rarity: GearRarity | null }) {
  if (!rarity) return <span className="text-slate-500">none</span>;
  return <span className={RARITY_TEXT[rarity]}>{GEAR_RARITY_LABELS[rarity]}</span>;
}

export function OptimizationResults({ result }: { result: OptimizationResult }) {
  const r = result;
  const after = new Map(r.heroesAfterGear.map((h) => [h.id, h]));
  const nameById = new Map(r.heroesAfterGear.map((h) => [h.id, h.name]));

  return (
    <div className="flex flex-col gap-4 mt-2">
      <h2 className="font-semibold text-lg">Results</h2>

      {/* ---- Top 5 Hero EXP ---- */}
      <div className="card">
        <h3 className="font-semibold mb-1">Top 5 — Hero EXP</h3>
        {r.selectedTop5.map((hero, idx) => {
          const step = r.heroLevelPlan.steps.find((s) => s.heroId === hero.id);
          return (
            <HeroLine key={hero.id} hero={hero} rank={idx + 1}>
              <span className="text-right text-xs tabular-nums">
                <span className="block text-sm">
                  Lv {hero.level} {step ? <>→ <b>{step.toLevel}</b></> : <span className="text-slate-500">(no change)</span>}
                </span>
                <span className="text-slate-400">{step ? `${fmt(step.xpSpent)} EXP` : "—"}</span>
              </span>
            </HeroLine>
          );
        })}
        <Totals available={r.resourcesAvailable.heroExp} used={r.resourcesUsed.heroExp} remaining={r.resourcesRemaining.heroExp} unit="Hero EXP" />
      </div>

      {/* ---- Top 5 Gear Assignment ---- */}
      <div className="card">
        <h3 className="font-semibold mb-1">Gear Assignment</h3>
        {r.gearAssignmentPlan.assignments.length === 0 ? (
          <div className="text-xs text-slate-400 py-1">No gear changes recommended.</div>
        ) : (
          r.gearAssignmentPlan.assignments.map((a, i) => {
            const hero = after.get(a.heroId);
            return (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-slate-800 last:border-0 text-xs">
                <HeroPortrait heroId={hero?.heroDefId} size="xs" decorative />
                <span className="flex-1">
                  <b className="text-slate-200">{a.heroName}</b> · {SLOT_LABELS[a.slot]}:{" "}
                  <RarityText rarity={a.previousRarity} /> → <RarityText rarity={a.newRarity} />
                  {a.newEnhancementLevel > 0 && <span className="text-slate-400"> +{a.newEnhancementLevel}</span>}
                  <span className="block text-slate-500">
                    {a.source === "reclaimed-from-hero"
                      ? `moved from ${nameById.get(a.reclaimedFromHeroId ?? "") ?? "a lower-ranked hero"}`
                      : "from unassigned inventory"}
                    {a.previousRarity ? ` · old ${GEAR_RARITY_LABELS[a.previousRarity]} returns to inventory` : ""}
                  </span>
                </span>
              </div>
            );
          })
        )}
        <details className="mt-2">
          <summary className="text-xs text-slate-300 cursor-pointer">Remaining unassigned gear</summary>
          <table className="w-full text-[11px] mt-2 tabular-nums">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left font-normal">Slot</th>
                {GEAR_RARITY_ORDER.map((ra) => (
                  <th key={ra} className="font-normal">{GEAR_RARITY_LABELS[ra].slice(0, 3)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GEAR_SLOTS.map((slot) => (
                <tr key={slot}>
                  <td className="text-slate-300">{SLOT_LABELS[slot]}</td>
                  {GEAR_RARITY_ORDER.map((ra) => (
                    <td key={ra} className="text-center">{r.gearAssignmentPlan.finalUnassignedGear[slot][ra]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      {/* ---- Top 3 Gear Enhancement: Enhancement XP only ---- */}
      <div className="card">
        <h3 className="font-semibold">Top 3 — Gear Enhancement</h3>
        <p className="text-[11px] text-slate-400 mb-1">
          Enhancement XP only. {r.gearEnhancementPlan.prioritySource === "manual" ? "Your marked priority pieces" : "Each hero's 2 most-progressed pieces"} are
          finished first, then the rest are balanced.
        </p>
        {r.selectedTop3.map((hero, idx) => {
          const pieces = (r.gearEnhancementPlan.pieces ?? []).filter((p) => p.heroId === hero.id);
          const h = after.get(hero.id) ?? hero;
          return (
            <div key={hero.id} className="py-1.5 border-b border-slate-800 last:border-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-400 w-5">#{idx + 1}</span>
                <HeroPortrait heroId={hero.heroDefId} size="sm" decorative />
                <span className="text-sm font-medium">{hero.name}</span>
              </div>
              <div className="flex flex-col gap-1 pl-7 text-xs tabular-nums">
                {GEAR_SLOTS.map((slot) => {
                  const p = pieces.find((x) => x.slot === slot);
                  if (!p || !h.gear[slot]) {
                    return (
                      <div key={slot} className="text-slate-500">
                        {SLOT_LABELS[slot]}: empty
                      </div>
                    );
                  }
                  return (
                    <div key={slot} className="flex flex-col">
                      <div className="flex flex-wrap items-center gap-x-1.5">
                        <span className="text-slate-400 w-14">{SLOT_LABELS[slot]}</span>
                        <RarityText rarity={p.quality} />
                        <span>
                          +{p.fromLevel}
                          {p.toLevel > p.fromLevel && <> → <b>+{p.toLevel}</b></>}
                        </span>
                        {p.mastery.level > 0 && <span className="text-slate-500">· Mastery {p.mastery.level}{p.mastery.level >= 4 ? `.${p.mastery.stage}` : ""}</span>}
                        <span className="text-slate-500">· {fmt(p.xpSpent)} XP</span>
                        {p.priority && <span className="text-[10px] px-1.5 rounded bg-amber-500/15 text-amber-300">Priority</span>}
                        <StatusChip status={p.status} />
                      </div>
                      {p.next && <div className="text-[11px] text-slate-500 pl-14">{p.next}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Totals
          available={r.resourcesAvailable.enhancementXp}
          used={r.resourcesUsed.enhancementXp}
          remaining={r.resourcesRemaining.enhancementXp}
          unit="Enhancement XP"
        />
      </div>

      {/* ---- Mastery / Legendary: separate resource pools ---- */}
      {r.progressionPlan && r.progressionPlan.milestones.some((m) => m.kind !== "none") && (
        <div className="card">
          <h3 className="font-semibold">Top 3 — Mastery &amp; Legendary</h3>
          <p className="text-[11px] text-slate-400 mb-2">
            Next milestone for each piece. Paid from Essence Stones, Mithril and spare Mythic gear — never Enhancement XP.
            Priority pieces are funded first; a milestone is only counted if it can be paid in full.
          </p>
          <div className="flex flex-col gap-1.5">
            {r.progressionPlan.milestones
              .filter((m) => m.kind !== "none")
              .map((m) => (
                <div key={`${m.heroId}:${m.slot}`} className="text-xs border-b border-slate-800 last:border-0 pb-1.5">
                  <div className="flex flex-wrap items-center gap-x-1.5">
                    <b className="text-slate-200">{m.heroName}</b>
                    <span className="text-slate-400">{SLOT_LABELS[m.slot]}</span>
                    <span>{m.title}</span>
                    {m.priority && <span className="text-[10px] px-1.5 rounded bg-amber-500/15 text-amber-300">Priority</span>}
                    {m.unknown.length > 0 ? (
                      <span className="text-[10px] px-1.5 rounded bg-slate-700 text-slate-300">Needs data</span>
                    ) : m.affordable ? (
                      <span className="text-[10px] px-1.5 rounded bg-green-500/15 text-green-300">Can do now</span>
                    ) : (
                      <span className="text-[10px] px-1.5 rounded bg-red-500/15 text-red-300">Short</span>
                    )}
                  </div>
                  <div className="text-slate-400 tabular-nums">
                    {[
                      m.cost.essenceStones && `${fmt(m.cost.essenceStones)} Essence Stones`,
                      m.cost.mithril && `${fmt(m.cost.mithril)} Mithril`,
                      m.cost.mythicGear && `${fmt(m.cost.mythicGear)} Mythic gear`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                    {m.shortBy.length > 0 && <span className="text-red-300"> · short {m.shortBy.join(", ")}</span>}
                    {m.unknown.length > 0 && <span className="text-slate-500"> · unknown: {m.unknown.join(", ")}</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">{m.detail}{m.usesWikiData ? " (includes wiki data — please confirm)" : ""}</div>
                </div>
              ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center text-[11px] tabular-nums">
            {(["essenceStones", "mithril", "spareMythicGear"] as const).map((k) => (
              <div key={k} className="rounded-lg bg-slate-900/70 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  {k === "essenceStones" ? "Essence" : k === "mithril" ? "Mithril" : "Mythic gear"}
                </div>
                <div>
                  {fmt(r.progressionPlan!.resourcesUsed[k])} / {fmt(r.progressionPlan!.resourcesAvailable[k])} used
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.warnings.length > 0 && (
        <div className="card border border-amber-900">
          <h3 className="font-semibold mb-2 text-amber-400">Notes & Assumptions</h3>
          <ul className="text-xs text-slate-300 list-disc pl-4 flex flex-col gap-1">
            {r.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
