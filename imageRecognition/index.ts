// ============================================================================
// Image Recognition — interface layer.
//
// Phase 2: OCR is implemented (see ./tesseractOcr.ts, Tesseract.js, runs
// fully in the browser). Portrait matching and icon matching are still
// Phase 3 placeholders. The optimizer and UI only depend on these
// interfaces, so engines can be swapped without touching them.
// ============================================================================

import { TroopType } from "../lib/types";
import type { OcrWord } from "../lib/screenshot/quantityTokens";

export type { OcrWord };

export interface RecognizeWordsOptions {
  /** Restrict recognition to digits, separators, K/M and "x". */
  numericOnly?: boolean;
  /** Image cleanup applied before OCR (default "bright-text"). */
  preprocess?: "bright-text" | "bright-any" | "grayscale" | "grayscale-dark-text" | "grayscale-light-text" | "none";
  /** Override the default numeric whitelist (e.g. "Lv.0123456789"). */
  whitelist?: string;
  /** Treat the image as a single line of text (e.g. one "Lv. 12" label). */
  singleLine?: boolean;
  /** Find scattered text anywhere (e.g. numbers on gear tiles) even when numericOnly is false. */
  sparse?: boolean;
  /** 0-1 progress callback. */
  onProgress?: (p: number) => void;
}

export interface PortraitMatchResult {
  heroId: string | null;
  confidence: number; // 0-1
}

export interface OcrResult {
  rawText: string;
  confidence: number; // 0-1
}

export interface IconMatchResult {
  iconId: string | null;
  confidence: number;
}

/**
 * Abstraction over "identify a hero from a cropped card image". The first
 * real implementation will likely be a small embedding-similarity model
 * (portrait matching), with OCR of the name label as a secondary signal —
 * per the spec, OCR must never be trusted as primary identification.
 */
export interface HeroPortraitMatcher {
  matchPortrait(cardImage: ImageBitmap | Blob): Promise<PortraitMatchResult>;
}

/** Abstraction over OCR so the underlying engine (Tesseract.js, cloud OCR, etc.) can change. */
export interface OcrEngine {
  recognizeText(image: ImageBitmap | Blob, options?: { lang?: string }): Promise<OcrResult>;
  recognizeNumber(image: ImageBitmap | Blob): Promise<{ value: number | null; confidence: number }>;
  /** Every word on the image with its bounding box (in original image pixels). */
  recognizeWords(image: Blob, options?: RecognizeWordsOptions): Promise<OcrWord[]>;
}

/** Abstraction over troop-type / generation badge icon recognition. */
export interface IconMatcher {
  matchTroopTypeIcon(iconImage: ImageBitmap | Blob): Promise<{ troopType: TroopType | null; confidence: number }>;
  matchGenerationBadge(badgeImage: ImageBitmap | Blob): Promise<IconMatchResult>;
}

/**
 * Placeholder implementation that always returns "unknown" with 0
 * confidence, forcing the Review/Confirm screen to require manual entry.
 * Swap this out once a real model/OCR pipeline is wired in.
 */
export class UnimplementedHeroPortraitMatcher implements HeroPortraitMatcher {
  async matchPortrait(): Promise<PortraitMatchResult> {
    return { heroId: null, confidence: 0 };
  }
}

export class UnimplementedOcrEngine implements OcrEngine {
  async recognizeText(): Promise<OcrResult> {
    return { rawText: "", confidence: 0 };
  }
  async recognizeNumber(): Promise<{ value: number | null; confidence: number }> {
    return { value: null, confidence: 0 };
  }
  async recognizeWords(): Promise<OcrWord[]> {
    return [];
  }
}
