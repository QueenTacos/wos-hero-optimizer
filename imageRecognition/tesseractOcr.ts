// ============================================================================
// Tesseract.js OCR engine (Phase 2). Runs entirely in the user's browser —
// screenshots never leave the device. The language model (~2-4 MB) downloads
// from the jsDelivr CDN on first use and is cached by the browser after that.
// ============================================================================

import type { Worker } from "tesseract.js";
import type { OcrEngine, OcrResult, OcrWord, RecognizeWordsOptions } from "./index";
import { preprocessImage } from "./preprocess";
import { parseQuantityText } from "../lib/screenshot/quantityTokens";

const NUMERIC_WHITELIST = "0123456789,.kKmMxX";
// PSM 11 = sparse text: find as much text as possible in no particular order.
// Right for backpack grids where numbers are scattered across item icons.
const PSM_SPARSE_TEXT = "11";
const PSM_AUTO = "3";
const PSM_SINGLE_LINE = "7";

type ProgressFn = ((p: number) => void) | undefined;

export class TesseractOcrEngine implements OcrEngine {
  private workerPromise: Promise<Worker> | null = null;
  private currentProgress: ProgressFn;

  private getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        // Dynamic import keeps tesseract.js out of the main bundle until someone actually scans.
        const { createWorker } = await import("tesseract.js");
        // Self-hosted builds (e.g. the preview page, which can't fetch from other sites) set
        // globalThis.__WOS_OCR_PATHS = { workerPath, corePath, langPath }. Default: jsDelivr.
        const paths = (globalThis as { __WOS_OCR_PATHS?: Record<string, string> }).__WOS_OCR_PATHS ?? {};
        // Self-hosted builds may also need to stage the language data first (see preview/).
        await (globalThis as { __WOS_OCR_PREPARE?: () => Promise<void> }).__WOS_OCR_PREPARE?.();
        return createWorker("eng", 1, {
          ...paths,
          logger: (m) => {
            if (m.status === "recognizing text") this.currentProgress?.(m.progress);
          },
        });
      })();
      this.workerPromise.catch(() => {
        this.workerPromise = null; // allow a retry after e.g. a network failure
      });
    }
    return this.workerPromise;
  }

  async recognizeWords(image: Blob, options: RecognizeWordsOptions = {}): Promise<OcrWord[]> {
    const worker = await this.getWorker();
    const { canvas, scale } = await preprocessImage(image, options.preprocess ?? "bright-text");

    await worker.setParameters({
      tessedit_pageseg_mode: (options.singleLine ? PSM_SINGLE_LINE : options.numericOnly === false ? PSM_AUTO : PSM_SPARSE_TEXT) as never,
      tessedit_char_whitelist: options.whitelist ?? (options.numericOnly === false ? "" : NUMERIC_WHITELIST),
    });

    this.currentProgress = options.onProgress;
    try {
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const words: OcrWord[] = [];
      for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs) {
          for (const line of para.lines) {
            for (const w of line.words) {
              const text = w.text.trim();
              if (!text) continue;
              words.push({
                text,
                confidence: w.confidence / 100,
                bbox: {
                  x: w.bbox.x0 / scale,
                  y: w.bbox.y0 / scale,
                  width: (w.bbox.x1 - w.bbox.x0) / scale,
                  height: (w.bbox.y1 - w.bbox.y0) / scale,
                },
              });
            }
          }
        }
      }
      return words;
    } finally {
      this.currentProgress = undefined;
    }
  }

  async recognizeText(image: ImageBitmap | Blob): Promise<OcrResult> {
    const blob = await toBlob(image);
    const words = await this.recognizeWords(blob, { numericOnly: false, preprocess: "grayscale" });
    const conf = words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : 0;
    return { rawText: words.map((w) => w.text).join(" "), confidence: conf };
  }

  async recognizeNumber(image: ImageBitmap | Blob): Promise<{ value: number | null; confidence: number }> {
    const blob = await toBlob(image);
    const words = await this.recognizeWords(blob, { numericOnly: true });
    let best: { value: number | null; confidence: number } = { value: null, confidence: 0 };
    for (const w of words) {
      const value = parseQuantityText(w.text);
      if (value !== null && w.confidence > best.confidence) best = { value, confidence: w.confidence };
    }
    return best;
  }

  async terminate(): Promise<void> {
    if (this.workerPromise) {
      const w = await this.workerPromise.catch(() => null);
      this.workerPromise = null;
      await w?.terminate();
    }
  }
}

async function toBlob(image: ImageBitmap | Blob): Promise<Blob> {
  if (image instanceof Blob) return image;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image."))), "image/png")
  );
}

/** One shared engine per page load so the language model is only loaded once. */
let shared: TesseractOcrEngine | null = null;
export function getSharedOcrEngine(): TesseractOcrEngine {
  if (!shared) shared = new TesseractOcrEngine();
  return shared;
}
