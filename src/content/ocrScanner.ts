import { runFullDetector } from "../detector/fullDetector";
import {
  type OcrStats,
  RECOGNIZE_IMAGE_MESSAGE,
  type RecognizeImageResponse,
} from "../shared/messaging";
import type { DetectorOptions, DetectorOutput } from "../shared/types";
import { attachTooltipData, type TooltipPayload } from "./tooltip";

const OCR_MATCH_CLASS = "judol-detector-ocr-match";
const PREVIOUS_TABINDEX_DATA_KEY = "judolPreviousTabIndex";
const NO_TABINDEX_SENTINEL = "__none__";
const MIN_IMAGE_WIDTH = 72;
const MIN_IMAGE_HEIGHT = 28;
const MAX_CACHE_ENTRIES = 80;
const OCR_TEXT_PREVIEW_LENGTH = 180;
const IMAGE_LOAD_TIMEOUT_MS = 5000;
const MAX_OCR_ERROR_LOGS = 5;

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
    stats.executionTimeMs = now() - startedAt;
    onProgress?.(cloneOcrStats(stats));
    logOcrScanSummary(stats);
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
      logOcrImageError(image, error, stats.errorCount);
    } finally {
      stats.executionTimeMs = now() - startedAt;
      onProgress?.(cloneOcrStats(stats));
    }
  }

  stats.executionTimeMs = now() - startedAt;
  logOcrScanSummary(stats);
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
    .filter(isReadableImage)
    .sort(compareImagePriority);
}

function isReadableImage(image: HTMLImageElement): boolean {
  if (!image.isConnected || !getImageSource(image)) {
    return false;
  }

  if (
    image.complete &&
    (image.naturalWidth < MIN_IMAGE_WIDTH ||
      image.naturalHeight < MIN_IMAGE_HEIGHT)
  ) {
    return false;
  }

  const rect = image.getBoundingClientRect();
  if (rect.width < MIN_IMAGE_WIDTH || rect.height < MIN_IMAGE_HEIGHT) {
    return false;
  }

  return !hasHiddenAncestor(image);
}

function hasHiddenAncestor(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;

  while (current) {
    const style = window.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function compareImagePriority(
  left: HTMLImageElement,
  right: HTMLImageElement,
): number {
  return getImagePriority(right) - getImagePriority(left);
}

function getImagePriority(image: HTMLImageElement): number {
  const rect = image.getBoundingClientRect();
  const viewportArea = getViewportOverlapArea(rect);
  const area = rect.width * rect.height;
  const topPenalty = Math.max(0, rect.top);

  return viewportArea * 4 + area - topPenalty;
}

function getViewportOverlapArea(rect: DOMRect): number {
  const left = Math.max(0, rect.left);
  const right = Math.min(window.innerWidth, rect.right);
  const top = Math.max(0, rect.top);
  const bottom = Math.min(window.innerHeight, rect.bottom);

  if (right <= left || bottom <= top) {
    return 0;
  }

  return (right - left) * (bottom - top);
}

async function recognizeImage(
  image: HTMLImageElement,
): Promise<RecognizedImageText> {
  await waitForImageReady(image);

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
  const response = await recognizeImageThroughBackground(image);

  return {
    text: normalizeOcrText(response.text),
  };
}

function waitForImageReady(image: HTMLImageElement): Promise<void> {
  if (image.complete) {
    return image.naturalWidth > 0 && image.naturalHeight > 0
      ? Promise.resolve()
      : Promise.reject(new Error("Image failed to load"));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Image load timed out"));
    }, IMAGE_LOAD_TIMEOUT_MS);

    const handleLoad = () => {
      cleanup();
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve();
        return;
      }

      reject(new Error("Image loaded without readable dimensions"));
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Image failed to load"));
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };

    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });
}

async function recognizeImageThroughBackground(
  image: HTMLImageElement,
): Promise<Extract<RecognizeImageResponse, { ok: true }>> {
  const source = getImageSource(image);
  const payload = /^(data|blob):/u.test(source)
    ? { dataUrl: await readPageImageAsDataUrl(source) }
    : { url: source };

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: RECOGNIZE_IMAGE_MESSAGE,
        ...payload,
      },
      (response?: RecognizeImageResponse) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response) {
          reject(new Error("No OCR recognition response"));
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

async function readPageImageAsDataUrl(source: string): Promise<string> {
  const response = await fetch(source);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read image data URL"));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Unable to read image"));
    });
    reader.readAsDataURL(blob);
  });
}

function markImageMatch(match: OcrImageMatch): void {
  const { image, detectorOutput, text, ocrExecutionTimeMs } = match;
  const algorithms = unique(
    detectorOutput.matches.flatMap((item) => item.algorithms),
  );
  const keywords = unique(detectorOutput.matches.flatMap((item) => item.keywords));

  image.classList.add(OCR_MATCH_CLASS);
  image.dataset.judolOcrMatch = "true";
  preserveTabIndex(image);

  attachTooltipData(image, {
    keyword: keywords.join(", "),
    algorithm: `OCR, ${algorithms.join(", ")}`,
    count: detectorOutput.matches.length,
    algorithmTimes: [
      { label: "OCR", timeMs: ocrExecutionTimeMs },
      ...getDetectorAlgorithmTimes(detectorOutput, algorithms),
    ],
    matchedText: createTextPreview(text),
  });
}

function getDetectorAlgorithmTimes(
  detectorOutput: DetectorOutput,
  algorithms: string[],
): TooltipPayload["algorithmTimes"] {
  return detectorOutput.stats.algorithmStats
    .filter((item) => algorithms.some((algorithm) => algorithm === item.algorithm))
    .map((item) => ({
      label: formatAlgorithmName(item.algorithm),
      timeMs: item.executionTimeMs,
    }));
}

function formatAlgorithmName(algorithm: string): string {
  switch (algorithm) {
    case "BoyerMoore":
      return "Boyer Moore";
    case "WeightedLevenshtein":
      return "Weighted Levenshtein";
    case "AhoCorasick":
      return "Aho-Corasick";
    case "RabinKarp":
      return "Rabin-Karp";
    default:
      return algorithm;
  }
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

function logOcrImageError(
  image: HTMLImageElement,
  error: unknown,
  errorCount: number,
): void {
  if (errorCount > MAX_OCR_ERROR_LOGS) {
    return;
  }

  const rect = image.getBoundingClientRect();
  console.warn("[Judol Detector] OCR skipped image", {
    reason: getErrorMessage(error),
    source: getImageSource(image).slice(0, 140),
    renderedSize: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    naturalSize: `${image.naturalWidth}x${image.naturalHeight}`,
  });
}

function logOcrScanSummary(stats: OcrStats): void {
  console.info("[Judol Detector] OCR scan complete", {
    candidates: stats.candidateImageCount,
    analyzed: stats.analyzedImageCount,
    matchedImages: stats.matchedImageCount,
    matches: stats.matchCount,
    errors: stats.errorCount,
    timeMs: Math.round(stats.executionTimeMs),
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
