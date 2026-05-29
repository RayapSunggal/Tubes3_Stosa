import Tesseract from "tesseract.js";
import { runFullDetector } from "../detector/fullDetector";
import {
  FETCH_IMAGE_MESSAGE,
  type FetchImageResponse,
  type OcrStats,
} from "../shared/messaging";
import type { DetectorOptions, DetectorOutput } from "../shared/types";
import { attachTooltipData } from "./tooltip";

const OCR_MATCH_CLASS = "judol-detector-ocr-match";
const PREVIOUS_TABINDEX_DATA_KEY = "judolPreviousTabIndex";
const NO_TABINDEX_SENTINEL = "__none__";
const MIN_IMAGE_WIDTH = 72;
const MIN_IMAGE_HEIGHT = 28;
const MAX_CACHE_ENTRIES = 80;
const OCR_TEXT_PREVIEW_LENGTH = 180;

interface CachedOcrText {
  text: string;
}

interface RecognizedImageText {
  text: string;
  executionTimeMs: number;
  fromCache: boolean;
}

interface OcrImageMatch {
  image: HTMLImageElement;
  text: string;
  detectorOutput: DetectorOutput;
  ocrExecutionTimeMs: number;
}

export interface OcrScanOutput {
  stats: OcrStats;
}

type OcrProgressCallback = (stats: OcrStats) => void;

let workerPromise: Promise<Tesseract.Worker> | null = null;
const ocrTextCache = new Map<string, Promise<CachedOcrText>>();

export async function scanImagesWithOcr(
  root: ParentNode,
  keywords: string[],
  options: DetectorOptions,
  onProgress?: OcrProgressCallback,
): Promise<OcrScanOutput> {
  const startedAt = now();
  const candidates = collectReadableImages(root);
  const stats: OcrStats = {
    candidateImageCount: candidates.length,
    analyzedImageCount: 0,
    matchedImageCount: 0,
    matchCount: 0,
    keywordCounts: {},
    executionTimeMs: 0,
    errorCount: 0,
  };

  if (candidates.length === 0) {
    onProgress?.(cloneOcrStats(stats));
    return { stats };
  }

  injectOcrStyle();
  onProgress?.(cloneOcrStats(stats));

  for (const image of candidates) {
    try {
      const recognized = await recognizeImage(image);
      stats.analyzedImageCount += 1;

      if (recognized.text.trim().length === 0) {
        continue;
      }

      const detectorOutput = runFullDetector({
        text: recognized.text,
        keywords,
        options,
      });

      if (detectorOutput.matches.length === 0) {
        continue;
      }

      stats.matchedImageCount += 1;
      stats.matchCount += detectorOutput.matches.length;
      addKeywordCounts(stats.keywordCounts, detectorOutput.stats.keywordCounts);
      markImageMatch({
        image,
        text: recognized.text,
        detectorOutput,
        ocrExecutionTimeMs: recognized.executionTimeMs,
      });
    } catch (error) {
      stats.errorCount += 1;
      console.debug("[Judol Detector] OCR skipped image", error);
    } finally {
      stats.executionTimeMs = now() - startedAt;
      onProgress?.(cloneOcrStats(stats));
    }
  }

  stats.executionTimeMs = now() - startedAt;
  return { stats };
}

function cloneOcrStats(stats: OcrStats): OcrStats {
  return {
    ...stats,
    keywordCounts: { ...stats.keywordCounts },
  };
}

export function clearOcrState(root: ParentNode = document): void {
  const images = Array.from(
    root.querySelectorAll<HTMLImageElement>("[data-judol-ocr-match='true']"),
  );

  for (const image of images) {
    image.classList.remove(OCR_MATCH_CLASS);
    delete image.dataset.judolOcrMatch;

    const previousTabIndex = image.dataset[PREVIOUS_TABINDEX_DATA_KEY];
    if (previousTabIndex === NO_TABINDEX_SENTINEL) {
      image.removeAttribute("tabindex");
    } else if (typeof previousTabIndex === "string") {
      image.setAttribute("tabindex", previousTabIndex);
    }

    delete image.dataset[PREVIOUS_TABINDEX_DATA_KEY];
  }
}

function collectReadableImages(root: ParentNode): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>("img"))
    .filter(isReadableImage);
}

function isReadableImage(image: HTMLImageElement): boolean {
  if (!image.isConnected || !image.complete || !getImageSource(image)) {
    return false;
  }

  if (
    image.naturalWidth < MIN_IMAGE_WIDTH ||
    image.naturalHeight < MIN_IMAGE_HEIGHT
  ) {
    return false;
  }

  const rect = image.getBoundingClientRect();
  if (rect.width < MIN_IMAGE_WIDTH || rect.height < MIN_IMAGE_HEIGHT) {
    return false;
  }

  const style = window.getComputedStyle(image);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

async function recognizeImage(
  image: HTMLImageElement,
): Promise<RecognizedImageText> {
  const cacheKey = getImageCacheKey(image);
  const cached = ocrTextCache.get(cacheKey);

  if (cached) {
    return {
      ...(await cached),
      executionTimeMs: 0,
      fromCache: true,
    };
  }

  const startedAt = now();
  const pendingText = recognizeImageUncached(image).catch((error: unknown) => {
    ocrTextCache.delete(cacheKey);
    throw error;
  });

  ocrTextCache.set(cacheKey, pendingText);
  trimOcrCache();

  return {
    ...(await pendingText),
    executionTimeMs: now() - startedAt,
    fromCache: false,
  };
}

async function recognizeImageUncached(
  image: HTMLImageElement,
): Promise<CachedOcrText> {
  const worker = await getOcrWorker();
  const blob = await loadImageBlob(image);
  const result = await worker.recognize(blob);

  return {
    text: normalizeOcrText(result.data.text),
  };
}

async function getOcrWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((error: unknown) => {
      workerPromise = null;
      throw error;
    });
  }

  return workerPromise;
}

async function createOcrWorker(): Promise<Tesseract.Worker> {
  const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    workerPath: chrome.runtime.getURL("tesseract/worker.min.js"),
    corePath: chrome.runtime.getURL("tesseract/tesseract-core-lstm.wasm.js"),
    langPath: chrome.runtime.getURL("tessdata/4.0.0_best_int"),
    cachePath: "judol-detector-ocr",
    workerBlobURL: false,
    gzip: true,
    logger: () => {},
  });

  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
    user_defined_dpi: "96",
  });

  return worker;
}

async function loadImageBlob(image: HTMLImageElement): Promise<Blob> {
  const source = getImageSource(image);

  if (source.startsWith("data:") || source.startsWith("blob:")) {
    const response = await fetch(source);
    return response.blob();
  }

  const response = await fetchImageThroughBackground(source);
  return base64ToBlob(response.base64, response.contentType);
}

function fetchImageThroughBackground(url: string): Promise<Extract<FetchImageResponse, { ok: true }>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: FETCH_IMAGE_MESSAGE,
        url,
      },
      (response?: FetchImageResponse) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response) {
          reject(new Error("No OCR image response"));
          return;
        }

        if (!response.ok) {
          reject(new Error(response.error));
          return;
        }

        resolve(response);
      },
    );
  });
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType });
}

function markImageMatch(match: OcrImageMatch): void {
  const { image, detectorOutput, text, ocrExecutionTimeMs } = match;
  const algorithms = unique(
    detectorOutput.matches.flatMap((item) => item.algorithms),
  );
  const keywords = unique(detectorOutput.matches.flatMap((item) => item.keywords));
  const detectorTimeMs = detectorOutput.stats.algorithmStats.reduce(
    (total, item) => total + item.executionTimeMs,
    0,
  );

  image.classList.add(OCR_MATCH_CLASS);
  image.dataset.judolOcrMatch = "true";
  preserveTabIndex(image);

  attachTooltipData(image, {
    keyword: keywords.join(", "),
    algorithm: `OCR, ${algorithms.join(", ")}`,
    count: detectorOutput.matches.length,
    executionTimeMs: detectorTimeMs+ocrExecutionTimeMs,
    matchedText: createTextPreview(text),
  });
}

function preserveTabIndex(image: HTMLImageElement): void {
  if (image.dataset[PREVIOUS_TABINDEX_DATA_KEY] === undefined) {
    image.dataset[PREVIOUS_TABINDEX_DATA_KEY] = image.hasAttribute("tabindex")
      ? image.getAttribute("tabindex") ?? ""
      : NO_TABINDEX_SENTINEL;
  }

  image.tabIndex = 0;
}

function getImageSource(image: HTMLImageElement): string {
  return image.currentSrc || image.src || "";
}

function getImageCacheKey(image: HTMLImageElement): string {
  const source = getImageSource(image);
  return [
    source.slice(0, 240),
    source.length,
    image.naturalWidth,
    image.naturalHeight,
  ].join("|");
}

function trimOcrCache(): void {
  while (ocrTextCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = ocrTextCache.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }

    ocrTextCache.delete(oldestKey);
  }
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/[|\u00a6]/gu, "I")
    .replace(/\s+/gu, " ")
    .trim();
}

function createTextPreview(text: string): string {
  const compact = normalizeOcrText(text);
  return compact.length > OCR_TEXT_PREVIEW_LENGTH
    ? `${compact.slice(0, OCR_TEXT_PREVIEW_LENGTH - 3)}...`
    : compact;
}

function addKeywordCounts(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const [keyword, count] of Object.entries(source)) {
    target[keyword] = (target[keyword] ?? 0) + count;
  }
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function injectOcrStyle(): void {
  if (document.getElementById("judol-detector-ocr-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "judol-detector-ocr-style";
  style.textContent = `
    .judol-detector-ocr-match {
      outline: 3px solid rgba(214, 79, 69, 0.82);
      outline-offset: 2px;
      border-radius: 4px;
      box-shadow: 0 0 0 5px rgba(255, 204, 51, 0.42);
      cursor: help;
    }

    .judol-detector-ocr-match:focus {
      outline-color: #d64f45;
    }
  `;
  document.documentElement.appendChild(style);
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}
