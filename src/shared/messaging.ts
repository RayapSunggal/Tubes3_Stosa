import type { DetectorStats } from "./types";

export const LATEST_SCAN_STORAGE_KEY = "judolDetector.latestScan";

export interface LatestScanSnapshot {
  url: string;
  title: string;
  scannedAt: number;
  stats: DetectorStats;
}
