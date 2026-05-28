import type { DetectorStats } from "./types";

export const LATEST_SCAN_STORAGE_KEY = "judolDetector.latestScan";
export const BLUR_SETTING_STORAGE_KEY = "judolDetector.blurEnabled";
export const DEFAULT_BLUR_ENABLED = true;
export const GET_LATEST_SCAN_MESSAGE = "judolDetector.getLatestScan";
export const SCAN_UPDATED_MESSAGE = "judolDetector.scanUpdated";

export interface LatestScanSnapshot {
  url: string;
  title: string;
  scannedAt: number;
  stats: DetectorStats;
}

export interface GetLatestScanMessage {
  type: typeof GET_LATEST_SCAN_MESSAGE;
}

export interface ScanUpdatedMessage {
  type: typeof SCAN_UPDATED_MESSAGE;
  snapshot: LatestScanSnapshot;
}

export type JudolRuntimeMessage = GetLatestScanMessage | ScanUpdatedMessage;
