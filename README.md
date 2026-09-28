# WOS Hero Optimizer

> **Deploying?** See [DEPLOY.md](DEPLOY.md) — GitHub + Vercel, step by step. Data is saved in local storage on each device.

A mobile-first PWA that calculates optimal Hero EXP, gear, and Gear Enhancement
Component spend for Whiteout Survival, plus Bear Trap and PvP/PvE counter
recommendations.

**Phase 1 is a fully working manual-entry calculator. Phase 2 adds screenshot
scanning for resource counts** (Hero EXP items, Total EXP, Enhancement
Components) with a mandatory Review/Confirm step. Portrait recognition and
hero-gear screenshot parsing are still Phase 3 (see "Future Work" below).

> **Package integration update (portraits + roster recognition):** The app now
> uses the hero portrait folder from `WOS_Hero_Optimizer_Full_Project_Package`
> as its local hero image library (`public/assets/heroes/portraits`, original
> filenames kept, mapped in `lib/data/heroPortraits.ts`). Portraits appear in
> the hero picker, hero cards, results and Bear Trap. A **Scan roster** button
> identifies heroes from Power-sorted roster screenshots by *portrait matching*
> (not OCR), reads level (OCR) and stars/tier (star icons), and requires every
> card to be marked Correct / Change Hero / Skip before anything is added. See
> section 13 for what this was tested on — it is a prototype, not
> production-grade recognition. The spec and reference screenshots from the
> package live in `docs/package/`.

> **Phase 2 update:** Each resource section on the Optimize page has a
> **Scan screenshot** button. OCR runs in the browser with Tesseract.js (the
> screenshot never leaves the phone; the ~3 MB English model downloads once
> from jsDelivr and is cached). The Review screen shows the screenshot with
> every detected number outlined; each field is pre-filled with a guess that
> is always labeled "please check". Fix a value by typing it, or by tapping
> the field and then tapping the right number on the image. Nothing is applied
> until the user ticks "I've checked these values" and presses Confirm.

> **v2 update:** Hero Gear is now modeled as 4 real slots per hero (Goggles /
> Gloves / Belt / Boots) with a rarity (Common → Mythic) and an independent
> enhancement level, entered directly on each hero card. Hero EXP now
> supports two mutually-exclusive input modes (typed total like `3.6m`, or
> item quantities). There's a new Extra/Unassigned Gear inventory grid, and a
> gear redistribution engine that can reclaim better gear from lower-ranked
> heroes for the Top 5. See "How Gear Is Represented" below for details.

---

## 1. Architecture

```
Next.js (App Router) UI  ──calls──▶  lib/optimizer/*  ──reads──▶  lib/data/*
        │                                   │
        │                                   └─ pure functions, no React/DOM deps,
        │                                      fully unit-testable in isolation
        │
        └─ imageRecognition/ & screenshotParser/  (Phase 2/3, interfaces only today)
```

Design principles:

- **Engine first, UI second.** Every rule in the spec (Top 5 / Top 3 caps,
  level 80 / gear level 100 caps, balanced vs. priority leveling, troop-type
  gear compatibility, counter triangle) lives in `lib/`, is framework-agnostic,
  and has unit tests. The UI is a thin layer that calls these functions.
- **Never trust detection blindly.** Every future screenshot parser returns a
  confidence score and structured data; nothing skips a human review step.
  `sourceConfidence` is part of the `Hero` model today so this is wired in
  from day one, even though only manual entry (`sourceConfidence: 1`) exists
  right now.
- **Hard rule enforcement, not just UI convention.** Hero EXP and Enhancement
  Component optimizers only ever receive the exact Top 5 / Top 3 arrays — they
  have no way to "reach" Hero #6+ even if the caller made a mistake, since
  those heroes are never in scope of the function call.

## 2. Folder Structure

```
wos-hero-optimizer/
├── app/                        # Next.js App Router pages (mobile-first UI)
│   ├── layout.tsx              # shell + bottom nav
│   ├── page.tsx                # Home
│   ├── optimize/page.tsx       # Screens 2-5 collapsed into one flow (Phase 1)
│   ├── bear-trap/page.tsx      # Rally Captain / Rally Joiner
│   ├── combat/page.tsx         # Counter triangle recommendation
│   └── results/page.tsx        # Saved results (Phase 4 placeholder)
├── components/
│   ├── HeroSelect.tsx
│   └── TroopBadge.tsx
├── lib/
│   ├── types/index.ts          # Hero, GearPiece, Inventory, OptimizationResult, ...
│   ├── data/
│   │   ├── heroDatabase.ts     # full hero master list, Base + Gen 1-17
│   │   ├── heroXpTable.ts      # level 1-80 XP table + cost helpers
│   │   ├── gearXpTable.ts      # gear level 1-100 XP table + cost helpers
│   │   └── shardTable.ts       # star/shard table
│   ├── optimizer/
│   │   ├── heroXp.ts           # Top-5 leveling (balanced / priority)
│   │   ├── gearEnhancement.ts  # Top-3 gear enhancement (balanced / priority)
│   │   ├── gearAssignment.ts   # troop-type-aware gear distribution
│   │   ├── bearTrap.ts         # Rally Captain / Rally Joiner scoring
│   │   ├── ranking.ts          # Top 5 / Top 3 selection + manual override
│   │   ├── counters.ts         # Infantry/Lancer/Marksman triangle
│   │   └── runOptimization.ts  # orchestrator -> OptimizationResult
│   └── utils/inventory.ts      # item-quantity -> total XP pool conversions
├── imageRecognition/index.ts   # Phase 3 interfaces (portrait match, OCR, icons)
├── screenshotParser/index.ts   # Phase 2/3 interfaces (per-screenshot-type parsers)
├── __tests__/                  # vitest unit tests (17 tests, all passing)
├── public/manifest.json        # PWA manifest
├── components/ScreenshotImport.tsx # Phase 2 upload → scan → Review/Confirm sheet
├── lib/screenshot/
│   ├── quantityTokens.ts       # OCR word → number parsing, reading order, suggestions
│   └── targets.ts              # which fields each scan fills + applyConfirmedValues()
├── imageRecognition/
│   ├── tesseractOcr.ts         # Phase 2 OcrEngine (Tesseract.js, in-browser)
│   └── preprocess.ts           # bright-text threshold / grayscale cleanup before OCR
└── README.md
```

## 3. Data Models

See `lib/types/index.ts` for the full set. Highlights:

```ts
type GearSlot = "goggles" | "gloves" | "belt" | "boots";
type GearRarity = "common" | "uncommon" | "rare" | "epic" | "mythic";

interface EquippedGearPiece {
  slot: GearSlot;
  rarity: GearRarity;
  enhancementLevel: number; // 0-100, independent of rarity
}

type HeroGear = Record<GearSlot, EquippedGearPiece | null>; // a hero need not have all 4

interface Hero {
  id: string;
  name: string;
  generation: number;      // 0 = Base/Epic-Rare, 1-17 = Gen1..Gen17
  troopType: "Infantry" | "Lancer" | "Marksman";
  rarity: Rarity;           // hero rarity, distinct from gear rarity
  level: number;            // 1-80
  stars: number;            // 0-5, decimals allowed for half-star display (e.g. 3.5)
  power: number;
  roleTags: RoleTag[];
  gear: HeroGear;
  sourceConfidence: number; // 1 = manually confirmed; <1 = from screenshot detection
}

interface HeroExpInventory {
  mode: "total" | "items";  // mutually exclusive — never summed together
  manualTotal: number;      // used when mode === "total", from parseExpInput()
  items: { exp1k: number; exp5k: number; exp10k: number; exp50k: number };
}

type UnassignedGearInventory = Record<GearSlot, Record<GearRarity, number>>;

interface Inventory {
  heroExp: HeroExpInventory;
  enhancementComponents: { xp10: number; xp100: number };
  unassignedGear: UnassignedGearInventory;
  essenceStones: number; // advanced resource, reserved for future use
  mithril: number;       // advanced resource, reserved for future use
}

interface OptimizationResult {
  selectedTop5: Hero[];
  selectedTop3: Hero[];
  heroLevelPlan: HeroLevelPlan;
  gearAssignmentPlan: GearAssignmentPlan;
  gearEnhancementPlan: GearEnhancementPlan;
  resourcesUsed: { heroExp: number; enhancementXp: number };
  resourcesRemaining: { heroExp: number; enhancementXp: number };
  warnings: string[];
}
```

### How Gear Is Represented Internally

- **Equipped gear lives on the hero.** Each `Hero.gear` object has exactly 4
  keys (`goggles`, `gloves`, `belt`, `boots`), each either an
  `EquippedGearPiece` (`{ slot, rarity, enhancementLevel }`) or `null` if the
  hero doesn't have that piece yet. Rarity and enhancement level are tracked
  as two independent fields on the same piece, per spec.
- **Unequipped gear lives in the inventory**, as pure counts:
  `UnassignedGearInventory` is `Record<slot, Record<rarity, number>>` — e.g.
  "2 Epic Goggles, 1 Mythic Goggles" — with no per-item identity, since a
  stack of unequipped Epic Goggles is fungible until it's put on a hero.
- **A physical piece is always in exactly one place**: on a hero's `gear`
  object, or as a +1 in `unassignedGear`. The redistribution engine
  (`lib/optimizer/gearAssignment.ts`) enforces this — whenever a piece is
  un-equipped it's either handed directly to another hero (gear moving
  hero-to-hero preserves its exact `enhancementLevel`) or incremented back
  into the inventory counts (which, being just counts, can't preserve an
  individual item's enhancement level — a documented Phase 1 simplification).
- **Rarity is compared with a simple rank** (`common < uncommon < rare < epic
  < mythic`, see `lib/data/gearRarity.ts`); enhancement level is not compared
  when deciding "is this gear better," matching the spec's "don't implement
  complex gear-stat comparisons beyond rarity yet."

## 4. Hero Level XP Table

Full table (level → XP required to reach that level) lives in
`lib/data/heroXpTable.ts`, levels 1-80, exactly as specified (Lv2=480 ... Lv80=2,400,000).
`heroXpCost(from, to)` sums the range; verified against the worked example in
the spec (70→73 = 2,840,000) via unit tests.

## 5. Hero Gear Enhancement XP Table

Full table lives in `lib/data/gearXpTable.ts`, levels 1-100, exactly as
specified (Lv1=10 ... Lv100=2,400). `gearXpCost(from, to)` sums the range;
verified against the worked example (20→25 = 600) via unit tests.

## 6. Hero Master Database

`lib/data/heroDatabase.ts` contains all heroes from the spec: the 13
Base/Epic-Rare heroes, plus Gen 1 through Gen 17 (Infantry/Lancer/Marksman
triples per generation, including Gen 1's extra Infantry hero, Jeronimo).
Known rally-support specialists (Jessie, Jasser, Jeronimo) are pre-tagged with
`RallySupport`/`BearTrap` role tags for the Bear Trap Rally Joiner logic, and
this list is exported separately (`KNOWN_RALLY_SUPPORT_HERO_IDS`) so it's easy
to extend as new support-oriented heroes are added.

## 7. Optimization Algorithms

All four core algorithms are implemented exactly per spec:

- **`optimizeHeroLeveling`** (`lib/optimizer/heroXp.ts`) — unchanged logic;
  now reads its XP budget from `getAvailableHeroExp(inventory)`, which
  resolves whichever of the two EXP input modes is active (never both).
- **`optimizeGearEnhancement`** (`lib/optimizer/gearEnhancement.ts`) — walks
  each Top-3 hero's 4 gear slots (skipping `null` slots), balanced/priority,
  capped at level 100. Only ever operates on the exact `top3` array passed in.
- **`redistributeGear`** (`lib/optimizer/gearAssignment.ts`) — the new gear
  redistribution engine. Pass 1 gives each Top 5 hero (in rank order) the
  best available rarity for each slot, drawn from either the unassigned
  inventory or gear currently equipped on a non-Top-5 hero (which gets
  reclaimed if it's strictly better than what the Top 5 hero already has).
  Pass 2 fills every other hero's remaining/empty slots from whatever's left
  in the inventory pool. A companion `applyGearAssignments` helper produces
  updated `Hero[]` objects from a plan without mutating the input.
- **`rankHeroes`** (`lib/optimizer/ranking.ts`) — multi-factor scoring
  (generation, troop-type balance, stars, level, gear quality/enhancement,
  combat usefulness, Bear Trap usefulness, external tier list) rather than
  raw power, with full manual override support (`manualTop5Ids`,
  `manualTop3Ids`). Gear quality/enhancement scoring now reads the 4-slot
  gear object instead of an array.
- **`recommendRallyCaptain` / `recommendRallyJoiner`**
  (`lib/optimizer/bearTrap.ts`) — unchanged.
- **`recommendCounter`** (`lib/optimizer/counters.ts`) — unchanged.
- **`runOptimization`** (`lib/optimizer/runOptimization.ts`) — orchestrates
  ranking → leveling → gear redistribution → applying that gear → gear
  enhancement (so enhancement acts on each Top 3 hero's *post-redistribution*
  gear) → a single `OptimizationResult`.

## 8. Unit Tests

`__tests__/` — 23 tests, all passing (`npm test`):

| # | Scenario | File |
|---|----------|------|
| 1 | 5 heroes Lv1, enough XP to level equally → balanced output | `heroXp.test.ts` |
| 2 | 5 heroes at different levels → lowest caught up first | `heroXp.test.ts` |
| 3 | All Top 5 at Lv80 → Hero EXP remains unused | `heroXp.test.ts` |
| 4 | Top 3 gear at different levels → balanced enhancement | `gearEnhancement.test.ts` |
| 5 | Hero #4 gear stays Lv0 even with huge component inventory | `gearEnhancement.test.ts` |
| 6 | Top 3 gear all Lv100 → Enhancement XP remains unused | `gearEnhancement.test.ts` |
| 7 | Hero EXP item conversion (1K/5K/10K/50K) | `inventoryAndCounters.test.ts` |
| 8 | Enhancement inventory conversion (xp10/xp100) | `inventoryAndCounters.test.ts` |
| 9 | Counter logic (Infantry/Lancer/Marksman triangle) | `inventoryAndCounters.test.ts` |
| A | Manual Hero EXP `"3.6m"` → 3,600,000 | `inventoryAndCounters.test.ts` |
| B | Manual Hero EXP `"750k"` → 750,000 | `inventoryAndCounters.test.ts` |
| C | EXP items 1K/5K/10K/50K × 10 → 660,000 | `inventoryAndCounters.test.ts` |
| D | Hero gear state (goggles/gloves/belt/boots) persists correctly | `gearAssignment.test.ts` |
| E | Unassigned Mythic Goggles upgrades Hero #1's Rare Goggles; Rare returns to inventory | `gearAssignment.test.ts` |
| F | Top-5 hero reclaims Epic Boots from Hero #6; displaced Rare Boots stays available; no piece is duplicated/deleted | `gearAssignment.test.ts` |
| G | Enhancement Components still apply only to Top 3 after gear reassignment | `gearAssignment.test.ts` |
| — | Hero EXP never reaches a 6th hero / never exceeds level 80 | `heroXp.test.ts` |
| — | Priority mode levels Hero #1 first | `heroXp.test.ts` |
| — | Gear enhancement never exceeds level 100 / skips empty slots | `gearEnhancement.test.ts` |
| — | `getAvailableHeroExp` never sums both EXP modes together | `inventoryAndCounters.test.ts` |

## 9. Mobile UI Wireframe (text form)

```
┌─────────────────────────┐
│ WOS Hero Optimizer       │ ← header
├─────────────────────────┤
│  [Optimize Heroes]       │
│  [Bear Trap]             │ ← Home: big tappable cards
│  [Combat / Counter]      │
│  [Saved Results]         │
├─────────────────────────┤
│ 1. Your Heroes           │
│  [Hero ▾] Lv[__] ★[_]   │ ← repeatable rows, + Add Hero
│  ...                     │
│ 2. Hero EXP Inventory    │
│  1K[_] 5K[_] 10K[_] 50K[_]│
│ 3. Enhancement Components │
│  10XP[_] 100XP[_] sac..  │
│ 4. Strategy               │
│  EXP mode: [Balanced ▾]  │
│  Gear mode:[Balanced ▾]  │
│  [ ] Manual Top 5         │
│  [ Run Optimization ]    │ ← big primary button
├─────────────────────────┤
│ Results                  │
│  Top 5 — Hero EXP         │
│   #1 Name  Lv65→73        │
│   ...                    │
│  EXP Used / Remaining     │
│  Top 3 — Gear Enhancement │
│   Name: Slot Lv20→35      │
│  Notes & Assumptions      │
│   - warnings, in plain    │
│     language               │
├─────────────────────────┤
│ [Home][Optimize][Bear][Combat] │ ← bottom nav, fixed
└─────────────────────────┘
```

Color coding: Infantry = blue badge, Lancer = amber badge, Marksman = green
badge (see `app/globals.css` `.troop-*` classes).

## 10. Working Phase 1 Implementation

This whole repository *is* the Phase 1 implementation: manual data entry,
exact Hero EXP math, exact gear enhancement math, Top 5 / Top 3 rules, full
hero database, and a results screen — all working and tested.

## 11. Run Locally

```bash
cd wos-hero-optimizer
npm install
npm run dev       # http://localhost:3000
```

Run the test suite (56 tests, incl. 33 for screenshot import):

```bash
npm test
```

Type-check:

```bash
npx tsc --noEmit
```

Production build:

```bash
npm run build && npm start
```

To install as a PWA: open the dev/prod URL on a phone browser and use
"Add to Home Screen" (manifest is already wired up in `public/manifest.json`
and `app/layout.tsx`).

## 12. Future Screenshot-Recognition Work (Phase 2 / 3 / 4)

Interfaces for all of this already exist (`imageRecognition/index.ts`,
`screenshotParser/index.ts`) so implementations can be swapped in without
touching the optimizer or UI.

**Phase 2 — OCR + Review/Confirm (DONE for resource screens)**
- `TesseractOcrEngine` implements `OcrEngine` (plus `recognizeWords`, which
  returns every word with a bounding box).
- `createResourceInventoryParser` runs a "bright-text" pass first (WOS draws
  quantities as white text with a dark outline), and retries with an
  auto-inverted grayscale pass if too few numbers were found.
- Numbers are matched to fields in screen reading order. This is a weak
  guess, so suggestion confidence is capped at 0.5 and always flagged.
- Tested end-to-end in headless Chromium against a mock backpack screenshot:
  all four quantities read correctly, including `1,284`.
- Still to do: validate against real in-game screenshots and tune the
  bright-text threshold; `RosterGridConfig` card cropping for roster screens.

**Phase 3 — Portrait recognition & auto gear detection**
- Implement `HeroPortraitMatcher` — likely a small embedding-similarity model
  (e.g. a lightweight CNN or CLIP-style embedding) trained/fine-tuned on
  cropped hero portraits, with OCR of the name label as a secondary
  cross-check only, never primary identification.
- Implement `IconMatcher` for troop-type icons and generation badges.
- Implement automatic hero gear screenshot parsing (`HeroGearScreenshotParser`)
  to populate `GearPiece[]` automatically instead of manual entry.
- Build out full Bear Trap screenshot support (detecting rally sizes,
  opponent formations) and opponent/counter screenshot parsing.

**Phase 4 — Persistence & sharing**
- Move from in-memory React state to IndexedDB (roster, inventory, and
  results persist across sessions).
- Shareable/exportable results (e.g. a shareable summary link or image export).
- Optional cloud sync (Supabase or similar) if multi-device sync is wanted.

Everything in Phases 2-4 is additive: the calculator engine (Phase 1) does
not need to change to support any of it, since screenshots only ever need to
produce the same `Hero[]` / `Inventory` / `GearPiece[]` shapes that manual
entry already produces today.

## 13. Hero Portrait Library & Roster Recognition (package integration)

### Portrait library
- Source: `portraits/` from the project package — 65 files, copied verbatim to
  `public/assets/heroes/portraits/`. Nothing was scraped or substituted.
- `lib/data/heroPortraits.ts` is the only place that knows filenames. IDs are
  normalized (`Wu Ming` / `wu_ming` → `wu-ming`). Two filenames don't match
  their hero's ID and are handled as aliases, without renaming the files:
  `lumak.png` → `lumak-bokan`, `greg_s3.png` → `greg`.
- `HERO_DATABASE` (spec §13 — generation and troop type come only from there)
  has a `portrait` field on every hero. `__tests__/heroPortraits.test.ts`
  checks: 65 heroes, every hero has a portrait, every file exists, no orphan
  or duplicate portraits, and the database matches the spec table in
  `docs/package/WOS_Hero_Optimizer_Complete_Breakdown.md` exactly.
- `<HeroPortrait heroId="sergey" />` — fixed square sizes, `object-fit: cover`,
  initials fallback if the id is unknown or the image fails, optional
  confidence badge, never throws.

### Roster recognition pipeline
```
roster screenshot
 → rosterSegmenter      find the card grid (auto-detects the panel colour)
 → portraitMatcher      identify hero: NCC vs. the 65 library portraits (coarse → fine)
 → OCR (Tesseract.js)   "Lv. N" label only
 → cardReadouts         stars + tier from lit star petals (6 petals = 6 tiers)
 → RosterScanReview     user marks every card Correct / Change Hero / Skip
 → mergeRosterEntries   confirmed heroes only; gear untouched
```
Interfaces: `HeroRecognizer.identifyHero(image) → HeroRecognitionResult[]`
(`imageRecognition/heroRecognizer.ts`). `LocalPortraitRecognizer` is the
current implementation; a stronger model can replace it without touching the
parser, review screen or optimizer.

### What it was tested on — and what that does NOT prove
Measured in `__tests__/rosterRecognition.test.ts` and in a real browser run:
- 2 reference screenshots, 26 hero cards, one phone (706×1536).
- Cards found: 26/26 (cut-off cards skipped). Heroes identified: 26/26 top-1,
  with a clear lead over the runner-up on every card. ~100 ms per card in Node;
  ~8 s for the first screenshot in the browser (includes loading portraits and
  the OCR model), ~4 s for the next.
- Level OCR: 26/26 read "Lv. 1" correctly — but every sample card is level 1,
  so two-digit levels are untested.
- Stars: full-star counts checked by eye; tier (petal) counts are from pixel
  measurement, not independent ground truth.
- Untested: other phones/aspect ratios, tablets, different UI scale, dark or
  compressed screenshots, new heroes without a library portrait, skins.
Confidence scores are heuristic (similarity + gap to runner-up), not
calibrated probabilities. That is why the review step is mandatory.

### Remaining for Phase 2
- Test the roster scan on more screenshots (other phones, higher-level heroes,
  Gen 5+ heroes) and tune thresholds from real misses.
- Hero Gear screenshot parsing (slots, rarity by frame colour, enhancement
  level) — the gear screen layout is in the reference screenshots, but there
  are no examples with gear equipped yet.
- Icon-based resource detection (currently OCR + reading-order guess).
- Troop-icon / generation-badge checks as a cross-check on the portrait match.
- Persistence (IndexedDB) so a scanned roster survives a page reload.

## 14. Real screenshot test cases (added 2026-09-26)

Four real screenshots live in `docs/package/reference-screenshots/06_real_test_cases/`
with expected results in `EXPECTED.md`. They are covered by
`__tests__/realScreenshots.test.ts` and `__tests__/resourceReaders.test.ts`, and
were also run end-to-end in a real browser.

| Case | Result |
|---|---|
| Roster, top of list (1206×2622) | 16/16 heroes identified; cut-off bottom row reported, not guessed; side-panel handle no longer widens the right column |
| Roster, scrolled to end | 10/10 heroes; cut-off top row reported |
| Both + a mid-scroll capture, uploaded out of order | **26 unique heroes**, 8 duplicates merged, Power order preserved |
| Same roster from two different phones | 16 unique (not 32) |
| Hero XP resource list | **143,390,000** (from the “Hero XP” row, bottle icon confirmed) |
| Enhancement Components backpack | 100 XP × 171 = 17,100 · 10 XP × 40,526 = 405,260 · **422,360** |

### How duplicates across screenshots are handled
`lib/screenshot/rosterScanMerge.ts`. Hero id (from the portrait match) is the
primary key — a hero can only appear once in a real roster. Troop icon,
stars/tier, level and card order are compared as secondary signals:
agreeing → merged silently; disagreeing but both confidently identified →
merged and flagged for review; disagreeing and uncertain → kept separate and
flagged “possible duplicate”. Two cards in the same screenshot are never
merged. A new screenshot's heroes are placed next to the heroes it shares with
earlier screenshots, so upload order doesn't matter when screenshots overlap.

### New secondary signal: troop icon
`imageRecognition/cardSignals.ts` — templates built only from the original
package screenshots; **26/26 correct on the held-out real screenshots**. If the
icon disagrees with the portrait match, confidence drops and the card is
flagged. A corner-badge (“S3/S4”) detector was tried and dropped: colour-based
detection gave false positives on bright orange card art.

### Resources
- `parseGameNumber` handles `143.39M`, `70.50M`, `135.19K`, `10.42K`,
  `40,526`, `6.49M`.
- Hero XP: label-anchored (`“Hero XP”` + number on the same row), bottle icon
  as confirmation. Transparent PNG crops are now handled (they used to turn
  black and break OCR).
- Components: each tile's top number (10/100) is paired with the number below
  it in the same tile, so XP-per-item is never mistaken for quantity. Tile
  colour (100 = purple, 10 = green) and the nut icon confirm it. If the
  full-screen pass misses a quantity, the tile is re-read from a close-up.
  In the browser, “171” was missed the first time because it touched the tile's
  bottom edge; long horizontal lines are now removed before OCR.
- The Review screen shows `items × XP = total` live as you edit.

### Known limits (honest)
- Resource screens from other phones / languages / UI scales are untested.
- Tile colour and icon checks are colour heuristics, not trained recognition.
- Hero levels in all samples are 1; two-digit level OCR is still untested.


## 15. Legendary / Mastery / priority-pieces update (2026-09-28)

**Gear model** (`lib/types`): `GearRarity` (= `GearQuality`) now includes `"legendary"` — a
progression state after Mythic +100 / Mastery 10 + ascension, with its own enhancement scale.
`EquippedGearPiece` gains `mastery {level, stage}`, `legendaryTier?`, `empowermentLevel?`,
`actualPower?`, `priority?`, `id?`. Enhancement, Mastery and Legendary progression are separate
fields and separate resource pools (`HeroGearInventory`: Enhancement XP · Essence Stones ·
Mithril · spare Mythic gear).

**Data**: `lib/data/masteryForgingTable.ts` (user rows Lv 1 – 11.1; wiki rows 11.2 – 20.0),
`lib/data/legendaryProgression.ts` (ascension; thresholds +19/+39 from the user, +59/+79/+99
from the wiki without Mastery requirements; Legendary XP per level from the wiki's Gear
Empowerment table; the +0 → +1 step is marked unknown).

**Top 3 Enhancement** (`lib/optimizer/gearEnhancement.ts`): the 6 priority pieces (user-marked,
or each hero's 2 most-progressed) are finished first; only then are the other 6 balanced. Each
piece uses its own cost table; Legendary pieces stop at their threshold and report what the next
step needs instead of pretending XP can finish it. Mastery / ascension / thresholds are planned
separately in `gearProgressionPlan.ts` (all-or-nothing, priority pieces first).

**Comparison**: `getGearProgressionRank` (quality → Mastery → enhancement → empowerment; actual
power wins when known). Gear redistribution and hero ranking use it, so Legendary +19 is never
replaced by Mythic +100.

**UI**: page starts with no heroes; “+ Add Hero” opens the hero picker; picker groups run
Base → Gen 17 for every filter; each gear slot edits Quality, Enhancement, Mastery level/stage and
Priority. Roster, gear, inventory and strategy are saved in localStorage
(`lib/storage/savedState.ts`) with a migration that fills Mastery 0/0 for older records.
