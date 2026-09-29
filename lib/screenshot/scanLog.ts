// ============================================================================
// Local scan correction log — what OCR read vs. what the user confirmed.
// Kept ONLY in this browser (localStorage), newest last, capped. No
// screenshots, nothing uploaded. Useful later as debugging / test data
// (e.g. { field: "component100.quantity", rawValue: 23, correctedValue: 53 }).
// ============================================================================

export const SCAN_LOG_KEY = "wos-hero-optimizer:scan-log";
export const SCAN_LOG_MAX = 100;

export interface ScanLogEntry {
  at: string;
  scanType: string;
  field: string;
  rawValue: number | null;
  correctedValue: number | null;
  confidence: number;
  alternates?: number[];
  /** Raw OCR per preprocessing variant, e.g. "white-200:53". */
  reads?: string[];
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function storage(): StorageLike | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readScanLog(s: StorageLike | undefined = storage()): ScanLogEntry[] {
  try {
    const v = JSON.parse(s?.getItem(SCAN_LOG_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Appends entries (dropping the oldest past SCAN_LOG_MAX). Never throws. */
export function appendScanLog(entries: ScanLogEntry[], s: StorageLike | undefined = storage()): void {
  if (!entries.length) return;
  try {
    const all = [...readScanLog(s), ...entries].slice(-SCAN_LOG_MAX);
    s?.setItem(SCAN_LOG_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked or full — the log is optional */
  }
}

/** Field names in the log, e.g. xp100 → "component100.quantity". */
export const LOG_FIELD_NAMES: Record<string, string> = {
  xp10: "component10.quantity",
  xp100: "component100.quantity",
  total: "heroExp.total",
  exp1k: "heroExp.items.1k",
  exp5k: "heroExp.items.5k",
  exp10k: "heroExp.items.10k",
  exp50k: "heroExp.items.50k",
  qty: "quantity",
};
