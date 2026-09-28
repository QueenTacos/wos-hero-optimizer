// ============================================================================
// Screenshot quantity tokens — pure, framework-free helpers (Phase 2).
//
// OCR hands us "words" with bounding boxes. This module turns those into
// clean numeric quantities, orders them the way a person reads the screen,
// and produces *suggested* field values. Nothing here is ever applied to the
// inventory directly — every suggestion goes through the Review/Confirm
// screen first.
// ============================================================================

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single OCR word, engine-agnostic. `confidence` is 0-1. */
export interface OcrWord {
  text: string;
  confidence: number;
  bbox: BBox;
}

/** A number found on the screenshot. */
export interface QuantityToken {
  id: string;
  rawText: string;
  value: number;
  confidence: number; // 0-1
  bbox: BBox;
}

/** A proposed value for one review field. */
export interface FieldSuggestion {
  fieldKey: string;
  value: number | null;
  tokenId: string | null;
  confidence: number; // 0-1; 0 when nothing was suggested
  reason: string;
}

// Common OCR look-alikes, only applied inside tokens that are already mostly digits.
const LOOKALIKES: Record<string, string> = {
  o: "0",
  O: "0",
  D: "0",
  l: "1",
  I: "1",
  "|": "1",
  i: "1",
  S: "5",
  s: "5",
  B: "8",
  Z: "2",
  z: "2",
};

/**
 * Parses one OCR token into a quantity, or null if it isn't a number.
 *
 * Handles: "1,234" · "1.234" (thousands dot) · "12.5K" · "3.6M" · "x45" ·
 * "×45" · "45x" · stray punctuation · common look-alikes ("1O5" -> 105).
 */
export function parseQuantityText(raw: string): number | null {
  if (!raw) return null;
  let t = raw.trim();

  // Strip quantity markers like "x12", "×12", "12x" and wrapping punctuation.
  t = t.replace(/^[\s(\[:;'"`~*×xX]+/, "").replace(/[\s)\]:;'"`~*×xX]+$/, "");
  if (!t) return null;

  // Pull the suffix off before look-alike fixing so "K"/"M" survive.
  const suffixMatch = t.match(/([kKmM])$/);
  const suffix = suffixMatch ? suffixMatch[1].toLowerCase() : "";
  if (suffix) t = t.slice(0, -1);

  // Only fix look-alikes if at least half of the characters are real digits.
  const digitCount = (t.match(/\d/g) || []).length;
  if (digitCount === 0) return null;
  if (digitCount / t.length >= 0.5) {
    t = t
      .split("")
      .map((c) => LOOKALIKES[c] ?? c)
      .join("");
  }

  if (!/^[\d.,]+$/.test(t)) return null;

  let value: number;
  if (suffix) {
    // "12.5K" / "3,6M" — treat the last separator as a decimal point.
    const normalized = t.replace(/,/g, ".");
    const parts = normalized.split(".");
    const n =
      parts.length > 1 ? parseFloat(parts.slice(0, -1).join("") + "." + parts[parts.length - 1]) : parseFloat(normalized);
    if (!Number.isFinite(n)) return null;
    value = Math.round(n * (suffix === "k" ? 1_000 : 1_000_000));
  } else {
    // Plain integer quantities: separators are thousands separators ("1,234" / "1.234").
    // Reject malformed groupings such as "12,34".
    if (/[.,]/.test(t) && !/^\d{1,3}([.,]\d{3})+$/.test(t)) return null;
    value = parseInt(t.replace(/[.,]/g, ""), 10);
  }

  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Converts OCR words into numeric tokens, dropping anything that isn't a number. */
export function extractQuantityTokens(words: OcrWord[], opts: { minConfidence?: number } = {}): QuantityToken[] {
  const minConfidence = opts.minConfidence ?? 0.2;
  const tokens: QuantityToken[] = [];
  words.forEach((w, i) => {
    if (w.confidence < minConfidence) return;
    const value = parseQuantityText(w.text);
    if (value === null) return;
    tokens.push({ id: `t${i}`, rawText: w.text, value, confidence: clamp01(w.confidence), bbox: w.bbox });
  });
  return tokens;
}

/**
 * Sorts tokens top-to-bottom, then left-to-right within a row. Tokens whose
 * vertical centers are within ~60% of the median token height are treated as
 * the same row, which tolerates slight misalignment in game UI grids.
 */
export function sortReadingOrder<T extends { bbox: BBox }>(tokens: T[]): T[] {
  if (tokens.length <= 1) return [...tokens];
  const heights = tokens.map((t) => t.bbox.height).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 1;
  const tolerance = medianH * 0.6;

  const byY = [...tokens].sort((a, b) => centerY(a.bbox) - centerY(b.bbox));
  const rows: T[][] = [];
  for (const t of byY) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(centerY(t.bbox) - rowCenter(row)) <= tolerance) row.push(t);
    else rows.push([t]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.bbox.x - b.bbox.x));
}

/**
 * Suggests a value for each field by assigning tokens in reading order.
 *
 * This is deliberately a *weak* guess — it assumes the items appear on screen
 * in the same order as `fieldKeys` — so suggestion confidence is capped at 0.5
 * and the UI always flags these for the user to confirm.
 */
export function suggestFieldValues(tokens: QuantityToken[], fieldKeys: string[]): FieldSuggestion[] {
  const ordered = sortReadingOrder(tokens);
  return fieldKeys.map((fieldKey, i) => {
    const t = ordered[i];
    if (!t) {
      return { fieldKey, value: null, tokenId: null, confidence: 0, reason: "No number found for this item — enter it manually." };
    }
    return {
      fieldKey,
      value: t.value,
      tokenId: t.id,
      confidence: Math.min(0.5, t.confidence),
      reason: `Guessed from reading order (number #${i + 1} on screen). Tap the right number on the image if this is wrong.`,
    };
  });
}

/** Average OCR confidence across tokens (0 when there are none). */
export function overallConfidence(tokens: QuantityToken[]): number {
  if (tokens.length === 0) return 0;
  return tokens.reduce((s, t) => s + t.confidence, 0) / tokens.length;
}

export type ConfidenceLevel = "high" | "medium" | "low";
export function confidenceLevel(c: number): ConfidenceLevel {
  if (c >= 0.85) return "high";
  if (c >= 0.5) return "medium";
  return "low";
}

function centerY(b: BBox) {
  return b.y + b.height / 2;
}
function rowCenter<T extends { bbox: BBox }>(row: T[]) {
  return row.reduce((s, t) => s + centerY(t.bbox), 0) / row.length;
}
function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
