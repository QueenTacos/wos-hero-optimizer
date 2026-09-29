"use client";

// ============================================================================
// <NumericInput> — the one number field used everywhere in the app.
//
// While focused, the field shows exactly what the user typed (it may be
// blank). Parsing and min/max clamping only happen on commit: blur, Enter,
// or the keyboard's Done/Go. type="text" + inputMode="numeric" gives the
// number pad on iOS/Android without type="number"'s stepper and its
// value-sanitising quirks (a controlled type="number" reports "" for partial
// input on iOS, which is what made fields snap back).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { NumericRules, acceptNumericDraft, commitNumericDraft } from "@/lib/utils/numericInput";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max">;

export function NumericInput({
  value,
  onCommit,
  min,
  max,
  allowGameNumber = false,
  allowDecimal = false,
  onClear,
  blank = "previous",
  format,
  ...rest
}: {
  /** null = "not set" (only meaningful together with onClear). */
  value: number | null;
  /** Called once per commit, only when the committed value differs from `value`. */
  onCommit: (v: number) => void;
  /** If given, committing a blank field calls this instead of restoring the previous value. */
  onClear?: () => void;
  min?: number;
  max?: number;
  /** Accept 10.5K / 143.39M style entries (resource totals). */
  allowGameNumber?: boolean;
  allowDecimal?: boolean;
  blank?: NumericRules["blank"];
  /** How the committed value is displayed when not editing. Default: plain digits. */
  format?: (v: number) => string;
} & InputProps) {
  const rules: NumericRules = { min, max, allowGameNumber, allowDecimal, blank };
  const show = (v: number | null) => (v === null ? "" : format ? format(v) : String(v));
  const [draft, setDraft] = useState(() => show(value));
  const editing = useRef(false);

  // Follow outside changes (scan applied, save loaded) — but never while the user is typing.
  useEffect(() => {
    if (!editing.current) setDraft(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit() {
    editing.current = false;
    if (onClear && draft.trim() === "") {
      setDraft("");
      if (value !== null) onClear();
      return;
    }
    const next = commitNumericDraft(draft, value ?? min ?? 0, rules);
    setDraft(show(next));
    if (next !== value) onCommit(next);
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowGameNumber || allowDecimal ? "decimal" : "numeric"}
      pattern={allowGameNumber || allowDecimal ? undefined : "[0-9]*"}
      autoComplete="off"
      enterKeyHint="done"
      value={draft}
      onFocus={(e) => {
        editing.current = true;
        if (format && value !== null) setDraft(String(value)); // edit plain digits, not "1,250"
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        editing.current = true;
        const ok = acceptNumericDraft(e.target.value, rules);
        if (ok !== null) setDraft(ok);
      }}
      onBlur={(e) => {
        commit();
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        // Enter / keyboard "Done": blurring commits (once, via onBlur).
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        rest.onKeyDown?.(e);
      }}
    />
  );
}
