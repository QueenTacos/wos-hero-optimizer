// ============================================================================
// Screenshot import targets — which inventory fields a screenshot can fill,
// and how confirmed values are written back into Inventory. Pure functions.
// ============================================================================

import { Inventory } from "../types";

export type ScreenshotTarget = "hero_exp_items" | "hero_exp_total" | "enhancement_components" | "essence_stones" | "mithril";

export interface ReviewField {
  key: string;
  label: string;
}

export interface TargetDefinition {
  target: ScreenshotTarget;
  title: string;
  /** Tips shown on the upload step. */
  instructions: string;
  /** Fields in the order they're expected to appear on screen. */
  fields: ReviewField[];
}

export const SCREENSHOT_TARGETS: Record<ScreenshotTarget, TargetDefinition> = {
  hero_exp_items: {
    target: "hero_exp_items",
    title: "Hero EXP item counts",
    instructions:
      "Screenshot your Backpack filtered to Hero EXP items so the 1K, 5K, 10K and 50K stacks are visible with their quantities.",
    fields: [
      { key: "exp1k", label: "1K EXP items" },
      { key: "exp5k", label: "5K EXP items" },
      { key: "exp10k", label: "10K EXP items" },
      { key: "exp50k", label: "50K EXP items" },
    ],
  },
  hero_exp_total: {
    target: "hero_exp_total",
    title: "Total Hero EXP",
    instructions:
      "Screenshot the resource list row that shows the Hero XP bottle, “Hero XP” and your total (e.g. 143.39M). The number on that row is used.",
    fields: [{ key: "total", label: "Total Hero EXP" }],
  },
  enhancement_components: {
    target: "enhancement_components",
    title: "Enhancement Components",
    instructions:
      "Screenshot your Backpack showing both Enhancement Component tiles. The number at the TOP of a tile (10 or 100) is the XP per item; the number at the BOTTOM is how many you own.",
    fields: [
      { key: "xp10", label: "10 XP components" },
      { key: "xp100", label: "100 XP components" },
    ],
  },
  essence_stones: {
    target: "essence_stones",
    title: "Essence Stones",
    instructions:
      "Screenshot a screen that shows the words “Essence Stone” next to your amount — e.g. tap the Essence Stone in your Backpack so its name and “Owned” amount show. From a plain Backpack grid (no names), tap the Essence Stone number on the screenshot yourself.",
    fields: [{ key: "qty", label: "Essence Stones" }],
  },
  mithril: {
    target: "mithril",
    title: "Mithril",
    instructions:
      "Screenshot a screen that shows the word “Mithril” next to your amount — e.g. tap Mithril in your Backpack so its name and “Owned” amount show. From a plain Backpack grid (no names), tap the Mithril number on the screenshot yourself.",
    fields: [{ key: "qty", label: "Mithril" }],
  },
};

/**
 * Writes user-confirmed values into a copy of the inventory. Only called
 * after the Review/Confirm step. Missing/null values leave the existing
 * inventory value untouched. Never mutates the input.
 */
export function applyConfirmedValues(
  inventory: Inventory,
  target: ScreenshotTarget,
  values: Record<string, number | null>
): Inventory {
  const v = (key: string, fallback: number) => {
    const n = values[key];
    return n === null || n === undefined || !Number.isFinite(n) ? fallback : Math.max(0, Math.round(n));
  };

  switch (target) {
    case "hero_exp_items": {
      const items = inventory.heroExp.items;
      return {
        ...inventory,
        heroExp: {
          ...inventory.heroExp,
          mode: "items",
          items: {
            exp1k: v("exp1k", items.exp1k),
            exp5k: v("exp5k", items.exp5k),
            exp10k: v("exp10k", items.exp10k),
            exp50k: v("exp50k", items.exp50k),
          },
        },
      };
    }
    case "hero_exp_total":
      return {
        ...inventory,
        heroExp: { ...inventory.heroExp, mode: "total", manualTotal: v("total", inventory.heroExp.manualTotal) },
      };
    case "enhancement_components": {
      const c = inventory.enhancementComponents;
      return {
        ...inventory,
        enhancementComponents: { xp10: v("xp10", c.xp10), xp100: v("xp100", c.xp100) },
      };
    }
    case "essence_stones":
      return { ...inventory, essenceStones: v("qty", inventory.essenceStones) };
    case "mithril":
      return { ...inventory, mithril: v("qty", inventory.mithril) };
  }
}
