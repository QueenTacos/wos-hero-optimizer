import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { HERO_DATABASE } from "../lib/data/heroDatabase";
import { heroPortraits, getHeroPortraitPath, normalizeHeroId, PORTRAIT_FILES } from "../lib/data/heroPortraits";

const PUBLIC = path.join(__dirname, "..", "public");

describe("hero portrait library", () => {
  it("has 65 heroes from the spec (13 Base + Gen 1-17 incl. Jeronimo)", () => {
    expect(HERO_DATABASE.length).toBe(65);
    expect(new Set(HERO_DATABASE.map((h) => h.id)).size).toBe(65);
  });

  it("every hero in the database points to a portrait", () => {
    const missing = HERO_DATABASE.filter((h) => !h.portrait).map((h) => h.name);
    expect(missing).toEqual([]);
  });

  it("every portrait path exists on disk", () => {
    for (const h of HERO_DATABASE) expect(fs.existsSync(path.join(PUBLIC, h.portrait!)), h.portrait!).toBe(true);
  });

  it("every portrait file maps to exactly one known hero (no orphans, no duplicates)", () => {
    const ids = new Set(HERO_DATABASE.map((h) => h.id));
    expect(Object.keys(heroPortraits).length).toBe(PORTRAIT_FILES.length);
    for (const id of Object.keys(heroPortraits)) expect(ids.has(id), id).toBe(true);
    const onDisk = fs.readdirSync(path.join(PUBLIC, "assets/heroes/portraits")).sort();
    expect(onDisk).toEqual([...PORTRAIT_FILES].sort());
  });

  it("normalizes names and resolves filename aliases", () => {
    expect(normalizeHeroId("Wu Ming")).toBe("wu-ming");
    expect(normalizeHeroId("Seo-yoon")).toBe("seo-yoon");
    expect(normalizeHeroId("ling_xue")).toBe("ling-xue");
    expect(getHeroPortraitPath("sergey")).toBe("/assets/heroes/portraits/sergey.png");
    expect(getHeroPortraitPath("wu-ming")).toBe("/assets/heroes/portraits/wu_ming.jpg");
    expect(getHeroPortraitPath("lumak-bokan")).toBe("/assets/heroes/portraits/lumak.png");
    expect(getHeroPortraitPath("greg")).toBe("/assets/heroes/portraits/greg_s3.png");
  });

  it("never throws for unknown or empty ids", () => {
    expect(getHeroPortraitPath("not-a-hero")).toBeNull();
    expect(getHeroPortraitPath("")).toBeNull();
    expect(getHeroPortraitPath(undefined)).toBeNull();
  });
});

describe("hero database vs. spec §13", () => {
  it("matches the master table exactly (name, generation, troop type)", () => {
    const md = fs.readFileSync(path.join(__dirname, "..", "docs/package/WOS_Hero_Optimizer_Complete_Breakdown.md"), "utf8");
    const section = md.split("## 13.")[1].split("## 14.")[0];
    const spec: { name: string; generation: number; troopType: string }[] = [];
    let gen = -1;
    for (const line of section.split("\n")) {
      const g = line.match(/^### (Base|Gen (\d+))/);
      if (g) { gen = g[1] === "Base" ? 0 : Number(g[2]); continue; }
      const h = line.match(/^- (.+?) — (\w+)/);
      if (h) spec.push({ name: h[1], generation: gen, troopType: h[2] });
    }
    expect(spec.length).toBe(65);
    const db = HERO_DATABASE.map((h) => ({ name: h.name, generation: h.generation, troopType: h.troopType }));
    const key = (x: { name: string }) => x.name;
    expect([...db].sort((a, b) => key(a).localeCompare(key(b)))).toEqual([...spec].sort((a, b) => key(a).localeCompare(key(b))));
  });
});
