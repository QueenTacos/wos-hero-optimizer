import { TroopType } from "@/lib/types";

export function TroopBadge({ troopType }: { troopType: TroopType }) {
  return <span className={`troop-badge troop-${troopType}`}>{troopType}</span>;
}
