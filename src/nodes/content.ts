import { clearHighlights, highlightDetectorMatches } from "../content/highlighter";
import { applyBlurToHighlights, clearBlurState } from "../content/blur";
import { scanDocumentText } from "../content/domScanner";
import { clearOcrState, scanImagesWithOcr } from "../content/ocrScanner";
import { setupJudolTooltip } from "../content/tooltip";
import { runFullDetectorProgressively } from "../detector/fullDetector";
import {
  AHO_CORASICK_SETTING_STORAGE_KEY,
  BLUR_SETTING_STORAGE_KEY,
  DEFAULT_AHO_CORASICK_ENABLED,
  DEFAULT_BLUR_ENABLED,
  DEFAULT_OCR_ENABLED,
  DEFAULT_RABIN_KARP_ENABLED,
  GET_LATEST_SCAN_MESSAGE,
  LATEST_SCAN_STORAGE_KEY,
  OCR_SETTING_STORAGE_KEY,
  RABIN_KARP_SETTING_STORAGE_KEY,
  SCAN_PROGRESS_MESSAGE,
  SCAN_UPDATED_MESSAGE,
  type JudolRuntimeMessage,
  type LatestScanSnapshot,
  type OcrStats,
} from "../shared/messaging";
import type {
  AlgorithmName,
  DetectorInput,
  DetectorOutput,
  DetectorStats,
} from "../shared/types";

const DEFAULT_OPTIONS = {
  enableKMP: true,
  enableBoyerMoore: true,
  enableRegex: true,
  enableFuzzy: true,
  enableAhoCorasick: true,
  enableRabinKarp: true,
  fuzzyThreshold: 0.82,
  normalizeText: true,
};
const ALGORITHM_ORDER: AlgorithmName[] = [
  "KMP",
  "BoyerMoore",
  "AhoCorasick",
  "RabinKarp",
  "RegEx",
  "WeightedLevenshtein",
];

let keywordsPromise: Promise<string[]> | null = null;
let observer: MutationObserver | null = null;
let scanTimeoutId: number | undefined;
let blurEnabled = DEFAULT_BLUR_ENABLED;
let ocrEnabled = DEFAULT_OCR_ENABLED;
let ahoCorasickEnabled = DEFAULT_AHO_CORASICK_ENABLED;
let rabinKarpEnabled = DEFAULT_RABIN_KARP_ENABLED;
let latestScanSnapshot: LatestScanSnapshot | null = null;
let isScanRunning = false;
let rescanRequested = false;
let extensionContextActive = true;
let contextInvalidationReported = false;
let runtimeMessageListener:
  | ((
      message: JudolRuntimeMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: { snapshot: LatestScanSnapshot | null }) => void,
    ) => boolean)
  | null = null;
let storageChangeListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;
let loadListener: (() => void) | null = null;
let imageLoadListener: ((event: Event) => void) | null = null;

const runtimeWindow = window as Window & {
  __judolDetectorContentCleanup?: () => void;
};

try {
  runtimeWindow.__judolDetectorContentCleanup?.();
}
catch {
}

runtimeWindow.__judolDetectorContentCleanup = deactivateContentScript;
void bootstrapContentScript();

async function bootstrapContentScript(): Promise<void> {
  try {
    if (!isExtensionContextAvailable()) {
      return;
    }

    await waitForBody();
    [
      blurEnabled,
      ocrEnabled,
      ahoCorasickEnabled,
      rabinKarpEnabled,
    ] = await Promise.all([
      loadBooleanSetting(BLUR_SETTING_STORAGE_KEY, DEFAULT_BLUR_ENABLED),
      loadBooleanSetting(OCR_SETTING_STORAGE_KEY, DEFAULT_OCR_ENABLED),
      loadBooleanSetting(
        AHO_CORASICK_SETTING_STORAGE_KEY,
        DEFAULT_AHO_CORASICK_ENABLED,
      ),
      loadBooleanSetting(
        RABIN_KARP_SETTING_STORAGE_KEY,
        DEFAULT_RABIN_KARP_ENABLED,
      ),
    ]);
    watchStoredSettings();
    setupRuntimeMessaging();
    setupJudolTooltip();
    setupImageLoadRescan();
    loadListener = () => scheduleScan(500);
    window.addEventListener("load", loadListener, { once: true });
    startObserver();
    scheduleScan(50);
  } catch (error) {
    if (!handleExtensionContextError(error)) {
      console.error("[Judol Detector] bootstrap failed", error);
    }
  }
}

function waitForBody(): Promise<void> {
  if (document.body) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

function startObserver(): void {
  if (!document.body || !isExtensionContextAvailable()) {
    return;
  }

  observer?.disconnect();
  observer = new MutationObserver(() => scheduleScan(350));
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function setupImageLoadRescan(): void {
  if (imageLoadListener) {
    return;
  }

  imageLoadListener = (event) => {
    if (event.target instanceof HTMLImageElement) {
      scheduleScan(200);
    }
  };

  document.addEventListener("load", imageLoadListener, true);
}

function scheduleScan(delayMs: number): void {
  if (!isExtensionContextAvailable()) {
    return;
  }

  if (isScanRunning) {
    rescanRequested = true;
    return;
  }

  window.clearTimeout(scanTimeoutId);
  scanTimeoutId = window.setTimeout(() => {
    void scanAndHighlight();
  }, delayMs);
}

async function scanAndHighlight(): Promise<void> {
  if (!document.body || !isExtensionContextAvailable()) {
    return;
  }

  if (isScanRunning) {
    rescanRequested = true;
    return;
  }

  isScanRunning = true;
  const scanStartedAt = Date.now();
  let detectorOutput: DetectorOutput | null = null;
  let ocrStats = createEmptyOcrStats();
  let observerRestarted = false;
  observer?.disconnect();

  try {
    clearBlurState();
    clearOcrState();
    clearHighlights();
    publishScanProgress(
      createEmptyDetectorStats(),
      ocrStats,
      scanStartedAt,
      "Menyiapkan scan",
    );

    const [keywords, scan] = await Promise.all([
      loadKeywords(),
      Promise.resolve(scanDocumentText(document.body)),
    ]);
    publishScanProgress(
      createEmptyDetectorStats(),
      ocrStats,
      scanStartedAt,
      "Memindai DOM",
    );

    const detectorOptions = createDetectorOptions();
    const input: DetectorInput = {
      text: scan.text,
      keywords,
      options: detectorOptions,
    };

    detectorOutput = await runFullDetectorProgressively(
      input,
      async (progressOutput, algorithm) => {
        detectorOutput = progressOutput;
        publishScanProgress(
          progressOutput.stats,
          ocrStats,
          scanStartedAt,
          `Memproses ${formatAlgorithmName(algorithm)}`,
        );
        await waitForProgressPaint();
      },
    );
    publishScanProgress(
      detectorOutput.stats,
      ocrStats,
      scanStartedAt,
      "Menyorot hasil DOM",
    );
    const highlightedCount = highlightDetectorMatches(scan, detectorOutput);
    startObserver();
    observerRestarted = true;

    const ocrOutput = ocrEnabled
      ? await scanImagesWithOcr(
          document.body,
          keywords,
          detectorOptions,
          (progressStats) => {
            ocrStats = progressStats;
            applyBlurToHighlights(blurEnabled);
            publishScanProgress(
              detectorOutput?.stats ?? createEmptyDetectorStats(),
              ocrStats,
              scanStartedAt,
              "Memindai gambar OCR",
            );
          },
        )
      : { stats: createEmptyOcrStats() };

    ocrStats = ocrOutput.stats;
    applyBlurToHighlights(blurEnabled);
    storeLatestScan(detectorOutput, ocrStats, scanStartedAt);

    console.info("[Judol Detector] scan complete", {
      detectorMatches: detectorOutput.matches.length,
      highlightedCount,
      ocrMatches: ocrOutput.stats.matchCount,
    });
  } catch (error) {
    if (!handleExtensionContextError(error)) {
      console.error("[Judol Detector] scan failed", error);
    }
  } finally {
    if (extensionContextActive && !observerRestarted) {
      startObserver();
    }

    isScanRunning = false;
    if (extensionContextActive && rescanRequested) {
      rescanRequested = false;
      scheduleScan(100);
    }
  }
}

function loadBooleanSetting(key: string, fallback: boolean): Promise<boolean> {
  if (!isExtensionContextAvailable() || !chrome.storage?.local) {
    return Promise.resolve(fallback);
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      const value = result[key];
      resolve(typeof value === "boolean" ? value : fallback);
    });
  });
}

function watchStoredSettings(): void {
  if (!isExtensionContextAvailable() || !chrome.storage?.onChanged) {
    return;
  }

  storageChangeListener = (changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    const blurChange = changes[BLUR_SETTING_STORAGE_KEY];
    if (typeof blurChange?.newValue === "boolean") {
      blurEnabled = blurChange.newValue;
      applyBlurToHighlights(blurEnabled);
    }

    const ocrChange = changes[OCR_SETTING_STORAGE_KEY];
    if (typeof ocrChange?.newValue === "boolean") {
      ocrEnabled = ocrChange.newValue;
      scheduleScan(100);
    }

    const ahoCorasickChange = changes[AHO_CORASICK_SETTING_STORAGE_KEY];
    if (typeof ahoCorasickChange?.newValue === "boolean") {
      ahoCorasickEnabled = ahoCorasickChange.newValue;
      scheduleScan(100);
    }

    const rabinKarpChange = changes[RABIN_KARP_SETTING_STORAGE_KEY];
    if (typeof rabinKarpChange?.newValue === "boolean") {
      rabinKarpEnabled = rabinKarpChange.newValue;
      scheduleScan(100);
    }
  };

  try {
    chrome.storage.onChanged.addListener(storageChangeListener);
  } catch (error) {
    handleExtensionContextError(error);
  }
}

function createDetectorOptions(): DetectorInput["options"] {
  return {
    ...DEFAULT_OPTIONS,
    enableAhoCorasick: ahoCorasickEnabled,
    enableRabinKarp: rabinKarpEnabled,
  };
}

function setupRuntimeMessaging(): void {
  if (!isExtensionContextAvailable()) {
    return;
  }

  runtimeMessageListener = (message: JudolRuntimeMessage, _sender, sendResponse) => {
    if (message?.type !== GET_LATEST_SCAN_MESSAGE) {
      return false;
    }

    sendResponse({ snapshot: latestScanSnapshot });
    return false;
  };

  try {
    chrome.runtime.onMessage.addListener(runtimeMessageListener);
  } catch (error) {
    handleExtensionContextError(error);
  }
}

function publishScanProgress(
  stats: DetectorStats,
  ocrStats: OcrStats,
  scanStartedAt: number,
  progressLabel: string,
): void {
  if (!isExtensionContextAvailable()) {
    return;
  }

  const snapshot = createScanSnapshot(stats, ocrStats, {
    isScanning: true,
    scanStartedAt,
    progressLabel,
  });
  latestScanSnapshot = snapshot;
  sendScanMessage(SCAN_PROGRESS_MESSAGE, snapshot);
}

function storeLatestScan(
  output: DetectorOutput,
  ocrStats: OcrStats,
  scanStartedAt: number,
): void {
  if (!isExtensionContextAvailable()) {
    return;
  }

  const snapshot = createScanSnapshot(output.stats, ocrStats, {
    isScanning: false,
    scanStartedAt,
    progressLabel: "Scan selesai",
  });

  latestScanSnapshot = snapshot;

  try {
    if (chrome.storage?.local) {
      void chrome.storage.local.set({
        [LATEST_SCAN_STORAGE_KEY]: snapshot,
      });
    }

    sendScanMessage(SCAN_UPDATED_MESSAGE, snapshot);
  } catch (error) {
    handleExtensionContextError(error);
  }
}

function createScanSnapshot(
  stats: DetectorStats,
  ocrStats: OcrStats,
  progress: Pick<
    LatestScanSnapshot,
    "isScanning" | "scanStartedAt" | "progressLabel"
  >,
): LatestScanSnapshot {
  return {
    url: window.location.href,
    title: document.title,
    scannedAt: Date.now(),
    stats,
    ocrStats,
    ...progress,
  };
}

function sendScanMessage(
  type: typeof SCAN_PROGRESS_MESSAGE | typeof SCAN_UPDATED_MESSAGE,
  snapshot: LatestScanSnapshot,
): void {
  try {
    chrome.runtime.sendMessage(
      {
        type,
        snapshot,
      } satisfies JudolRuntimeMessage,
      () => {
        void chrome.runtime.lastError;
      },
    );
  } catch (error) {
    handleExtensionContextError(error);
  }
}

function createEmptyDetectorStats(): DetectorStats {
  return {
    totalRawMatches: 0,
    totalMergedMatches: 0,
    keywordCounts: {},
    matchKindCounts: {
      exact: 0,
      regex: 0,
      fuzzy: 0,
    },
    algorithmStats: ALGORITHM_ORDER.map((algorithm) => ({
      algorithm,
      matchCount: 0,
      executionTimeMs: 0,
      comparisons: 0,
    })),
  };
}

function waitForProgressPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
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

function createEmptyOcrStats(): OcrStats {
  return {
    candidateImageCount: 0,
    analyzedImageCount: 0,
    matchedImageCount: 0,
    matchCount: 0,
    keywordCounts: {},
    executionTimeMs: 0,
    errorCount: 0,
  };
}

function loadKeywords(): Promise<string[]> {
  if (keywordsPromise) {
    return keywordsPromise;
  }

  if (!isExtensionContextAvailable()) {
    return Promise.reject(new Error("Extension context invalidated"));
  }

  const keywordUrl = chrome.runtime.getURL("keyword.txt");
  keywordsPromise = fetch(keywordUrl)
    .then((response) => response.text())
    .then((text) =>
      text
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );

  return keywordsPromise;
}

function isExtensionContextAvailable(): boolean {
  if (!extensionContextActive) {
    return false;
  }

  try {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      deactivateContentScript();
      return false;
    }
  } catch (error) {
    handleExtensionContextError(error);
    return false;
  }

  return true;
}

function handleExtensionContextError(error: unknown): boolean {
  if (!isExtensionContextError(error)) {
    return false;
  }

  if (!contextInvalidationReported) {
    contextInvalidationReported = true;
    console.warn(
      "[Judol Detector] extension context invalidated. Reload this tab after reloading the extension.",
    );
  }

  deactivateContentScript();
  return true;
}

function isExtensionContextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /extension context invalidated|context invalidated/iu.test(message);
}

function deactivateContentScript(): void {
  extensionContextActive = false;
  window.clearTimeout(scanTimeoutId);
  observer?.disconnect();
  observer = null;
  rescanRequested = false;

  if (loadListener) {
    window.removeEventListener("load", loadListener);
    loadListener = null;
  }

  if (imageLoadListener) {
    document.removeEventListener("load", imageLoadListener, true);
    imageLoadListener = null;
  }

  try {
    if (runtimeMessageListener && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.removeListener(runtimeMessageListener);
    }
  } catch {
  }
  runtimeMessageListener = null;

  try {
    if (storageChangeListener && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(storageChangeListener);
    }
  } catch {
  }
  storageChangeListener = null;

  if (runtimeWindow.__judolDetectorContentCleanup === deactivateContentScript) {
    delete runtimeWindow.__judolDetectorContentCleanup;
  }
}
