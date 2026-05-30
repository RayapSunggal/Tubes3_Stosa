import { useEffect, useMemo, useState } from "react";
import {
  AHO_CORASICK_SETTING_STORAGE_KEY,
  BLUR_SETTING_STORAGE_KEY,
  DEFAULT_AHO_CORASICK_ENABLED,
  DEFAULT_BLUR_ENABLED,
  DEFAULT_OCR_ENABLED,
  DEFAULT_RABIN_KARP_ENABLED,
  GET_LATEST_SCAN_MESSAGE,
  OCR_SETTING_STORAGE_KEY,
  RABIN_KARP_SETTING_STORAGE_KEY,
  SCAN_PROGRESS_MESSAGE,
  SCAN_UPDATED_MESSAGE,
  type JudolRuntimeMessage,
  type LatestScanSnapshot,
} from "../../shared/messaging";
import type { AlgorithmName, DetectorStats, MatchKind } from "../../shared/types";
import { ChartPanel } from "./ChartPanel";
import { StatsPanel } from "./StatsPanel";

type KeywordKindLabel = "Exact" | "RegEx" | "Fuzzy" | "OCR" | "Detected";

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
    kind: KeywordKindLabel;
  }>;
  algorithms: Array<{
    name: string;
    matches: number;
    timeMs: number;
    comparisons: number;
    tone: "green" | "blue" | "red" | "amber" | "violet" | "cyan";
  }>;
}

type ScanStatus =
  | "connecting"
  | "active"
  | "scanning"
  | "waiting"
  | "unavailable";

const emptyStats: PopupStatsView = {
  scannedNodes: 0,
  detailLabel: "raw match",
  totalKeywords: 0,
  totalMatches: 0,
  executionTimeMs: 0,
  matchKinds: [
    { label: "Exact", value: 0 },
    { label: "RegEx", value: 0 },
    { label: "Fuzzy", value: 0 },
    { label: "OCR", value: 0 },
  ],
  keywords: [{ keyword: "Belum ada", count: 0, kind: "Detected" as const }],
  algorithms: [
    { name: "KMP", matches: 0, timeMs: 0, comparisons: 0, tone: "green" as const },
    { name: "Boyer Moore", matches: 0, timeMs: 0, comparisons: 0, tone: "blue" as const },
    { name: "Aho-Corasick", matches: 0, timeMs: 0, comparisons: 0, tone: "violet" as const },
    { name: "Rabin-Karp", matches: 0, timeMs: 0, comparisons: 0, tone: "cyan" as const },
    { name: "RegEx", matches: 0, timeMs: 0, comparisons: 0, tone: "red" as const },
    { name: "Weighted Levenshtein", matches: 0, timeMs: 0, comparisons: 0, tone: "amber" as const },
    { name: "OCR", matches: 0, timeMs: 0, comparisons: 0, tone: "cyan" as const },
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
const MAX_VISIBLE_KEYWORDS = 8;
const DEFAULT_VISIBLE_KEYWORDS = 5;

export function Popup() {
  const [blurEnabled, setBlurEnabled] = useState(DEFAULT_BLUR_ENABLED);
  const [ocrEnabled, setOcrEnabled] = useState(DEFAULT_OCR_ENABLED);
  const [ahoCorasickEnabled, setAhoCorasickEnabled] = useState(
    DEFAULT_AHO_CORASICK_ENABLED,
  );
  const [rabinKarpEnabled, setRabinKarpEnabled] = useState(
    DEFAULT_RABIN_KARP_ENABLED,
  );
  const [latestScan, setLatestScan] = useState<LatestScanSnapshot | null>(null);
  const [currentPageLabel, setCurrentPageLabel] = useState("Halaman aktif");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("connecting");
  const [scanClock, setScanClock] = useState(() => Date.now());
  const activeStats = useMemo(
    () => (latestScan ? createStatsView(latestScan, scanClock) : emptyStats),
    [latestScan, scanClock],
  );

  const kindTotal = useMemo(
    () => activeStats.matchKinds.reduce((total, item) => total + item.value, 0),
    [activeStats.matchKinds],
  );
  const statusLabel = getStatusLabel(scanStatus);
  const footerStatusLabel = getFooterStatusLabel(scanStatus, latestScan);

  useEffect(() => {
    if (!latestScan?.isScanning) {
      return;
    }

    const timerId = window.setInterval(() => setScanClock(Date.now()), 120);
    return () => window.clearInterval(timerId);
  }, [latestScan?.isScanning]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return;
    }

    chrome.storage.local.get(
      [
        BLUR_SETTING_STORAGE_KEY,
        OCR_SETTING_STORAGE_KEY,
        AHO_CORASICK_SETTING_STORAGE_KEY,
        RABIN_KARP_SETTING_STORAGE_KEY,
      ],
      (result) => {
        const blurValue = result[BLUR_SETTING_STORAGE_KEY];
        const ocrValue = result[OCR_SETTING_STORAGE_KEY];
        const ahoCorasickValue = result[AHO_CORASICK_SETTING_STORAGE_KEY];
        const rabinKarpValue = result[RABIN_KARP_SETTING_STORAGE_KEY];

        if (typeof blurValue === "boolean") {
          setBlurEnabled(blurValue);
        }

        if (typeof ocrValue === "boolean") {
          setOcrEnabled(ocrValue);
        }

        if (typeof ahoCorasickValue === "boolean") {
          setAhoCorasickEnabled(ahoCorasickValue);
        }

        if (typeof rabinKarpValue === "boolean") {
          setRabinKarpEnabled(rabinKarpValue);
        }
      },
    );

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") {
        return;
      }

      const blurChange = changes[BLUR_SETTING_STORAGE_KEY];
      if (typeof blurChange?.newValue === "boolean") {
        setBlurEnabled(blurChange.newValue);
      }

      const ocrChange = changes[OCR_SETTING_STORAGE_KEY];
      if (typeof ocrChange?.newValue === "boolean") {
        setOcrEnabled(ocrChange.newValue);
      }

      const ahoCorasickChange = changes[AHO_CORASICK_SETTING_STORAGE_KEY];
      if (typeof ahoCorasickChange?.newValue === "boolean") {
        setAhoCorasickEnabled(ahoCorasickChange.newValue);
      }

      const rabinKarpChange = changes[RABIN_KARP_SETTING_STORAGE_KEY];
      if (typeof rabinKarpChange?.newValue === "boolean") {
        setRabinKarpEnabled(rabinKarpChange.newValue);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.tabs?.query) {
      setScanStatus("unavailable");
      return;
    }

    let disposed = false;
    let activeTabId: number | null = null;

    const injectContentScript = (tabId: number, onInjected: () => void) => {
      if (!chrome.scripting?.executeScript) {
        setScanStatus("unavailable");
        setLatestScan(null);
        return;
      }

      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ["content.js"],
        },
        () => {
          if (disposed) {
            return;
          }

          const injectionError = chrome.runtime.lastError;
          if (injectionError) {
            setScanStatus("unavailable");
            setLatestScan(null);
            return;
          }

          window.setTimeout(onInjected, 150);
        },
      );
    };

    const requestActiveTabScan = (allowInjection = true) => {
      setScanStatus("connecting");

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (disposed) {
          return;
        }

        const activeTab = tabs[0];
        activeTabId = typeof activeTab?.id === "number" ? activeTab.id : null;
        setCurrentPageLabel(activeTab?.title ?? activeTab?.url ?? "Halaman aktif");

        const tabId = activeTabId;
        if (tabId === null || !chrome.tabs?.sendMessage || !canScanTab(activeTab)) {
          setScanStatus("unavailable");
          setLatestScan(null);
          return;
        }

        chrome.tabs.sendMessage(
          tabId,
          { type: GET_LATEST_SCAN_MESSAGE } satisfies JudolRuntimeMessage,
          (response?: { snapshot?: LatestScanSnapshot | null }) => {
            if (disposed) {
              return;
            }

            const messageError = chrome.runtime.lastError;
            if (messageError) {
              if (allowInjection) {
                injectContentScript(tabId, () => requestActiveTabScan(false));
                return;
              }

              setScanStatus("unavailable");
              setLatestScan(null);
              return;
            }

            const snapshot = response?.snapshot ?? null;
            setLatestScan(snapshot);
            setScanStatus(
              snapshot?.isScanning ? "scanning" : snapshot ? "active" : "waiting",
            );
          },
        );
      });
    };

    const handleRuntimeMessage = (
      message: JudolRuntimeMessage,
      sender: chrome.runtime.MessageSender,
    ) => {
      if (
        (message?.type !== SCAN_PROGRESS_MESSAGE &&
          message?.type !== SCAN_UPDATED_MESSAGE) ||
        sender.tab?.id !== activeTabId
      ) {
        return;
      }

      setLatestScan(message.snapshot);
      setScanStatus(message.snapshot.isScanning ? "scanning" : "active");
      setCurrentPageLabel(message.snapshot.title || message.snapshot.url);
    };

    const handleActivated = () => requestActiveTabScan();
    const handleUpdated = (
      tabId: number,
      changeInfo: { status?: string; title?: string },
    ) => {
      if (tabId === activeTabId && (changeInfo.status === "complete" || changeInfo.title)) {
        requestActiveTabScan();
      }
    };

    requestActiveTabScan();
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    chrome.tabs.onActivated?.addListener(handleActivated);
    chrome.tabs.onUpdated?.addListener(handleUpdated);

    return () => {
      disposed = true;
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      chrome.tabs.onActivated?.removeListener(handleActivated);
      chrome.tabs.onUpdated?.removeListener(handleUpdated);
    };
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

  function handleOcrToggle(enabled: boolean): void {
    setOcrEnabled(enabled);

    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return;
    }

    void chrome.storage.local.set({
      [OCR_SETTING_STORAGE_KEY]: enabled,
    });
  }

  function handleAhoCorasickToggle(enabled: boolean): void {
    setAhoCorasickEnabled(enabled);

    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return;
    }

    void chrome.storage.local.set({
      [AHO_CORASICK_SETTING_STORAGE_KEY]: enabled,
    });
  }

  function handleRabinKarpToggle(enabled: boolean): void {
    setRabinKarpEnabled(enabled);

    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return;
    }

    void chrome.storage.local.set({
      [RABIN_KARP_SETTING_STORAGE_KEY]: enabled,
    });
  }

  return (
    <main className="popup">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Judol Detector</p>
          <h1>Realtime Scan</h1>
        </div>
        <span className={`status-pill ${scanStatus}`}>
          <span aria-hidden="true" />
          {statusLabel}
        </span>
      </header>

      <section className="summary-grid" aria-label="Ringkasan deteksi">
        <article className="summary-tile">
          <span className="tile-label">Keyword unik ditemukan</span>
          <strong>{activeStats.totalKeywords}</strong>
          <small>{activeStats.totalMatches} total match terdeteksi</small>
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
          <span className="section-value">Total match: {kindTotal}</span>
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
            <p className="section-kicker">Kontrol</p>
            <h2 id="bonus-title">Fitur scan</h2>
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
              onChange={(event) => handleOcrToggle(event.currentTarget.checked)}
            />
          </label>

          <label className="toggle-row">
            <span>
              <strong>Aho-Corasick</strong>
              <small>Aktifkan matching multi-keyword.</small>
            </span>
            <input
              type="checkbox"
              checked={ahoCorasickEnabled}
              onChange={(event) =>
                handleAhoCorasickToggle(event.currentTarget.checked)
              }
            />
          </label>

          <label className="toggle-row">
            <span>
              <strong>Rabin-Karp</strong>
              <small>Aktifkan matching berbasis rolling hash.</small>
            </span>
            <input
              type="checkbox"
              checked={rabinKarpEnabled}
              onChange={(event) =>
                handleRabinKarpToggle(event.currentTarget.checked)
              }
            />
          </label>
        </div>
      </section>

      <footer className="popup-footer">
        <span title={currentPageLabel}>{trimLabel(currentPageLabel)}</span>
        <span>{footerStatusLabel}</span>
      </footer>
    </main>
  );
}

function trimLabel(label: string): string {
  return label.length > 28 ? `${label.slice(0, 25)}...` : label;
}

function canScanTab(tab: chrome.tabs.Tab | undefined): boolean {
  const url = tab?.url ?? "";
  return /^(https?|file):\/\//iu.test(url);
}

function getStatusLabel(status: ScanStatus): string {
  switch (status) {
    case "active":
      return "Aktif";
    case "scanning":
      return "Scanning";
    case "waiting":
      return "Scan";
    case "unavailable":
      return "Tidak aktif";
    default:
      return "Memuat";
  }
}

function getFooterStatusLabel(
  status: ScanStatus,
  snapshot: LatestScanSnapshot | null,
): string {
  if (status === "active" && snapshot) {
    return "Realtime";
  }

  if (status === "scanning" && snapshot?.progressLabel) {
    return snapshot.progressLabel;
  }

  switch (status) {
    case "waiting":
      return "Menunggu hasil";
    case "unavailable":
      return "Tidak bisa scan";
    default:
      return "Menghubungkan";
  }
}

function createStatsView(
  snapshot: LatestScanSnapshot,
  currentTimeMs: number,
): PopupStatsView {
  const stats = snapshot.stats;
  const ocrStats = snapshot.ocrStats;
  const keywordCounts = mergeKeywordCounts(
    stats.keywordCounts,
    ocrStats?.keywordCounts ?? {},
  );
  const keywordEntries = createKeywordRows(
    Object.entries(keywordCounts)
    .sort((left, right) => right[1] - left[1])
      .filter((item) => item[1] > 0),
    stats,
    ocrStats?.keywordCounts ?? {},
  );
  const measuredExecutionTime = stats.algorithmStats.reduce(
    (total, item) => total + item.executionTimeMs,
    0,
  ) + (ocrStats?.executionTimeMs ?? 0);
  const liveExecutionTime =
    snapshot.isScanning && typeof snapshot.scanStartedAt === "number"
      ? Math.max(0, currentTimeMs - snapshot.scanStartedAt)
      : 0;
  const totalExecutionTime = snapshot.isScanning
    ? Math.max(measuredExecutionTime, liveExecutionTime)
    : measuredExecutionTime;
  const ocrMatchCount = ocrStats?.matchCount ?? 0;

  return {
    scannedNodes: stats.totalRawMatches + (ocrStats?.candidateImageCount ?? 0),
    detailLabel: ocrStats ? "raw match + gambar" : "raw match",
    totalKeywords: Object.keys(keywordCounts).length,
    totalMatches: stats.totalMergedMatches + ocrMatchCount,
    executionTimeMs: totalExecutionTime,
    matchKinds: [
      { label: "Exact", value: stats.matchKindCounts.exact },
      { label: "RegEx", value: stats.matchKindCounts.regex },
      { label: "Fuzzy", value: stats.matchKindCounts.fuzzy },
      { label: "OCR", value: ocrMatchCount },
    ],
    keywords:
      keywordEntries.length > 0
        ? keywordEntries
        : [{ keyword: "Belum ada", count: 0, kind: "Detected" as const }],
    algorithms: [
      ...stats.algorithmStats.map((item) => ({
        name: formatAlgorithmName(item.algorithm),
        matches: item.matchCount,
        timeMs: item.executionTimeMs,
        comparisons: item.comparisons,
        tone: algorithmTones[item.algorithm],
      })),
      {
        name: "OCR",
        matches: ocrMatchCount,
        timeMs: ocrStats?.executionTimeMs ?? 0,
        comparisons: ocrStats?.comparisons ?? 0,
        tone: "cyan" as const,
      },
    ],
  };
}

function createKeywordRows(
  sortedEntries: Array<[string, number]>,
  stats: DetectorStats,
  ocrKeywordCounts: Record<string, number>,
): PopupStatsView["keywords"] {
  const rows: PopupStatsView["keywords"] = [];
  const kindCounts = getKeywordKindCounts(stats);

  for (let i = 0; i < sortedEntries.length && rows.length < DEFAULT_VISIBLE_KEYWORDS; i++) {
    appendKeywordRow(rows, sortedEntries[i], kindCounts, ocrKeywordCounts);
  }

  appendRowsForKind(rows, sortedEntries, kindCounts, ocrKeywordCounts, "fuzzy");
  appendRowsForKind(rows, sortedEntries, kindCounts, ocrKeywordCounts, "regex");
  appendOcrRows(rows, sortedEntries, kindCounts, ocrKeywordCounts);

  return rows;
}

function appendRowsForKind(
  rows: PopupStatsView["keywords"],
  sortedEntries: Array<[string, number]>,
  kindCounts: Record<MatchKind, Record<string, number>>,
  ocrKeywordCounts: Record<string, number>,
  kind: MatchKind,
): void {
  for (const entry of sortedEntries) {
    if (rows.length >= MAX_VISIBLE_KEYWORDS) {
      return;
    }

    const keyword = entry[0];
    if ((kindCounts[kind][keyword] ?? 0) > 0) {
      appendKeywordRow(rows, entry, kindCounts, ocrKeywordCounts);
    }
  }
}

function appendOcrRows(
  rows: PopupStatsView["keywords"],
  sortedEntries: Array<[string, number]>,
  kindCounts: Record<MatchKind, Record<string, number>>,
  ocrKeywordCounts: Record<string, number>,
): void {
  for (const entry of sortedEntries) {
    if (rows.length >= MAX_VISIBLE_KEYWORDS) {
      return;
    }

    const keyword = entry[0];
    if ((ocrKeywordCounts[keyword] ?? 0) > 0 && !hasDomKeywordKind(kindCounts, keyword)) {
      appendKeywordRow(rows, entry, kindCounts, ocrKeywordCounts);
    }
  }
}

function appendKeywordRow(
  rows: PopupStatsView["keywords"],
  entry: [string, number],
  kindCounts: Record<MatchKind, Record<string, number>>,
  ocrKeywordCounts: Record<string, number>,
): void {
  const [keyword, count] = entry;
  if (hasKeywordRow(rows, keyword)) {
    return;
  }

  rows.push({
    keyword,
    count,
    kind: getKeywordKind(keyword, kindCounts, ocrKeywordCounts),
  });
}

function getKeywordKind(
  keyword: string,
  kindCounts: Record<MatchKind, Record<string, number>>,
  ocrKeywordCounts: Record<string, number>,
): KeywordKindLabel {
  if ((kindCounts.fuzzy[keyword] ?? 0) > 0) {
    return "Fuzzy";
  }

  if ((kindCounts.regex[keyword] ?? 0) > 0) {
    return "RegEx";
  }

  if ((ocrKeywordCounts[keyword] ?? 0) > 0 && !hasDomKeywordKind(kindCounts, keyword)) {
    return "OCR";
  }

  if ((kindCounts.exact[keyword] ?? 0) > 0) {
    return "Exact";
  }

  return "Detected";
}

function hasDomKeywordKind(
  kindCounts: Record<MatchKind, Record<string, number>>,
  keyword: string,
): boolean {
  return (
    (kindCounts.exact[keyword] ?? 0) > 0 ||
    (kindCounts.regex[keyword] ?? 0) > 0 ||
    (kindCounts.fuzzy[keyword] ?? 0) > 0
  );
}

function hasKeywordRow(rows: PopupStatsView["keywords"], keyword: string): boolean {
  for (const row of rows) {
    if (row.keyword === keyword) {
      return true;
    }
  }

  return false;
}

function getKeywordKindCounts(
  stats: DetectorStats,
): Record<MatchKind, Record<string, number>> {
  return stats.keywordKindCounts ?? {
    exact: {},
    regex: {},
    fuzzy: {},
  };
}

function mergeKeywordCounts(
  primary: Record<string, number>,
  secondary: Record<string, number>,
): Record<string, number> {
  const merged = { ...primary };

  for (const [keyword, count] of Object.entries(secondary)) {
    merged[keyword] = (merged[keyword] ?? 0) + count;
  }

  return merged;
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
