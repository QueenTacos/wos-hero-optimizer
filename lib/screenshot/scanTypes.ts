// ============================================================================
// Common scan model — every screenshot scanner in the app reports through
// these types, and every result goes through a review step before use.
//
// Confidence bands (same thresholds as quantityTokens.confidenceLevel):
//   high   ≥ 0.85  value is pre-filled; user still confirms
//   medium ≥ 0.50  value is pre-filled and highlighted for review
//   low    < 0.50  value is NOT pre-filled — shown as "Detected: X · Use X"
//                  and only used if the user taps it or types a value
// ============================================================================

export type ScanType =
  | "hero-roster"
  | "hero-gear"
  | "hero-exp"
  | "enhancement-components"
  | "essence-stones"
  | "mithril"
  | "mythic-gear"
  | "extra-gear";

export interface ScanFieldResult<T> {
  value: T;
  /** 0–1 */
  confidence: number;
  /** Where the value came from, e.g. "“Essence Stone” label row", "tile colour". */
  source?: string;
  warning?: string;
}

export interface ScanResult {
  type: ScanType;
  fields: Record<string, ScanFieldResult<unknown>>;
  warnings?: string[];
}

export type ConfidenceBand = "high" | "medium" | "low";

export const HIGH_CONFIDENCE = 0.85;
export const MEDIUM_CONFIDENCE = 0.5;

export function confidenceBand(c: number): ConfidenceBand {
  if (c >= HIGH_CONFIDENCE) return "high";
  if (c >= MEDIUM_CONFIDENCE) return "medium";
  return "low";
}

/** The value a review form starts with: low-confidence values are never pre-filled. */
export function initialReviewValue<T>(field: ScanFieldResult<T> | undefined): T | null {
  if (!field || field.value === null || field.value === undefined) return null;
  return confidenceBand(field.confidence) === "low" ? null : field.value;
}

export interface ScanTypeInfo {
  /** Text on the section's scan button. */
  buttonLabel: string;
  /** Title of the scan sheet. */
  title: string;
  /** More than one screenshot can be added in one scan. */
  multiple: boolean;
}

export const SCAN_TYPES: Record<ScanType, ScanTypeInfo> = {
  "hero-roster": { buttonLabel: "Scan roster", title: "Hero roster", multiple: true },
  "hero-gear": { buttonLabel: "Scan gear", title: "Hero Gear", multiple: true },
  "hero-exp": { buttonLabel: "Scan", title: "Hero EXP", multiple: false },
  "enhancement-components": { buttonLabel: "Scan", title: "Enhancement Components", multiple: false },
  "essence-stones": { buttonLabel: "Scan", title: "Essence Stones", multiple: false },
  mithril: { buttonLabel: "Scan", title: "Mithril", multiple: false },
  "mythic-gear": { buttonLabel: "Scan", title: "Spare Mythic Gear", multiple: true },
  "extra-gear": { buttonLabel: "Scan inventory", title: "Extra / Unassigned Gear", multiple: true },
};
