import { useEffect, useMemo, useState } from "react";
import {
  BLUR_SETTING_STORAGE_KEY,
  DEFAULT_BLUR_ENABLED,
  LATEST_SCAN_STORAGE_KEY,
  type LatestScanSnapshot,
} from "../../shared/messaging";
import type { AlgorithmName } from "../../shared/types";
import { ChartPanel } from "./ChartPanel";
import { StatsPanel } from "./StatsPanel";

interface PopupStatsView {
  scannedNodes: number;
  detailLabel: string;
  totalKeywords: number;
  totalMatches: number;
  executionTimeMs: number;
  matchKinds: Array<{ label: string; value: number }>;
  keywords: Array<{
    keyword: string;
    count: number;
    kind: "Exact" | "RegEx" | "Fuzzy" | "OCR" | "Detected";
  }>;
  algorithms: Array<{
    name: string;
    matches: number;
    timeMs: number;
    comparisons: number;
    tone: "green" | "blue" | "red" | "amber" | "violet" | "cyan";
  }>;
}

const popupStats: PopupStatsView = {
  scannedNodes: 187,
  detailLabel: "node DOM",
  totalKeywords: 42,
  totalMatches: 58,
  executionTimeMs: 37.84,
  matchKinds: [
    { label: "Exact", value: 21 },
    { label: "RegEx", value: 17 },
    { label: "Fuzzy", value: 14 },
    { label: "OCR", value: 6 },
  ],
  keywords: [
    { keyword: "GACOR99", count: 12, kind: "RegEx" as const },
    { keyword: "MAXWIN", count: 10, kind: "Exact" as const },
    { keyword: "H0KI88", count: 8, kind: "Fuzzy" as const },
    { keyword: "SLOT99", count: 7, kind: "RegEx" as const },
    { keyword: "MADU308", count: 5, kind: "OCR" as const },
  ],
  algorithms: [
    { name: "KMP", matches: 13, timeMs: 4.22, comparisons: 1140, tone: "green" as const },
    { name: "Boyer Moore", matches: 8, timeMs: 3.76, comparisons: 930, tone: "blue" as const },
    { name: "RegEx", matches: 17, timeMs: 1.18, comparisons: 0, tone: "red" as const },
    {
      name: "Weighted Levenshtein",
      matches: 14,
      timeMs: 18.34,
      comparisons: 2680,
      tone: "amber" as const,
    },
    { name: "Aho-Corasick", matches: 5, timeMs: 2.57, comparisons: 720, tone: "violet" as const },
    { name: "Rabin-Karp", matches: 1, timeMs: 7.77, comparisons: 510, tone: "cyan" as const },
  ],
};

const algorithmTones: Record<
  AlgorithmName,
  "green" | "blue" | "red" | "amber" | "violet" | "cyan"
> = {
  KMP: "green",
  BoyerMoore: "blue",
  RegEx: "red",
  WeightedLevenshtein: "amber",
  AhoCorasick: "violet",
  RabinKarp: "cyan",
};

export function Popup() {
  const [blurEnabled, setBlurEnabled] = useState(DEFAULT_BLUR_ENABLED);
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [latestScan, setLatestScan] = useState<LatestScanSnapshot | null>(null);
  const activeStats = useMemo(
    () => (latestScan ? createStatsView(latestScan) : popupStats),
    [latestScan],
  );

  const kindTotal = useMemo(
    () => activeStats.matchKinds.reduce((total, item) => total + item.value, 0),
    [activeStats.matchKinds],
  );

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return;
    }

    chrome.storage.local.get(LATEST_SCAN_STORAGE_KEY, (result) => {
      const snapshot = result[LATEST_SCAN_STORAGE_KEY] as LatestScanSnapshot | undefined;
      if (snapshot) {
        setLatestScan(snapshot);
      }
    });

    chrome.storage.local.get(BLUR_SETTING_STORAGE_KEY, (result) => {
      const value = result[BLUR_SETTING_STORAGE_KEY];
      if (typeof value === "boolean") {
        setBlurEnabled(value);
      }
    });

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") {
        return;
      }

      const change = changes[LATEST_SCAN_STORAGE_KEY];
      if (change?.newValue) {
        setLatestScan(change.newValue as LatestScanSnapshot);
      }

      const blurChange = changes[BLUR_SETTING_STORAGE_KEY];
      if (typeof blurChange?.newValue === "boolean") {
        setBlurEnabled(blurChange.newValue);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  function handleBlurToggle(enabled: boolean): void {
    setBlurEnabled(enabled);

    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return;
    }

    void chrome.storage.local.set({
      [BLUR_SETTING_STORAGE_KEY]: enabled,
    });
  }

  return (
    <main className="popup">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Judol Detector</p>
          <h1>Realtime Scan</h1>
        </div>
        <span className="status-pill">
          <span aria-hidden="true" />
          Aktif
        </span>
      </header>

      <section className="summary-grid" aria-label="Ringkasan deteksi">
        <article className="summary-tile">
          <span className="tile-label">Keyword ditemukan</span>
          <strong>{activeStats.totalKeywords}</strong>
          <small>{activeStats.totalMatches} total match</small>
        </article>
        <article className="summary-tile">
          <span className="tile-label">Waktu eksekusi</span>
          <strong>{activeStats.executionTimeMs.toFixed(2)} ms</strong>
          <small>
            {activeStats.scannedNodes} {activeStats.detailLabel}
          </small>
        </article>
      </section>

      <section className="section" aria-labelledby="kind-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Hirarki</p>
            <h2 id="kind-title">Jenis matching</h2>
          </div>
          <span className="section-value">{kindTotal}</span>
        </div>

        <div className="kind-grid">
          {activeStats.matchKinds.map((item) => (
            <article className="kind-tile" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <StatsPanel algorithms={activeStats.algorithms} />
      <ChartPanel keywords={activeStats.keywords} />

      <section className="section bonus-section" aria-labelledby="bonus-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Bonus</p>
            <h2 id="bonus-title">Proteksi visual</h2>
          </div>
        </div>

        <div className="toggle-list">
          <label className="toggle-row">
            <span>
              <strong>Blur teks otomatis</strong>
              <small>Sensor elemen DOM yang terdeteksi.</small>
            </span>
            <input
              type="checkbox"
              checked={blurEnabled}
              onChange={(event) => handleBlurToggle(event.currentTarget.checked)}
            />
          </label>

          <label className="toggle-row">
            <span>
              <strong>OCR gambar</strong>
              <small>Deteksi keyword dari teks pada gambar.</small>
            </span>
            <input
              type="checkbox"
              checked={ocrEnabled}
              onChange={(event) => setOcrEnabled(event.currentTarget.checked)}
            />
          </label>
        </div>
      </section>

      <footer className="popup-footer">
        <span>Threshold fuzzy: 0.82</span>
        <span>{latestScan ? "Statistik halaman aktif" : "Menunggu scan halaman"}</span>
      </footer>
    </main>
  );
}

function createStatsView(snapshot: LatestScanSnapshot): PopupStatsView {
  const stats = snapshot.stats;
  const keywordEntries = Object.entries(stats.keywordCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  const totalExecutionTime = stats.algorithmStats.reduce(
    (total, item) => total + item.executionTimeMs,
    0,
  );

  return {
    scannedNodes: stats.totalRawMatches,
    detailLabel: "raw match",
    totalKeywords: Object.keys(stats.keywordCounts).length,
    totalMatches: stats.totalMergedMatches,
    executionTimeMs: totalExecutionTime,
    matchKinds: [
      { label: "Exact", value: stats.matchKindCounts.exact },
      { label: "RegEx", value: stats.matchKindCounts.regex },
      { label: "Fuzzy", value: stats.matchKindCounts.fuzzy },
      { label: "OCR", value: 0 },
    ],
    keywords:
      keywordEntries.length > 0
        ? keywordEntries.map(([keyword, count]) => ({
            keyword,
            count,
            kind: "Detected" as const,
          }))
        : [{ keyword: "Belum ada", count: 0, kind: "Detected" as const }],
    algorithms: stats.algorithmStats.map((item) => ({
      name: formatAlgorithmName(item.algorithm),
      matches: item.matchCount,
      timeMs: item.executionTimeMs,
      comparisons: item.comparisons,
      tone: algorithmTones[item.algorithm],
    })),
  };
}

function formatAlgorithmName(algorithm: AlgorithmName): string {
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
