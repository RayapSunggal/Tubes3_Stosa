import type { DetectorStats } from "./types";

export const LATEST_SCAN_STORAGE_KEY = "judolDetector.latestScan";
export const BLUR_SETTING_STORAGE_KEY = "judolDetector.blurEnabled";
export const OCR_SETTING_STORAGE_KEY = "judolDetector.ocrEnabled";
export const AHO_CORASICK_SETTING_STORAGE_KEY =
  "judolDetector.ahoCorasickEnabled";
export const RABIN_KARP_SETTING_STORAGE_KEY =
  "judolDetector.rabinKarpEnabled";
export const DEFAULT_BLUR_ENABLED = true;
export const DEFAULT_OCR_ENABLED = true;
export const DEFAULT_AHO_CORASICK_ENABLED = true;
export const DEFAULT_RABIN_KARP_ENABLED = true;
export const GET_LATEST_SCAN_MESSAGE = "judolDetector.getLatestScan";
export const SCAN_UPDATED_MESSAGE = "judolDetector.scanUpdated";
export const FETCH_IMAGE_MESSAGE = "judolDetector.fetchImage";

export interface OcrStats {
  candidateImageCount: number;
  analyzedImageCount: number;
  matchedImageCount: number;
  matchCount: number;
  keywordCounts: Record<string, number>;
  executionTimeMs: number;
  errorCount: number;
}

export interface LatestScanSnapshot {
  url: string;
  title: string;
  scannedAt: number;
  stats: DetectorStats;
  ocrStats?: OcrStats;
}

export interface GetLatestScanMessage {
  type: typeof GET_LATEST_SCAN_MESSAGE;
}

export interface ScanUpdatedMessage {
  type: typeof SCAN_UPDATED_MESSAGE;
  snapshot: LatestScanSnapshot;
}

export interface FetchImageMessage {
  type: typeof FETCH_IMAGE_MESSAGE;
  url: string;
}

export interface FetchImageSuccessResponse {
  ok: true;
  contentType: string;
  base64: string;
}

export interface FetchImageErrorResponse {
  ok: false;
  error: string;
}

export type FetchImageResponse =
  | FetchImageSuccessResponse
  | FetchImageErrorResponse;

export type JudolRuntimeMessage =
  | GetLatestScanMessage
  | ScanUpdatedMessage
  | FetchImageMessage;
