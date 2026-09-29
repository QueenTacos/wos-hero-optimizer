// @vitest-environment jsdom
// Hero Level input bug (typing only ever gave 1 or 80) — tests A–G, plus the
// same editing-safe behaviour on the other numeric fields.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { HeroCard, RosterRow } from "@/components/HeroCard";
import { NumericInput } from "@/components/NumericInput";
import { emptyRowGear } from "@/components/GearEditor";
import { acceptNumericDraft, commitNumericDraft, normalizeHeroLevel, parseNumericDraft } from "@/lib/utils/numericInput";

afterEach(cleanup);

/** Real HeroCard wired to real state, like the Optimize page. */
function Harness({ initialLevel = 1, onLevel }: { initialLevel?: number; onLevel?: (l: number) => void }) {
  const [row, setRow] = useState<RosterRow>({ rowId: "r1", heroDefId: "jessie", level: initialLevel, stars: 0, gear: emptyRowGear() });
  return (
    <>
      <HeroCard
        row={row}
        takenIds={[]}
        onChange={(_, patch) => {
          if (patch.level !== undefined) onLevel?.(patch.level);
          setRow((r) => ({ ...r, ...patch }));
        }}
        onRemove={() => {}}
      />
      <output data-testid="saved-level">{row.level}</output>
    </>
  );
}

const levelInput = () => screen.getByLabelText("Level") as HTMLInputElement;
const saved = () => Number(screen.getByTestId("saved-level").textContent);
/** Types like a phone keyboard: one character at a time, each producing a change event. */
function typeKeys(input: HTMLInputElement, keys: string) {
  for (const k of keys) fireEvent.change(input, { target: { value: input.value + k } });
}
function clear(input: HTMLInputElement) {
  fireEvent.change(input, { target: { value: "" } });
}

describe("Hero Level input (tests A–G)", () => {
  it("is a text field with the numeric keypad, not type=number", () => {
    render(<Harness />);
    expect(levelInput().type).toBe("text");
    expect(levelInput().inputMode).toBe("numeric");
  });

  it("A: clearing the field leaves it blank while editing (does not snap to 1)", () => {
    render(<Harness initialLevel={1} />);
    const el = levelInput();
    fireEvent.focus(el);
    clear(el);
    expect(el.value).toBe("");
    expect(saved()).toBe(1); // nothing committed yet
  });

  it("B: typing 5 then 50 commits 50", () => {
    render(<Harness initialLevel={1} />);
    const el = levelInput();
    fireEvent.focus(el);
    clear(el);
    typeKeys(el, "5");
    expect(el.value).toBe("5");
    typeKeys(el, "0");
    expect(el.value).toBe("50");
    fireEvent.blur(el);
    expect(el.value).toBe("50");
    expect(saved()).toBe(50);
  });

  it("C: 37 → 37", () => {
    render(<Harness />);
    const el = levelInput();
    fireEvent.focus(el);
    clear(el);
    typeKeys(el, "37");
    fireEvent.blur(el);
    expect(saved()).toBe(37);
  });

  it("D: 80 → 80", () => {
    render(<Harness />);
    const el = levelInput();
    fireEvent.focus(el);
    clear(el);
    typeKeys(el, "80");
    fireEvent.blur(el);
    expect(saved()).toBe(80);
  });

  it("E: 99 is kept while typing, and becomes 80 on commit", () => {
    render(<Harness />);
    const el = levelInput();
    fireEvent.focus(el);
    clear(el);
    typeKeys(el, "99");
    expect(el.value).toBe("99");
    fireEvent.blur(el);
    expect(saved()).toBe(80);
    expect(el.value).toBe("80");
  });

  it("F: 0 becomes 1 on commit", () => {
    render(<Harness initialLevel={30} />);
    const el = levelInput();
    fireEvent.focus(el);
    clear(el);
    typeKeys(el, "0");
    fireEvent.blur(el);
    expect(saved()).toBe(1);
  });

  it("G: blank on leave restores the previous valid level; letters are ignored", () => {
    render(<Harness initialLevel={42} />);
    const el = levelInput();
    fireEvent.focus(el);
    clear(el);
    fireEvent.blur(el);
    expect(saved()).toBe(42);
    expect(el.value).toBe("42");

    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: "4a" } }); // rejected keystroke
    expect(el.value).toBe("42");
  });

  it("Enter / Done commits", () => {
    const onLevel = vi.fn();
    render(<Harness onLevel={onLevel} />);
    const el = levelInput();
    el.focus();
    clear(el);
    typeKeys(el, "64");
    fireEvent.keyDown(el, { key: "Enter" });
    expect(saved()).toBe(64);
    expect(onLevel).toHaveBeenCalledTimes(1);
  });

  it("every level 1–80 can be typed from a blank field", () => {
    render(<Harness />);
    const el = levelInput();
    for (let lv = 1; lv <= 80; lv++) {
      fireEvent.focus(el);
      clear(el);
      typeKeys(el, String(lv));
      fireEvent.blur(el);
      expect(saved()).toBe(lv);
    }
  });
});

describe("Gear fields use the same pattern", () => {
  function GearHarness() {
    const [row, setRow] = useState<RosterRow>({
      rowId: "r1",
      heroDefId: "jessie",
      level: 1,
      stars: 0,
      gear: { ...emptyRowGear(), goggles: { rarity: "legendary", enhancementLevel: 0, masteryLevel: 0, masteryStage: 0 } },
    });
    return (
      <>
        <HeroCard row={row} takenIds={[]} onChange={(_, p) => setRow((r) => ({ ...r, ...p }))} onRemove={() => {}} />
        <output data-testid="gear">{JSON.stringify(row.gear.goggles)}</output>
      </>
    );
  }
  it("Enhancement 19 and Mastery 10 type normally, and stay separate", () => {
    render(<GearHarness />);
    const enh = screen.getByLabelText("Goggles enhancement") as HTMLInputElement;
    const mas = screen.getByLabelText("Goggles mastery level") as HTMLInputElement;
    fireEvent.focus(enh);
    clear(enh);
    typeKeys(enh, "19");
    fireEvent.blur(enh);
    fireEvent.focus(mas);
    clear(mas);
    typeKeys(mas, "10");
    fireEvent.blur(mas);
    const g = JSON.parse(screen.getByTestId("gear").textContent!);
    expect(g).toMatchObject({ rarity: "legendary", enhancementLevel: 19, masteryLevel: 10 });
  });
  it("Enhancement 150 clamps to 100 on commit; Mastery 25 clamps to 20", () => {
    render(<GearHarness />);
    const enh = screen.getByLabelText("Goggles enhancement") as HTMLInputElement;
    fireEvent.focus(enh);
    clear(enh);
    typeKeys(enh, "150");
    expect(enh.value).toBe("150");
    fireEvent.blur(enh);
    expect(enh.value).toBe("100");
    const mas = screen.getByLabelText("Goggles mastery level") as HTMLInputElement;
    fireEvent.focus(mas);
    clear(mas);
    typeKeys(mas, "25");
    fireEvent.blur(mas);
    expect(mas.value).toBe("20");
  });
});

describe("Inventory quantities (NumericInput)", () => {
  function Qty({ initial = 0, onCommit }: { initial?: number; onCommit: (v: number) => void }) {
    const [v, setV] = useState(initial);
    return <NumericInput aria-label="qty" min={0} value={v} onCommit={(n) => { setV(n); onCommit(n); }} />;
  }
  it("large quantities like 40526 type digit by digit", () => {
    const fn = vi.fn();
    render(<Qty onCommit={fn} />);
    const el = screen.getByLabelText("qty") as HTMLInputElement;
    fireEvent.focus(el);
    clear(el);
    typeKeys(el, "40526");
    expect(fn).not.toHaveBeenCalled(); // nothing is committed per keystroke
    fireEvent.blur(el);
    expect(fn).toHaveBeenCalledWith(40526);
  });
  it("outside updates (e.g. a confirmed scan) show up when not editing", () => {
    function Outer() {
      const [v, setV] = useState(0);
      return (
        <>
          <NumericInput aria-label="qty" min={0} value={v} onCommit={setV} />
          <button onClick={() => setV(1250)}>scan</button>
        </>
      );
    }
    render(<Outer />);
    fireEvent.click(screen.getByText("scan"));
    expect((screen.getByLabelText("qty") as HTMLInputElement).value).toBe("1250");
  });
});

describe("pure helpers", () => {
  it("normalizeHeroLevel", () => {
    expect(normalizeHeroLevel("50", 1)).toBe(50);
    expect(normalizeHeroLevel("", 12)).toBe(12);
    expect(normalizeHeroLevel("abc", 12)).toBe(12);
    expect(normalizeHeroLevel("0", 12)).toBe(1);
    expect(normalizeHeroLevel("99", 12)).toBe(80);
  });
  it("acceptNumericDraft allows blank and digits only (or game numbers when asked)", () => {
    expect(acceptNumericDraft("")).toBe("");
    expect(acceptNumericDraft("50")).toBe("50");
    expect(acceptNumericDraft("5a")).toBeNull();
    expect(acceptNumericDraft("-5")).toBeNull();
    expect(acceptNumericDraft("10.5K", { allowGameNumber: true })).toBe("10.5K");
    expect(acceptNumericDraft("1,250", { allowGameNumber: true })).toBe("1,250");
  });
  it("game numbers parse on commit", () => {
    expect(parseNumericDraft("10.5K", { allowGameNumber: true })).toBe(10_500);
    expect(parseNumericDraft("1,250", { allowGameNumber: true })).toBe(1250);
    expect(parseNumericDraft("143.39M", { allowGameNumber: true })).toBe(143_390_000);
    expect(commitNumericDraft("", 7, { min: 0 })).toBe(7);
    expect(commitNumericDraft("", 7, { min: 0, blank: "zero" })).toBe(0);
  });
});
