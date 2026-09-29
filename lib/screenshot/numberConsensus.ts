// ============================================================================
// Quantity consensus: several OCR readings of the same number crop (one per
// preprocessing variant) → one value, a confidence, and alternates.
// Pure — tested with exact cases (e.g. 23 vs 53).
//
//   • readings are normalised with parseGameNumber ("59,302" → 59302; commas
//     are thousands separators, never decimals; bad groupings are rejected)
//   • votes are weighted by OCR confidence
//   • image evidence re-ranks candidates: the number of digit glyphs in the
//     crop, and the 5-vs-2 shape test per digit
//   • a value read by only one pass, or with close rivals, is never "high"
//   • alternates keep the runner-up readings and the usual look-alike swaps
//     (5↔2, 8↔3/6/0, 1↔7) so the review screen can offer them as buttons
// ============================================================================

import { parseGameNumber } from "./resourceReaders";

export interface OcrReading {
  variant: string;
  text: string;
  /** 0–1 */
  confidence: number;
}

export interface QuantityEvidence {
  /** Digits counted in the crop (commas excluded). */
  digitCount?: number;
  /** Per digit position: > 0 looks like a 5, < 0 looks like a 2 (see fiveVersusTwo). */
  fiveTwo?: (number | null)[];
}

export interface QuantityCandidate {
  value: number;
  score: number;
  votes: number;
  variants: string[];
}

export interface QuantityDecision {
  value: number | null;
  confidence: number;
  alternates: number[];
  candidates: QuantityCandidate[];
  notes: string[];
}

// Look-alike pairs for the game's outlined digits, most common first.
const LOOKALIKE_PAIRS: [string, string][] = [["2", "5"], ["5", "2"], ["3", "8"], ["8", "3"], ["1", "7"], ["7", "1"], ["6", "8"], ["8", "6"], ["0", "8"], ["8", "0"]];

/** Tesseract sometimes returns "59 302" or "59.302" for "59,302"; keep only what a quantity can be. */
export function normaliseQuantityText(text: string): number | null {
  const t = text.replace(/\s+/g, "").replace(/[^\d,.]/g, "");
  if (!/\d/.test(t)) return null;
  const v = parseGameNumber(t);
  return v !== null && Number.isInteger(v) ? v : null;
}

/** Single-digit look-alike swaps of a value, most likely first (23 → 53, 28; 53 → 23). */
export function lookalikeSwaps(value: number, max = 3): number[] {
  const s = String(value);
  const out: number[] = [];
  for (const [from, to] of LOOKALIKE_PAIRS)
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== from || (i === 0 && to === "0")) continue;
      const v = Number(s.slice(0, i) + to + s.slice(i + 1));
      if (!out.includes(v)) out.push(v);
    }
  return out.slice(0, max);
}

export function decideQuantity(readings: OcrReading[], evidence: QuantityEvidence = {}): QuantityDecision {
  const notes: string[] = [];
  const byValue = new Map<number, QuantityCandidate>();
  let valid = 0;
  for (const r of readings) {
    const v = normaliseQuantityText(r.text);
    if (v === null) continue;
    valid++;
    const c = byValue.get(v) ?? { value: v, score: 0, votes: 0, variants: [] };
    // An exact agreement counts even when Tesseract reports ~0% for it (it often does with a whitelist).
    c.score += 0.4 + 0.6 * Math.max(0, Math.min(1, r.confidence));
    c.votes++;
    c.variants.push(r.variant);
    byValue.set(v, c);
  }
  if (!byValue.size) return { value: null, confidence: 0, alternates: [], candidates: [], notes: ["No number could be read from this tile."] };

  // --- image evidence ---
  const cands = [...byValue.values()];
  if (evidence.digitCount) {
    for (const c of cands) if (String(c.value).length !== evidence.digitCount) c.score *= 0.5;
  }
  if (evidence.fiveTwo?.length) {
    const top = [...cands].sort((a, b) => b.score - a.score)[0];
    const digits = String(top.value);
    if (digits.length === evidence.fiveTwo.length) {
      // Add the shape-corrected reading if OCR never produced it.
      let corrected = "";
      for (let i = 0; i < digits.length; i++) {
        const e = evidence.fiveTwo[i];
        corrected += digits[i] === "2" && e !== null && e !== undefined && e >= 0.6 ? "5" : digits[i] === "5" && e !== null && e !== undefined && e <= -0.6 ? "2" : digits[i];
      }
      const cv = Number(corrected);
      if (cv !== top.value && !byValue.has(cv)) {
        const c = { value: cv, score: 0, votes: 0, variants: ["shape"] };
        byValue.set(cv, c);
        cands.push(c);
      }
    }
    for (const c of cands) {
      const s = String(c.value);
      if (s.length !== evidence.fiveTwo.length) continue;
      let f = 1;
      for (let i = 0; i < s.length; i++) {
        const e = evidence.fiveTwo[i];
        if (e === null || e === undefined || Math.abs(e) < 0.4 || (s[i] !== "2" && s[i] !== "5")) continue;
        const agrees = (s[i] === "5") === e > 0;
        f *= agrees ? 1.25 : 0.55;
      }
      c.score = c.variants[0] === "shape" && c.votes === 0 ? top.score * 0.9 * f : c.score * f;
    }
  }

  cands.sort((a, b) => b.score - a.score || b.votes - a.votes);
  const best = cands[0];
  const total = cands.reduce((s, c) => s + c.score, 0);
  const agreement = best.score / Math.max(1e-9, total);
  const confs = readings.filter((r) => normaliseQuantityText(r.text) === best.value).map((r) => r.confidence);
  // Agreeing reads with a ~0% engine score still add support (floored at 0.6 once another read is confident).
  const strength = confs.length ? 0.5 * Math.max(...confs) + (0.5 * confs.reduce((a, b) => a + Math.max(b, 0.6), 0)) / confs.length : 0.5;
  let confidence = agreement * Math.max(0.3, strength);
  if (best.votes >= 3 && agreement >= 0.75) confidence = Math.min(0.95, confidence + 0.1);
  if (best.votes <= 1) confidence *= 0.75; // one pass alone is never trusted
  if (best.variants[0] === "shape" && best.votes === 0) {
    confidence = Math.min(confidence, 0.6);
    notes.push(`The digit shapes look like ${best.value}, although the text reader said ${cands[1]?.value ?? "something else"}.`);
  }

  const alternates = cands.slice(1).filter((c) => c.score >= best.score * 0.15).map((c) => c.value);
  if (confidence < 0.85) for (const v of lookalikeSwaps(best.value)) if (!alternates.includes(v) && alternates.length < 3) alternates.push(v);
  if (valid < readings.length) notes.push(`${readings.length - valid} of ${readings.length} reads gave no usable number.`);
  return { value: best.value, confidence: Math.round(confidence * 100) / 100, alternates, candidates: cands, notes };
}
