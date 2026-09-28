// ============================================================================
// Roster screenshot → hero card boxes.
//
// Calibrated on the two "Heroes (sorted by Power)" reference screenshots in
// docs/package/reference-screenshots/01_roster. The card grid sits on a flat
// panel colour (≈ RGB 13,70,125 there). We find that colour automatically
// (most common colour in the image), then:
//   1. panel rows    = rows where some panel colour is visible (gaps between cards)
//   2. card columns  = vertical runs where the panel colour is mostly absent
//   3. card rows     = per column, vertical runs where the panel colour is absent
//   4. keep only full-height cards (cards cut off by scrolling are dropped)
// Order is reading order (row by row, left to right), which preserves the
// game's Power sort.
// ============================================================================

import { Box, RGBAImage } from "./pixels";

export interface PartialCard {
  box: Box;
  /** Which screen edge cut the card off. */
  edge: "top" | "bottom";
  /** Visible height / normal card height. */
  visibleFraction: number;
}

export interface RosterSegmentation {
  /** Fully visible cards, reading order. */
  cards: Box[];
  /** Cut-off cards whose portrait is still visible — identify, but send to review (no level/stars). */
  partialCards: PartialCard[];
  /** Cut-off cards too small to identify, by edge. Reported to the user, never guessed. */
  skippedPartial: { top: number; bottom: number };
  /** skippedPartial.top + skippedPartial.bottom */
  partialCardsSkipped: number;
  panelColor: [number, number, number];
  warnings: string[];
}

function runs(flags: boolean[], minLen: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    const v = i < flags.length && flags[i];
    if (v && start < 0) start = i;
    if (!v && start >= 0) {
      if (i - start >= minLen) out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

/** Most common colour, quantized to 8 levels per channel. */
function dominantColor(img: RGBAImage): [number, number, number] {
  const counts = new Map<number, number>();
  const step = Math.max(1, Math.floor((img.width * img.height) / 200_000)); // sample big images
  for (let p = 0; p < img.width * img.height; p += step) {
    const i = p * 4;
    const key = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0, bestN = -1;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return [((best >> 10) & 31) * 8 + 4, ((best >> 5) & 31) * 8 + 4, (best & 31) * 8 + 4];
}

export function segmentRosterCards(img: RGBAImage): RosterSegmentation {
  const { width: w, height: h, data } = img;
  const bg = dominantColor(img);
  const isBg = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
    isBg[p] = d < 40 ? 1 : 0;
  }

  const rowFrac = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) s += isBg[y * w + x];
    rowFrac[y] = s / w;
  }
  const panelRows = Array.from(rowFrac, (f) => f > 0.08);
  const nPanelRows = panelRows.filter(Boolean).length || 1;

  const colFrac = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) if (panelRows[y]) s += isBg[y * w + x];
    colFrac[x] = s / nPanelRows;
  }
  let cols = runs(Array.from(colFrac, (f) => f < 0.9), Math.round(w * 0.1));

  // Overlays touching a screen edge (e.g. the game's side-panel handle on the
  // right) can merge into the outermost column and make it too wide. Cards in
  // one grid share a width, so trim any column wider than the typical one,
  // keeping the side that is away from the screen edge.
  const colWidths = cols.map(([a, b]) => b - a).sort((p, q) => p - q);
  const cardW = colWidths[Math.floor(colWidths.length / 2)] ?? 0;
  cols = cols.map(([x0, x1]) => {
    if (x1 - x0 <= cardW * 1.08) return [x0, x1] as [number, number];
    const nearRight = w - x1 < x0;
    return (nearRight ? [x0, x0 + cardW] : [x1 - cardW, x1]) as [number, number];
  });

  // Vertical runs per column. Short runs are kept so cut-off cards can be reported.
  const candidates: Box[] = [];
  for (const [x0, x1] of cols) {
    const flags: boolean[] = [];
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = x0; x < x1; x++) s += isBg[y * w + x];
      flags.push(panelRows[y] && s / (x1 - x0) < 0.5);
    }
    for (const [y0, y1] of runs(flags, Math.round((x1 - x0) * 0.1))) {
      candidates.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    }
  }

  const warnings: string[] = [];
  const empty = { cards: [], partialCards: [], skippedPartial: { top: 0, bottom: 0 }, partialCardsSkipped: 0, panelColor: bg, warnings };
  if (candidates.length === 0 || cardW === 0) {
    warnings.push("No hero cards found. Use a screenshot of the Heroes screen (sorted by Power) without menus covering the grid.");
    return empty;
  }

  // Expected card height: WOS roster cards are ~1.74x taller than wide.
  const fullish = candidates.filter((c) => c.height / c.width > 1.5 && c.height / c.width < 2.0).map((c) => c.height).sort((p, q) => p - q);
  const cardH = fullish.length ? fullish[Math.floor(fullish.length / 2)] : Math.round(cardW * 1.74);

  const cards: Box[] = [];
  const partialCards: PartialCard[] = [];
  const skippedPartial = { top: 0, bottom: 0 };
  let odd = 0;
  const isFull = (c: Box) => c.height >= cardH * 0.9 && c.height <= cardH * 1.15;
  const fullCards = candidates.filter(isFull);
  const gapMax = cardH * 0.15;
  for (const c of candidates) {
    if (isFull(c)) {
      cards.push(c);
      continue;
    }
    if (c.height > cardH * 1.15) {
      odd++;
      continue;
    }
    // A cut-off card sits directly above the first full card or directly
    // below the last full card of its column. Anything else (header, buttons,
    // decorations) is not a card at all and is ignored.
    const sameCol = fullCards.filter((f) => Math.abs(f.x - c.x) < cardW * 0.2);
    if (sameCol.length === 0) continue;
    const top = Math.min(...sameCol.map((f) => f.y));
    const bottom = Math.max(...sameCol.map((f) => f.y + f.height));
    let edge: "top" | "bottom" | null = null;
    if (c.y + c.height <= top && top - (c.y + c.height) <= gapMax) edge = "top";
    else if (c.y >= bottom && c.y - bottom <= gapMax) edge = "bottom";
    if (!edge) continue;
    // A card cut at the bottom still shows its portrait if ≥ ~62% is visible;
    // those go to review (no level/stars). Anything else is skipped and reported.
    if (edge === "bottom" && c.height >= cardH * 0.62) partialCards.push({ box: c, edge, visibleFraction: c.height / cardH });
    else skippedPartial[edge]++;
  }
  if (odd) warnings.push("Some detected regions didn't look like hero cards and were skipped.");
  if (skippedPartial.top + skippedPartial.bottom > 0) {
    const where = [skippedPartial.top && `${skippedPartial.top} at the top`, skippedPartial.bottom && `${skippedPartial.bottom} at the bottom`]
      .filter(Boolean)
      .join(" and ");
    warnings.push(`${skippedPartial.top + skippedPartial.bottom} cut-off card(s) ${where} were skipped — not enough is visible to identify them. Include them in another screenshot.`);
  }

  const rowKey = (b: Box) => Math.round(b.y / (cardH * 0.5));
  const order = (a: Box, b: Box) => rowKey(a) - rowKey(b) || a.x - b.x;
  cards.sort(order);
  partialCards.sort((a, b) => order(a.box, b.box));

  return {
    cards,
    partialCards,
    skippedPartial,
    partialCardsSkipped: skippedPartial.top + skippedPartial.bottom,
    panelColor: bg,
    warnings,
  };
}
