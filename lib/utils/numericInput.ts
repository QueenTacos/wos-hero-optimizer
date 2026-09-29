// ============================================================================
// Editing-safe numeric input rules (pure — used by <NumericInput> and tests).
//
// The field keeps what the user is typing as TEXT. Nothing is clamped while
// typing; the value is only parsed/clamped when the field is committed (blur
// or Enter). That lets people clear a field and type "50" on a phone without
// it snapping back to 1 or jumping to the maximum.
// ============================================================================

export interface NumericRules {
  min?: number;
  max?: number;
  /** Allow a decimal point / K / M suffix while typing (resource totals). Default: whole numbers only. */
  allowGameNumber?: boolean;
  /** Allow one decimal point (e.g. star values like 4.5). */
  allowDecimal?: boolean;
  /** What a blank field commits to. Default: keep the previous value. */
  blank?: "previous" | "min" | "zero";
}

/**
 * Returns the new draft text if `next` is an acceptable in-progress entry,
 * or null to reject the keystroke (the field keeps its current text).
 * Empty is always accepted — the user must be able to clear the field.
 */
export function acceptNumericDraft(next: string, rules: NumericRules = {}): string | null {
  if (next === "") return "";
  if (rules.allowGameNumber) {
    // "1,250" · "10.5" · "10.5K" · "143.39M" — commas are allowed while typing and dropped on commit.
    return /^[\d,]*\.?\d*[kKmM]?$/.test(next) ? next : null;
  }
  if (rules.allowDecimal) return /^\d*\.?\d*$/.test(next) ? next : null;
  return /^\d*$/.test(next) ? next : null;
}

/** Parses committed text. Returns null for blank/unreadable text. */
export function parseNumericDraft(text: string, rules: NumericRules = {}): number | null {
  const t = text.trim().replace(/,/g, "");
  if (t === "") return null;
  if (rules.allowGameNumber) {
    const m = t.match(/^(\d*\.?\d*)([kKmM]?)$/);
    if (!m || m[1] === "" || m[1] === ".") return null;
    const mult = m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
    const n = Number(m[1]) * mult;
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  if (rules.allowDecimal) {
    if (!/^\d*\.?\d*$/.test(t) || t === ".") return null;
    return Number(t);
  }
  if (!/^\d+$/.test(t)) return null;
  return Number.parseInt(t, 10);
}

/**
 * The value to store when the field is committed.
 *   blank / invalid → previous value (or min / 0 if `rules.blank` says so)
 *   out of range    → clamped into [min, max]
 */
export function commitNumericDraft(text: string, previous: number, rules: NumericRules = {}): number {
  const parsed = parseNumericDraft(text, rules);
  let v: number;
  if (parsed === null) {
    v = rules.blank === "min" ? rules.min ?? 0 : rules.blank === "zero" ? 0 : previous;
  } else v = parsed;
  if (rules.min !== undefined) v = Math.max(rules.min, v);
  if (rules.max !== undefined) v = Math.min(rules.max, v);
  return v;
}

/** Hero Level: any whole number 1–80; blank/invalid restores the previous level. */
export const HERO_LEVEL_RULES: NumericRules = { min: 1, max: 80 };

export function normalizeHeroLevel(value: string, previous: number): number {
  return commitNumericDraft(value, previous, HERO_LEVEL_RULES);
}
