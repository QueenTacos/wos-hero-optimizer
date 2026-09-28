// ============================================================================
// Hero recognition — the abstraction the rest of the app depends on.
//
// Canonical reference set: the local hero portrait library
// (lib/data/heroPortraits.ts → public/assets/heroes/portraits). Hero identity
// comes from PORTRAIT MATCHING, never from OCR of names (roster cards don't
// show names).
//
// Implementations:
//   - LocalPortraitRecognizer: in-browser NCC matcher (portraitMatcher.ts).
//     Prototype quality — measured 26/26 on the two reference screenshots.
//   - UnimplementedHeroRecognizer: always "unknown", forces manual entry.
// Swap in a better model later (e.g. an embedding model) by implementing
// HeroRecognizer; the parser, review screen and optimizer don't change.
// ============================================================================

import { HERO_DATABASE } from "../lib/data/heroDatabase";
import { buildPortraitIndex, matchCard, PortraitIndex, HeroRecognitionResult } from "./portraitMatcher";
import { RGBAImage, loadRGBAImage } from "./pixels";
import type { HeroPortraitMatcher, PortraitMatchResult } from "./index";

export type { HeroRecognitionResult };

export interface HeroRecognizer {
  /**
   * Identify the hero on ONE cropped roster card. Returns candidates best
   * first, each with a 0-1 confidence. Callers must show these for review —
   * never commit them automatically.
   */
  identifyHero(image: ImageData | Blob | RGBAImage, opts?: { topK?: number }): Promise<HeroRecognitionResult[]>;
}

async function toRGBA(image: ImageData | Blob | RGBAImage): Promise<RGBAImage> {
  if (typeof Blob !== "undefined" && image instanceof Blob) return loadRGBAImage(image);
  const i = image as RGBAImage;
  return { data: i.data, width: i.width, height: i.height };
}

export class LocalPortraitRecognizer implements HeroRecognizer, HeroPortraitMatcher {
  private indexPromise: Promise<PortraitIndex> | null = null;

  constructor(
    /** Override how portraits are loaded (tests pass decoded files; the browser fetches /assets). */
    private loadPortraits: () => Promise<{ heroId: string; image: RGBAImage }[]> = () => loadPortraitLibraryInBrowser()
  ) {}

  /** Loads + indexes the portrait library once. Safe to call repeatedly. */
  warmUp(): Promise<PortraitIndex> {
    if (!this.indexPromise) {
      this.indexPromise = this.loadPortraits().then(buildPortraitIndex);
      this.indexPromise.catch(() => (this.indexPromise = null));
    }
    return this.indexPromise;
  }

  async identifyHero(image: ImageData | Blob | RGBAImage, opts: { topK?: number } = {}): Promise<HeroRecognitionResult[]> {
    const index = await this.warmUp();
    return matchCard(index, await toRGBA(image), opts.topK ?? 3);
  }

  /** Legacy Phase-3 interface from imageRecognition/index.ts. */
  async matchPortrait(cardImage: ImageBitmap | Blob): Promise<PortraitMatchResult> {
    if (!(cardImage instanceof Blob)) return { heroId: null, confidence: 0 };
    const [top] = await this.identifyHero(cardImage, { topK: 1 });
    return top ? { heroId: top.heroId, confidence: top.confidence } : { heroId: null, confidence: 0 };
  }

  /** Browser default: fetch every portrait from /assets. Reports progress via onLibraryProgress. */
  static browserLoader(onProgress?: (loaded: number, total: number) => void) {
    return () => loadPortraitLibraryInBrowser(onProgress);
  }
}

async function loadPortraitLibraryInBrowser(onProgress?: (loaded: number, total: number) => void) {
  const heroes = HERO_DATABASE.filter((h) => h.portrait);
  let loaded = 0;
  const results = await Promise.all(
    heroes.map(async (h) => {
      try {
        const image = await loadRGBAImage(h.portrait!);
        return { heroId: h.id, image };
      } catch {
        return null; // a missing/broken portrait just drops out of the reference set
      } finally {
        onProgress?.(++loaded, heroes.length);
      }
    })
  );
  return results.filter((r): r is { heroId: string; image: RGBAImage } => r !== null);
}

export class UnimplementedHeroRecognizer implements HeroRecognizer {
  async identifyHero(): Promise<HeroRecognitionResult[]> {
    return [];
  }
}

let shared: LocalPortraitRecognizer | null = null;
/** One recognizer per page load so the 65 portraits are fetched and indexed once. */
export function getSharedHeroRecognizer(onProgress?: (loaded: number, total: number) => void): LocalPortraitRecognizer {
  if (!shared) shared = new LocalPortraitRecognizer(LocalPortraitRecognizer.browserLoader((l, t) => progressCb?.(l, t)));
  progressCb = onProgress;
  return shared;
}
let progressCb: ((loaded: number, total: number) => void) | undefined;
