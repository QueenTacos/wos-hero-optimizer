"use client";

import { useState } from "react";
import { TroopBadge } from "@/components/TroopBadge";
import { TroopType } from "@/lib/types";
import { recommendCounter } from "@/lib/optimizer/counters";

const TROOP_TYPES: TroopType[] = ["Infantry", "Lancer", "Marksman"];

export default function CombatPage() {
  const [opponent, setOpponent] = useState<TroopType>("Infantry");
  const recommendation = recommendCounter(opponent);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">
        Optional PvP/PvE guidance based on the classic counter triangle: Infantry beats Lancer, Lancer beats
        Marksman, Marksman beats Infantry.
      </p>

      <div className="card">
        <h3 className="font-semibold mb-2">Opponent's dominant troop type</h3>
        <div className="flex gap-2">
          {TROOP_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setOpponent(t)}
              className={`flex-1 py-2 rounded-lg text-sm ${opponent === t ? "bg-blue-600" : "bg-slate-800"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-2">Recommendation</h3>
        <div className="flex items-center gap-2 text-sm">
          Lead with <TroopBadge troopType={recommendation.recommendedTroopType} />
        </div>
        <p className="text-xs text-slate-400 mt-2">{recommendation.explanation}</p>
      </div>
    </div>
  );
}
