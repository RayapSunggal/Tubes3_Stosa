import type { DetectorStats } from "./types";

export const LATEST_SCAN_STORAGE_KEY = "judolDetector.latestScan";
export const BLUR_SETTING_STORAGE_KEY = "judolDetector.blurEnabled";
export const DEFAULT_BLUR_ENABLED = true;

export interface LatestScanSnapshot {
  url: string;
  title: string;
  scannedAt: number;
  stats: DetectorStats;
}
