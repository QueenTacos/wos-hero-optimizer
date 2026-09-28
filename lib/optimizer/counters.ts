import { TroopType } from "../types";

// Infantry beats Lancer, Lancer beats Marksman, Marksman beats Infantry
const BEATS: Record<TroopType, TroopType> = {
  Infantry: "Lancer",
  Lancer: "Marksman",
  Marksman: "Infantry",
};

export function beats(attacker: TroopType, defender: TroopType): boolean {
  return BEATS[attacker] === defender;
}

/** Returns the troop type that counters (beats) the given troop type. */
export function counterTo(troopType: TroopType): TroopType {
  const entry = (Object.entries(BEATS) as [TroopType, TroopType][]).find(
    ([, beaten]) => beaten === troopType
  );
  if (!entry) throw new Error(`No counter found for ${troopType}`);
  return entry[0];
}

export interface CounterRecommendation {
  opponentTroopType: TroopType;
  recommendedTroopType: TroopType;
  explanation: string;
}

/** Given an opponent's dominant troop type, recommend which troop type to lead with. */
export function recommendCounter(opponentTroopType: TroopType): CounterRecommendation {
  const recommended = counterTo(opponentTroopType);
  return {
    opponentTroopType,
    recommendedTroopType: recommended,
    explanation: `${recommended} beats ${opponentTroopType}, so lead with ${recommended}-focused heroes/troops.`,
  };
}
