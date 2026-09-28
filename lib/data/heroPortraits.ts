// ============================================================================
// Hero portrait library — the canonical local reference image set.
//
// Source: the `portraits/` folder from WOS_Hero_Optimizer_Full_Project_Package,
// copied verbatim (original filenames kept) into
// `public/assets/heroes/portraits/`. Nothing is scraped or substituted.
//
// This file is the ONLY place that knows portrait filenames. Everything else
// (hero database, <HeroPortrait />, the roster recognizer) looks portraits up
// by hero id through the helpers below.
// ============================================================================

/** Overridable (set globalThis.__WOS_ASSET_BASE before the app loads) for static/offline builds such as the preview. */
export const PORTRAIT_BASE_PATH: string =
  (globalThis as { __WOS_ASSET_BASE?: string }).__WOS_ASSET_BASE ?? "/assets/heroes/portraits";

/** Every file in the supplied portrait folder, exactly as named. */
export const PORTRAIT_FILES = [
  "ahmose.png", "aiden.png", "aisling.png", "alonso.png", "bahiti.png", "bertha.png",
  "blanchette.jpg", "bradley.jpg", "cara.png", "charlie.png", "cloris.png", "dominic.png",
  "edith.jpg", "eleanor.png", "eleonora.jpg", "elif.png", "estrella.png", "eugene.png",
  "flint.png", "flora.jpg", "fred.jpg", "freya.jpg", "gatot.jpg", "gina.png",
  "gisela.jpg", "gordon.jpg", "greg_s3.png", "gregory.jpg", "gwen.jpg", "hank.png",
  "hector.jpg", "hendrik.jpg", "hervor.jpg", "jasser.jpg", "jeronimo.png", "jessie.png",
  "karol.jpg", "ligeia.jpg", "ling_xue.jpg", "lloyd.jpg", "logan.png", "lumak.png",
  "lynn.jpg", "magnus.jpg", "mia.png", "molly.png", "natalia.png", "norah.jpg",
  "patrick.png", "philly.png", "reina.jpg", "renee.jpg", "rufus.jpg", "seigel.png",
  "seo_yoon.jpg", "sergey.png", "smith.png", "sonya.jpg", "ursar.png", "viveca.png",
  "vulcanus.jpg", "wayne.jpg", "wu_ming.jpg", "xura.jpg", "zinman.png",
] as const;

export type PortraitFile = (typeof PORTRAIT_FILES)[number];

/**
 * Filenames whose normalized stem is NOT the hero id. Kept as aliases so the
 * original assets are never renamed.
 *  - lumak.png   -> Lumak Bokan (short name)
 *  - greg_s3.png -> Greg (the "_s3" matches the S3 badge on Greg's roster card)
 */
export const PORTRAIT_FILENAME_ALIASES: Record<string, string> = {
  lumak: "lumak-bokan",
  "greg-s3": "greg",
};

/** "Wu Ming" / "wu_ming" / "Seo-yoon" -> "wu-ming" / "seo-yoon". Same rule as the hero database. */
export function normalizeHeroId(nameOrStem: string): string {
  return nameOrStem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function heroIdForFile(file: string): string {
  const stem = normalizeHeroId(file.replace(/\.[a-z0-9]+$/i, ""));
  return PORTRAIT_FILENAME_ALIASES[stem] ?? stem;
}

/** heroId -> public URL path, e.g. heroPortraits["wu-ming"] === "/assets/heroes/portraits/wu_ming.jpg" */
export const heroPortraits: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(PORTRAIT_FILES.map((f) => [heroIdForFile(f), `${PORTRAIT_BASE_PATH}/${f}`]))
);

/** Returns the portrait path for a hero id, or null if the library has none (never throws). */
export function getHeroPortraitPath(heroId: string | null | undefined): string | null {
  if (!heroId) return null;
  return heroPortraits[normalizeHeroId(heroId)] ?? null;
}
