// Real screenshots supplied 2026-09-26 (docs/package/reference-screenshots/06_real_test_cases).
// Expected values are in EXPECTED.md next to the images.
import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import { decodeImageFile } from "./helpers/decodeImage";
import { segmentRosterCards } from "../imageRecognition/rosterSegmenter";
import { LocalPortraitRecognizer } from "../imageRecognition/heroRecognizer";
import { crop, RGBAImage } from "../imageRecognition/pixels";
import { parseRosterImage } from "../screenshotParser/rosterParser";
import { mergeRosterScans, toScanCards } from "../lib/screenshot/rosterScanMerge";
import { HERO_DATABASE } from "../lib/data/heroDatabase";
import { DetectedScreenshotHero } from "../lib/types";

const ROOT = path.join(__dirname, "..");
const REAL = (f: string) => decodeImageFile(path.join(ROOT, "docs/package/reference-screenshots/06_real_test_cases", f));
const OLD = (f: string) => decodeImageFile(path.join(ROOT, "docs/package/reference-screenshots/01_roster", f));

const TOP = ["mia", "flint", "molly", "alonso", "gina", "jessie", "patrick", "lynn", "jeronimo", "sergey", "bahiti", "cloris", "eugene", "zinman", "charlie", "reina"];
const BOTTOM = ["smith", "philly", "lumak-bokan", "natalia", "jasser", "greg", "seo-yoon", "ling-xue", "ahmose", "logan"];

let recognizer: LocalPortraitRecognizer;
let top: RGBAImage, bottom: RGBAImage;
const parse = async (img: RGBAImage) => (await parseRosterImage(img, { recognizer })).data;

beforeAll(async () => {
  recognizer = new LocalPortraitRecognizer(async () =>
    HERO_DATABASE.map((h) => ({ heroId: h.id, image: decodeImageFile(path.join(ROOT, "public", h.portrait!)) }))
  );
  await recognizer.warmUp();
  top = REAL("roster_power_top.png");
  bottom = REAL("roster_power_bottom_scrolled.png");
}, 60_000);

describe("real roster screenshots — single screenshot", () => {
  it("top: 16 full cards, bottom row cut off and reported (not guessed), side-panel overlay ignored", () => {
    const seg = segmentRosterCards(top);
    expect(seg.cards).toHaveLength(16);
    expect(new Set(seg.cards.map((c) => c.width)).size).toBe(1); // overlay no longer widens the right column
    expect(seg.skippedPartial).toEqual({ top: 0, bottom: 4 });
    expect(seg.warnings.join(" ")).toMatch(/4 cut-off card/);
  });

  it("scrolled: 10 full cards, top row cut off and reported", () => {
    const seg = segmentRosterCards(bottom);
    expect(seg.cards).toHaveLength(10);
    expect(seg.skippedPartial).toEqual({ top: 4, bottom: 0 });
  });

  it("identifies every hero and cross-checks the troop icon", async () => {
    const t = await parse(top), b = await parse(bottom);
    expect(t.map((d) => d.candidateHeroId)).toEqual(TOP);
    expect(b.map((d) => d.candidateHeroId)).toEqual(BOTTOM);
    for (const d of [...t, ...b]) {
      expect(d.troopIconDetected).toBe(d.troopTypeDetected);
      expect(d.reviewReasons).toEqual([]);
    }
  }, 60_000);

  it("reads the same stars as the original screenshots from a different device", async () => {
    const t = await parse(top);
    const stars = Object.fromEntries(t.map((d) => [d.candidateHeroId, [d.starsDetected, d.starTierDetected]]));
    expect(stars).toMatchObject({ mia: [4, 4], molly: [5, 0], lynn: [3, 3], reina: [2, 2], sergey: [4, 3] });
  }, 60_000);

  it("a card cut off low enough to still show its portrait goes to review without level/stars", async () => {
    // Simulate a screenshot that ends 72% of the way down the 4th row.
    const cut = crop(top, { x: 0, y: 0, width: top.width, height: 1756 + Math.round(455 * 0.72) });
    const seg = segmentRosterCards(cut);
    expect(seg.cards).toHaveLength(12);
    expect(seg.partialCards).toHaveLength(4);
    const dets = await parse(cut);
    const partial = dets.filter((d) => d.partial);
    expect(partial.map((d) => d.candidateHeroId)).toEqual(["eugene", "zinman", "charlie", "reina"]);
    for (const d of partial) {
      expect(d.starsDetected).toBeNull();
      expect(d.levelDetected).toBeNull();
      expect(d.confidence).toBeLessThanOrEqual(0.6);
      expect(d.reviewReasons!.join(" ")).toMatch(/cut off/);
    }
  }, 60_000);
});

describe("real roster screenshots — merging several screenshots into one roster", () => {
  it("top + scrolled → 26 unique heroes in Power order", async () => {
    const res = mergeRosterScans(toScanCards([await parse(top), await parse(bottom)]));
    expect(res.entries.map((e) => e.heroId)).toEqual([...TOP, ...BOTTOM]);
    expect(res.entries.map((e) => e.powerRank)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    expect(res.duplicatesMerged).toBe(0);
    // These two share no fully visible card, so order falls back to upload order — and says so.
    expect(res.notes.join(" ")).toMatch(/doesn't share any heroes/);
  }, 60_000);

  it("overlapping scroll captures uploaded out of order → duplicates merged, order preserved", async () => {
    // A mid-scroll capture showing rows 3-4 of the top screenshot.
    const mid = crop(top, { x: 0, y: 1260, width: top.width, height: top.height - 1260 });
    const shots: DetectedScreenshotHero[][] = [await parse(mid), await parse(top), await parse(bottom)];
    expect(shots[0].map((d) => d.candidateHeroId)).toEqual(TOP.slice(8));
    const res = mergeRosterScans(toScanCards(shots));
    expect(res.entries.map((e) => e.heroId)).toEqual([...TOP, ...BOTTOM]);
    expect(res.duplicatesMerged).toBe(8);
    const jeronimo = res.entries.find((e) => e.heroId === "jeronimo")!;
    expect(jeronimo.sources).toHaveLength(2);
    expect(jeronimo.mergeNotes).toEqual([]); // same stars/level/icon in both → silent merge
  }, 90_000);

  it("the same roster screenshotted on two different devices → 16 unique, not 32", async () => {
    const res = mergeRosterScans(toScanCards([await parse(OLD("hero_roster_power_page_1.jpeg")), await parse(top)]));
    expect(res.entries).toHaveLength(16);
    expect(res.duplicatesMerged).toBe(16);
    expect(res.entries.map((e) => e.heroId)).toEqual(TOP);
  }, 90_000);
});
