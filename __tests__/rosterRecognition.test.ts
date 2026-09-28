// Runs the real recognition pipeline against the reference screenshots and
// the real portrait library from WOS_Hero_Optimizer_Full_Project_Package.
// This is a MEASUREMENT on a small sample (26 cards, one device, all Lv. 1),
// not proof of production accuracy.
import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import { decodeImageFile } from "./helpers/decodeImage";
import { segmentRosterCards } from "../imageRecognition/rosterSegmenter";
import { buildPortraitIndex, matchCard, PortraitIndex } from "../imageRecognition/portraitMatcher";
import { readStars, estimateFullStarArea } from "../imageRecognition/cardReadouts";
import { crop, RGBAImage } from "../imageRecognition/pixels";
import { HERO_DATABASE } from "../lib/data/heroDatabase";

const ROOT = path.join(__dirname, "..");
const ROSTER = (f: string) => path.join(ROOT, "docs/package/reference-screenshots/01_roster", f);

// Ground truth, identified by eye (reading order). Two cards I first mislabelled
// (Reina, Logan) were caught by the matcher and confirmed by troop icon + art.
const PAGE1 = ["mia", "flint", "molly", "alonso", "gina", "jessie", "patrick", "lynn",
  "jeronimo", "sergey", "bahiti", "cloris", "eugene", "zinman", "charlie", "reina"];
const PAGE2 = ["smith", "philly", "lumak-bokan", "natalia", "jasser", "greg", "seo-yoon", "ling-xue", "ahmose", "logan"];
// Star readouts as counted from the prototype (full stars, tier).
const STARS: Record<string, [number, number]> = {
  mia: [4, 4], flint: [4, 4], molly: [5, 0], alonso: [4, 2], gina: [5, 0], jessie: [5, 0], patrick: [5, 0], lynn: [3, 3],
  jeronimo: [3, 4], sergey: [4, 3], bahiti: [4, 3], cloris: [4, 3], eugene: [4, 2], zinman: [3, 2], charlie: [4, 2], reina: [2, 2],
  smith: [4, 2], philly: [3, 1], "lumak-bokan": [3, 4], natalia: [2, 5], jasser: [3, 3], greg: [2, 1], "seo-yoon": [3, 2],
  "ling-xue": [3, 1], ahmose: [1, 3], logan: [0, 0],
};

let index: PortraitIndex;
const pages: { cards: RGBAImage[]; truth: string[] }[] = [];

beforeAll(() => {
  index = buildPortraitIndex(
    HERO_DATABASE.map((h) => ({ heroId: h.id, image: decodeImageFile(path.join(ROOT, "public", h.portrait!)) }))
  );
  for (const [file, truth] of [["hero_roster_power_page_1.jpeg", PAGE1], ["hero_roster_power_page_2.jpeg", PAGE2]] as const) {
    const img = decodeImageFile(ROSTER(file));
    const seg = segmentRosterCards(img);
    pages.push({ cards: seg.cards.map((b) => crop(img, b)), truth: [...truth] });
  }
}, 60_000);

describe("roster segmentation (reference screenshots)", () => {
  it("finds every full card and skips cards cut off by scrolling", () => {
    const img1 = decodeImageFile(ROSTER("hero_roster_power_page_1.jpeg"));
    const s1 = segmentRosterCards(img1);
    expect(s1.cards).toHaveLength(16);
    // The cut-off bottom row on page 1 is never returned as a card.
    expect(Math.max(...s1.cards.map((c) => c.y + c.height))).toBeLessThan(img1.height * 0.87);
    const s2 = segmentRosterCards(decodeImageFile(ROSTER("hero_roster_power_page_2.jpeg")));
    expect(s2.cards).toHaveLength(10);
    // Grid is 4 columns in reading order
    expect(new Set(s1.cards.map((c) => Math.round(c.x / 10))).size).toBe(4);
    expect(s1.cards[0].x).toBeLessThan(s1.cards[1].x);
  });
});

describe("portrait matching (reference screenshots)", () => {
  it("identifies all 26 heroes (top-1) and reports the measured accuracy", () => {
    let correct = 0;
    const misses: string[] = [];
    const t0 = Date.now();
    for (const p of pages) {
      p.cards.forEach((card, i) => {
        const [top, second] = matchCard(index, card, 3);
        if (top.heroId === p.truth[i]) correct++;
        else misses.push(`${p.truth[i]} -> ${top.heroId} (${top.score.toFixed(3)})`);
        expect(top.confidence).toBeGreaterThan(second.confidence);
      });
    }
    const ms = (Date.now() - t0) / 26;
    console.log(`portrait matching: ${correct}/26 top-1, ~${ms.toFixed(0)} ms per card (Node)`);
    expect(misses).toEqual([]);
  }, 120_000);

  it("gives correct matches a clear lead over the runner-up", () => {
    for (const p of pages) {
      for (const card of p.cards) {
        const [top, second] = matchCard(index, card, 2);
        expect(top.score - second.score).toBeGreaterThan(0.1);
      }
    }
  }, 120_000);
});

describe("star / tier readout (reference screenshots)", () => {
  it("counts lit petals as tiers", () => {
    for (const p of pages) {
      const full = estimateFullStarArea(p.cards);
      p.cards.forEach((card, i) => {
        const expected = STARS[p.truth[i]];
        if (!expected) return;
        const r = readStars(card, full);
        expect([r.stars, r.tier], p.truth[i]).toEqual(expected);
      });
    }
  });
});

import { LocalPortraitRecognizer } from "../imageRecognition/heroRecognizer";
import { parseRosterImage, levelFromOcrText } from "../screenshotParser/rosterParser";
import { parseLevelText } from "../imageRecognition/cardReadouts";

describe("parseRosterImage (full pipeline, OCR stubbed)", () => {
  it("returns reviewable detections in Power order with candidates, stars and rank", async () => {
    const recognizer = new LocalPortraitRecognizer(async () =>
      HERO_DATABASE.map((h) => ({ heroId: h.id, image: decodeImageFile(path.join(ROOT, "public", h.portrait!)) }))
    );
    const img = decodeImageFile(ROSTER("hero_roster_power_page_2.jpeg"));
    const res = await parseRosterImage(img, { recognizer, readLevel: async () => levelFromOcrText("Lv. 1", 0.9) }, { rankOffset: 16 });
    expect(res.screenshotType).toBe("hero_roster");
    expect(res.data.map((d) => d.candidateHeroId)).toEqual(PAGE2);
    expect(res.data.map((d) => d.powerRankDetected)).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);
    const smith = res.data[0];
    expect(smith.candidateName).toBe("Smith");
    expect(smith.troopTypeDetected).toBe("Infantry");
    expect(smith.candidates!.length).toBe(3);
    expect(smith.levelDetected).toBe(1);
    expect([smith.starsDetected, smith.starTierDetected]).toEqual([4, 2]);
    expect(res.warnings.filter((w) => w.includes("both matched"))).toEqual([]);
  }, 120_000);
});

describe("level label parsing", () => {
  it.each([["Lv. 1", 1], ["Lv.12", 12], ["LV 80", 80], ["Lv. 81", null], ["Lv.", null], ["abc", null]])("%s -> %s", (t, n) => {
    expect(parseLevelText(t)).toBe(n);
  });
  it("marks readings with stray characters as uncertain", () => {
    expect(levelFromOcrText("Lv. 1", 0.9).confidence).toBeGreaterThan(0.8);
    expect(levelFromOcrText("Lv. 1 7", 0.9).confidence).toBeLessThanOrEqual(0.5);
  });
});
