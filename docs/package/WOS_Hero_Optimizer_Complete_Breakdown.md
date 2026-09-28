# WOS Hero Optimizer — Complete Project Breakdown

## 1. Project Goal

Build a mobile-first Whiteout Survival hero optimization app that can eventually read screenshots and recommend how to use Hero EXP, Hero Gear, Hero Gear Enhancement Components, hero shards, and mode-specific formations.

The app should prioritize calculation correctness first, then screenshot automation later.

---

## 2. Fixed Core Rules

### Hero EXP
- Only the **Top 5 heroes** are eligible to receive Hero EXP.
- Hero EXP never spills to Hero #6 or below.
- Maximum hero level is **80**.
- If all Top 5 heroes reach Level 80, leftover Hero EXP remains unused.
- Default leveling strategy is **balanced leveling**: bring lower-level heroes among the Top 5 upward before over-leveling one hero.
- Manual Top 5 selection should always be available.

### Hero Gear Assignment
- Every hero may receive gear if enough gear exists.
- The **best compatible gear** should go to the Top 5 first.
- Remaining heroes receive remaining gear.
- Gear rarity assignment and gear enhancement are separate systems.
- Equipped gear and unassigned gear must be tracked separately so gear is never duplicated or double-counted.

### Hero Gear Enhancement Components
- Only the **Top 3 heroes** are eligible for Hero Gear Enhancement Components.
- Heroes #4 and #5 never receive Hero Gear Enhancement Components.
- This rule does not change even if the Top 5 are already at maximum hero level.
- Heroes #4 and below may wear gear, but their gear enhancement remains at **0**.
- Maximum Hero Gear enhancement level is **100**.
- If all eligible Top 3 gear is maxed, leftover Enhancement XP remains unused.

### Hierarchy
- **Top 5:** Hero EXP + first priority for best gear.
- **Top 3:** subset of Top 5; also receive Hero Gear Enhancement Components.
- **Everyone else:** remaining gear only, no Hero EXP, no gear enhancement.

---

## 3. Hero Gear Slots and Rarity

Each hero has 4 gear slots:
- Goggles
- Gloves
- Belt
- Boots

Supported gear rarities:
- Common
- Uncommon
- Rare
- Epic
- Mythic

Each equipped gear piece should eventually store:
- slot
- rarity
- enhancement level
- optional mastery level
- optional ascension data
- troop compatibility / class if required by the game data

Recommended internal object:

```ts
interface EquippedGearPiece {
  slot: "goggles" | "gloves" | "belt" | "boots";
  rarity: "common" | "uncommon" | "rare" | "epic" | "mythic";
  enhancementLevel: number;
}
```

---

## 4. Hero EXP Inventory

Hero EXP items come in:
- 1K
- 5K
- 10K
- 50K

Formula:

```text
Total Hero EXP =
(1,000 × qty1k)
+ (5,000 × qty5k)
+ (10,000 × qty10k)
+ (50,000 × qty50k)
```

The UI should support **two mutually exclusive entry modes**:

### Mode A — Total EXP
Allow direct entry such as:
- `3600000`
- `3.6m`
- `3.6M`
- `750k`

Parser examples:
- `750k` → 750,000
- `3.6m` → 3,600,000
- `70500000` → 70,500,000

### Mode B — EXP Item Counts
Fields for:
- 1K items
- 5K items
- 10K items
- 50K items

Do not add the total-mode value and item-mode value together. Only the active mode is used.

---

## 5. Hero Level XP Table

Treat each number as the XP required to reach that level from the previous level.

```text
1=0
2=480
3=690
4=920
5=1200
6=1500
7=1800
8=2200
9=2600
10=3100
11=3800
12=4200
13=5100
14=5700
15=6800
16=7800
17=8900
18=10000
19=12000
20=13000
21=14000
22=15000
23=16000
24=17000
25=18000
26=19000
27=20000
28=21000
29=22000
30=24000
31=26000
32=28000
33=30000
34=32000
35=36000
36=40000
37=44000
38=48000
39=52000
40=58000
41=64000
42=70000
43=76000
44=82000
45=90000
46=98000
47=100000
48=110000
49=120000
50=130000
51=140000
52=150000
53=160000
54=170000
55=190000
56=210000
57=230000
58=250000
59=270000
60=300000
61=330000
62=360000
63=390000
64=420000
65=470000
66=520000
67=570000
68=620000
69=670000
70=770000
71=870000
72=970000
73=1000000
74=1100000
75=1300000
76=1500000
77=1700000
78=1900000
79=2100000
80=2400000
```

Cost from current level to target level:

```text
sum XP[current+1 ... target]
```

Example:

```text
70 → 73
71 = 870,000
72 = 970,000
73 = 1,000,000
Total = 2,840,000
```

---

## 6. Top 5 Hero EXP Optimization

Default goal: maximize the minimum level among the selected Top 5.

Suggested logic:

```text
while EXP remains:
  find the lowest current level among Top 5
  find all Top 5 heroes tied at that level
  calculate the next-level cost for each
  raise the lowest heroes as evenly as resources allow
  never select Hero #6+
  stop at Level 80 or when no valid next level is affordable
```

If there is not enough EXP to level all heroes tied at the same level, use a stable Top-5 rank order and clearly show the final unequal result.

Optional later mode:
- Hero #1 priority
- Custom priority

---

## 7. Hero Gear Enhancement Component Inventory

Known consumables:
- 10 Enhancement XP Component
- 100 Enhancement XP Component

Formula:

```text
Total Enhancement XP =
(10 × qty10)
+ (100 × qty100)
```

Architecture should allow more component denominations later.

Optional sacrificed Hero Gear XP was also discussed from the Hero Gear reference page:
- Grey = 10 XP
- Green = 30 XP
- Blue = 60 XP
- Purple = 150 XP

Keep sacrificed gear sources separate from Enhancement Component item counts, even if both can feed the same enhancement XP pool when that feature is enabled.

---

## 8. Hero Gear Enhancement XP Table

Treat each number as XP required to reach that gear enhancement level.

```text
1=10
2=15
3=20
4=25
5=30
6=35
7=40
8=45
9=50
10=55
11=60
12=65
13=70
14=75
15=80
16=85
17=90
18=95
19=100
20=105
21=110
22=115
23=120
24=125
25=130
26=135
27=140
28=145
29=150
30=160
31=170
32=180
33=190
34=200
35=210
36=220
37=230
38=240
39=250
40=270
41=290
42=310
43=330
44=350
45=370
46=390
47=410
48=430
49=450
50=470
51=490
52=510
53=530
54=550
55=570
56=590
57=610
58=630
59=650
60=680
61=710
62=740
63=770
64=800
65=830
66=860
67=890
68=920
69=950
70=990
71=1030
72=1070
73=1110
74=1150
75=1190
76=1230
77=1270
78=1310
79=1350
80=1400
81=1450
82=1500
83=1550
84=1600
85=1650
86=1700
87=1750
88=1800
89=1850
90=1900
91=1950
92=2000
93=2050
94=2100
95=2150
96=2200
97=2250
98=2300
99=2350
100=2400
```

Cost from current enhancement level to target level:

```text
sum gearXP[current+1 ... target]
```

Example:

```text
20 → 25
21=110
22=115
23=120
24=125
25=130
Total=600 Enhancement XP
```

---

## 9. Top 3 Gear Enhancement Optimization

Eligible heroes:
- Top 3 only

Eligible pieces:
- 4 per hero
- 12 total

Default goal:
- Keep Top 3 gear reasonably balanced while spending Enhancement XP efficiently.

Basic logic:

```text
while Enhancement XP remains:
  find eligible Top 3 gear pieces with the lowest enhancement level
  calculate next-level cost
  upgrade an affordable lowest-level piece
  use stable order for ties
  stop at Level 100
```

Tie order may be:
1. Hero #1: Goggles, Gloves, Belt, Boots
2. Hero #2: Goggles, Gloves, Belt, Boots
3. Hero #3: Goggles, Gloves, Belt, Boots

Hard restriction:
- Never enhance gear on Hero #4 or below.

---

## 10. Extra / Unassigned Hero Gear

The app needs a separate inventory for gear not currently equipped on heroes.

Track counts by slot and rarity:

| Slot | Common | Uncommon | Rare | Epic | Mythic |
|---|---:|---:|---:|---:|---:|
| Goggles | 0 | 0 | 0 | 0 | 0 |
| Gloves | 0 | 0 | 0 | 0 | 0 |
| Belt | 0 | 0 | 0 | 0 | 0 |
| Boots | 0 | 0 | 0 | 0 | 0 |

Equipped gear must not be counted again in this inventory.

---

## 11. Gear Redistribution Logic

Inputs:
- Heroes and currently equipped gear
- Extra / unassigned gear inventory
- Selected Top 5

Outputs:
- Recommended final gear assignments
- Displaced gear returned to inventory
- Final leftover inventory

Baseline rarity order:

```text
Mythic > Epic > Rare > Uncommon > Common
```

Rules:
1. Top 5 get first access to the best compatible gear.
2. Compare gear by slot.
3. If a stronger unassigned piece replaces a weaker equipped piece, return the old piece to the inventory pool.
4. Gear can later be reassigned from a lower-ranked hero to a Top-5 hero if compatible and better.
5. Never delete or duplicate a gear item.
6. After Top 5 are handled, remaining heroes can receive the remaining gear.
7. Gear enhancement eligibility remains Top 3 only regardless of gear redistribution.

---

## 12. Hero Star / Shard Progression

Each star contains 6 tiers.

### 1 Star
- Tier costs: 1, 1, 2, 2, 2, 2
- Total: 10 shards

### 2 Stars
- Tier costs: 5, 5, 5, 5, 5, 15
- Total: 40 shards

### 3 Stars
- Tier costs: 15, 15, 15, 15, 15, 40
- Total: 115 shards

### 4 Stars
- Tier costs: 40, 40, 40, 40, 40, 100
- Total: 300 shards

### 5 Stars
- Tier costs: 100, 100, 100, 100, 100, 100
- Total: 600 shards

Total from 0 stars to full 5 stars:

```text
10 + 40 + 115 + 300 + 600 = 1,065 shards
```

This progression is separate from Hero EXP and gear enhancement.

---

## 13. Hero Master Database Through Gen 17

### Base / Epic-Rare
- Smith — Infantry
- Eugene — Infantry
- Charlie — Lancer
- Cloris — Marksman
- Sergey — Infantry
- Jessie — Lancer
- Patrick — Lancer
- Lumak Bokan — Lancer
- Ling Xue — Lancer
- Gina — Marksman
- Bahiti — Marksman
- Jasser — Marksman
- Seo-yoon — Marksman

### Gen 1
- Natalia — Infantry
- Jeronimo — Infantry
- Molly — Lancer
- Zinman — Marksman

### Gen 2
- Flint — Infantry
- Philly — Lancer
- Alonso — Marksman

### Gen 3
- Logan — Infantry
- Mia — Lancer
- Greg — Marksman

### Gen 4
- Ahmose — Infantry
- Reina — Lancer
- Lynn — Marksman

### Gen 5
- Hector — Infantry
- Norah — Lancer
- Gwen — Marksman

### Gen 6
- Wu Ming — Infantry
- Renee — Lancer
- Wayne — Marksman

### Gen 7
- Edith — Infantry
- Gordon — Lancer
- Bradley — Marksman

### Gen 8
- Gatot — Infantry
- Sonya — Lancer
- Hendrik — Marksman

### Gen 9
- Magnus — Infantry
- Fred — Lancer
- Xura — Marksman

### Gen 10
- Gregory — Infantry
- Freya — Lancer
- Blanchette — Marksman

### Gen 11
- Eleonora — Infantry
- Lloyd — Lancer
- Rufus — Marksman

### Gen 12
- Hervor — Infantry
- Karol — Lancer
- Ligeia — Marksman

### Gen 13
- Gisela — Infantry
- Flora — Lancer
- Vulcanus — Marksman

### Gen 14
- Elif — Infantry
- Dominic — Lancer
- Cara — Marksman

### Gen 15
- Hank — Infantry
- Estrella — Lancer
- Viveca — Marksman

### Gen 16
- Seigel — Infantry
- Ursar — Lancer
- Aisling — Marksman

### Gen 17
- Aiden — Infantry
- Bertha — Lancer
- Eleanor — Marksman

---

## 14. Hero Selection Philosophy

Do not choose Top 5 only by raw power.

Potential ranking inputs:
- Generation
- Troop type
- Hero level
- Stars / star tier
- Gear rarity
- Gear enhancement
- Combat usefulness
- Bear Trap usefulness
- Role tags
- Optional external tier-list metadata

Always allow:
- Manual Top 5 override
- Manual Top 3 override

Possible role tags:
- combat
- development
- rally_join_support
- bear_trap
- exploration

---

## 15. Combat Counter Rules

Counter relationship discussed:

```text
Infantry > Lancer
Lancer > Marksman
Marksman > Infantry
```

The combat guide referenced in the discussion also described a 10% attack bonus for favorable counters and suggested 40% Infantry / 30% Lancer / 30% Marksman as a general balanced composition when the opponent is unknown.

Treat these as strategy-layer rules, not as part of the hard resource math.

Potential future mode:
- Upload opponent roster / troop composition
- Recommend counter-oriented heroes and troop composition

---

## 16. Bear Trap / Bear Hunt Module

Keep Bear Trap separate from generic hero ranking.

### Rally Captain Mode
- Uses 3 heroes.
- All 3 heroes’ stats / expedition skills matter.
- Recommend formation based on available heroes and generation.
- Support troop ratio recommendations.

### Rally Joiner Mode
- Far-left hero is important for the joining formation logic discussed.
- Support heroes such as Jessie, Jasser, and Jeronimo were specifically discussed as relevant rally-support options when appropriate.
- Do not rank joiner formations by raw hero power alone.

The app should eventually explain why a Bear Trap hero was selected.

---

## 17. Chief Gear vs Hero Gear

Keep these as separate systems.

### Hero Gear
- Hero equipment
- Gear rarity
- Gear enhancement XP
- Mastery / ascension later
- Enhancement Components used for the Top 3 only under this app strategy

### Chief Gear
- Separate system with its own materials and progression
- Discussed materials include Hardened Alloy, Polishing Solution, Design Plans, and later Amber

Chief Gear should be an independent future module rather than mixed into the Hero Gear optimizer.

---

## 18. Screenshot Processing Plan

Screenshot automation should be a later phase, not the starting point.

### Supported screenshot types
1. Hero roster screenshots
2. Hero EXP inventory screenshots
3. Enhancement Component screenshots
4. Hero Gear screenshots
5. Optional opponent screenshots
6. Optional Bear Trap screenshots

### Hero roster parsing
Use:
- fixed grid/card segmentation
- portrait matching / image recognition as primary hero ID method
- OCR as secondary support
- troop icon detection
- generation badge detection
- level recognition
- star / partial-star recognition if possible
- preserve Power-sorted order

### Resource parsing
Use icon recognition plus OCR for quantities.

### Required review screen
Never silently trust OCR or image recognition.

Before calculating, show:
- hero name
- generation
- troop type
- level
- stars
- gear
- resource quantities
- confidence

Allow manual correction of every detected value.

---

## 19. Current UI Changes Requested

### Hero card order
Each hero card should be organized as:

```text
Hero selector
Level
Stars
Hero Gear
  Goggles
  Gloves
  Belt
  Boots
```

Use compact mobile dropdowns.

On wider mobile widths, use a 2-column gear grid:
- Goggles / Gloves
- Belt / Boots

On narrow widths, stack them.

### Hero EXP section
Add a toggle:
- Total EXP
- EXP Items

### Inventory sections
Split inventory into clear groups:

#### Hero EXP
- direct total OR item counts

#### Hero Gear Enhancement
- 10 XP components
- 100 XP components

#### Extra / Unassigned Hero Gear
- quantities by slot and rarity

#### Advanced Resources
- Essence Stones
- Mithril
- future ascension resources

Do not mix everything into one undifferentiated inventory form.

---

## 20. Recommended TypeScript Models

```ts
type TroopType = "infantry" | "lancer" | "marksman";

type GearSlot = "goggles" | "gloves" | "belt" | "boots";

type GearRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "mythic";

interface EquippedGearPiece {
  slot: GearSlot;
  rarity: GearRarity;
  enhancementLevel: number;
  masteryLevel?: number;
}

interface Hero {
  id: string;
  name: string;
  generation: number;
  troopType: TroopType;
  level: number;
  stars: number;
  starTier?: number;
  power?: number;
  roleTags?: string[];
  gear: {
    goggles: EquippedGearPiece | null;
    gloves: EquippedGearPiece | null;
    belt: EquippedGearPiece | null;
    boots: EquippedGearPiece | null;
  };
  sourceConfidence?: number;
}

interface HeroExpInventory {
  mode: "total" | "items";
  manualTotal: number;
  items: {
    exp1k: number;
    exp5k: number;
    exp10k: number;
    exp50k: number;
  };
}

type UnassignedGearInventory = Record<
  GearSlot,
  Record<GearRarity, number>
>;

interface Inventory {
  heroExp: HeroExpInventory;
  enhancementComponents: {
    xp10: number;
    xp100: number;
  };
  unassignedGear: UnassignedGearInventory;
  essenceStones: number;
  mithril: number;
}
```

---

## 21. Recommended App Architecture

Preferred stack discussed:
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui or similar lightweight component system
- localStorage / IndexedDB initially
- optional Supabase later
- image-recognition layer abstracted behind interfaces

Suggested modules:

```text
src/
  data/
    heroDatabase.ts
    heroXpTable.ts
    gearXpTable.ts
    shardTable.ts
  optimizer/
    heroXp.ts
    gearEnhancement.ts
    gearAssignment.ts
    bearTrap.ts
    combat.ts
  imageRecognition/
    heroPortraitMatcher.ts
    rosterSegmenter.ts
    resourceRecognizer.ts
    screenshotParser.ts
  components/
    HeroCard.tsx
    HeroGearEditor.tsx
    HeroExpInput.tsx
    EnhancementInventory.tsx
    UnassignedGearInventory.tsx
    ReviewDetectedData.tsx
    OptimizationResults.tsx
```

---

## 22. Recommended Development Phases

### Phase 1 — Manual Calculator
Build first:
- Hero database
- Hero selection
- Hero levels and stars
- Equipped gear entry
- Manual Hero EXP total / EXP item entry
- Enhancement Component entry
- Extra / unassigned gear entry
- Top 5 Hero EXP calculation
- Top 3 gear enhancement calculation
- Basic gear redistribution
- Result screen
- Unit tests

### Phase 2 — Screenshot Assistance
- Screenshot upload
- OCR resource quantities
- Hero card segmentation
- Detection confidence
- Manual review and correction

### Phase 3 — Recognition + Strategy
- Hero portrait matching
- Automatic gear detection
- Bear Trap recommendations
- PvP/PvE counter analysis

### Phase 4 — Persistence and Sharing
- Saved profiles
- Saved optimization runs
- Shareable results
- Optional cloud sync

---

## 23. Required Validation Tests

### Hero EXP
1. `3.6m` parses as 3,600,000.
2. `750k` parses as 750,000.
3. EXP item counts convert correctly.
4. Top 5 at different levels are balanced upward.
5. Top 5 at Level 80 leave EXP unused.
6. Hero #6 never receives EXP.

### Gear State
7. Hero with mixed slot rarities persists correctly.
8. Unassigned Mythic piece can replace weaker Top-5 piece.
9. Displaced weaker piece returns to inventory.
10. Gear can move from a lower-ranked hero to a Top-5 hero if better and compatible.
11. No gear item is duplicated or lost.

### Enhancement Components
12. Only Top 3 gear may be enhanced.
13. Hero #4 remains enhancement level 0 even with huge component inventory.
14. All Top 3 gear at Level 100 leaves Enhancement XP unused.

### Combat
15. Infantry counters Lancer.
16. Lancer counters Marksman.
17. Marksman counters Infantry.

---

## 24. Suggested Result Screen

### Top 5 Hero EXP
Show per hero:
- current level
- target level
- EXP used

Show totals:
- Hero EXP available
- Hero EXP used
- Hero EXP remaining

### Top 5 Gear Assignment
Show:
- current gear
- recommended gear
- moved / replaced items
- remaining unassigned inventory

### Top 3 Gear Enhancement
Show each of 12 eligible gear pieces:
- current enhancement
- target enhancement
- Enhancement XP used

Show totals:
- Enhancement XP available
- used
- remaining

### Warnings
Examples:
- “Hero #4 has strong gear but Enhancement Components are reserved for Top 3.”
- “All Top 3 gear is at the configured cap. Remaining components are unused.”
- “Hero EXP remains because all Top 5 heroes are Level 80.”

---

## 25. External References Shared in the Discussion

- Chief Gear — Whiteout Survival Wiki
  - https://www.whiteoutsurvival.wiki/chief-gear/chief-gear/

- Bear Hunt — Whiteout Survival Wiki
  - https://www.whiteoutsurvival.wiki/events/bear-hunt/

- Hero Gear — Whiteout Survival Wiki
  - https://www.whiteoutsurvival.wiki/hero-gears/hero-gear/

- WoS Hero Tier List & Guide — WoSTools
  - https://wostools.net/guides/hero-guide

- WoS Combat Strategy Guide — WoSTools
  - https://wostools.net/guides/combat-guide

These should be treated as reference inputs. Hard calculator math should use verified progression tables and explicit user rules.

---

## 26. Files Shared During the Discussion

- Multiple hero roster, progression, resource, combat, and UI screenshots.
- `heros xp_gear calculator.xlsx` was also provided as a supporting workbook and can be used as an additional data source after its tables/formulas are validated.

---

## 27. Most Important Product Principle

The optimizer should separate three decisions:

```text
WHO gets Hero EXP?       → Top 5 only
WHO gets the best gear?  → Top 5 first
WHO gets gear XP?        → Top 3 only
```

Those eligibility rules should not change automatically because a different resource reaches its cap.

This is the core strategy the app must preserve throughout future features.
