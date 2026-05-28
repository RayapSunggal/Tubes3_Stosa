import { clearHighlights, highlightDetectorMatches } from "../content/highlighter";
import { applyBlurToHighlights, clearBlurState } from "../content/blur";
import { scanDocumentText } from "../content/domScanner";
import { clearOcrState, scanImagesWithOcr } from "../content/ocrScanner";
import { setupJudolTooltip } from "../content/tooltip";
import { runFullDetector } from "../detector/fullDetector";
import {
  BLUR_SETTING_STORAGE_KEY,
  DEFAULT_BLUR_ENABLED,
  DEFAULT_OCR_ENABLED,
  GET_LATEST_SCAN_MESSAGE,
  LATEST_SCAN_STORAGE_KEY,
  OCR_SETTING_STORAGE_KEY,
  SCAN_UPDATED_MESSAGE,
  type JudolRuntimeMessage,
  type LatestScanSnapshot,
  type OcrStats,
} from "../shared/messaging";
import type { DetectorInput, DetectorOutput } from "../shared/types";

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

let keywordsPromise: Promise<string[]> | null = null;
let observer: MutationObserver | null = null;
let scanTimeoutId: number | undefined;
let blurEnabled = DEFAULT_BLUR_ENABLED;
let ocrEnabled = DEFAULT_OCR_ENABLED;
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
    [blurEnabled, ocrEnabled] = await Promise.all([
      loadBooleanSetting(BLUR_SETTING_STORAGE_KEY, DEFAULT_BLUR_ENABLED),
      loadBooleanSetting(OCR_SETTING_STORAGE_KEY, DEFAULT_OCR_ENABLED),
    ]);
    watchStoredSettings();
    setupRuntimeMessaging();
    setupJudolTooltip();
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
  let observerRestarted = false;
  observer?.disconnect();

  try {
    clearBlurState();
    clearOcrState();
    clearHighlights();

    const [keywords, scan] = await Promise.all([
      loadKeywords(),
      Promise.resolve(scanDocumentText(document.body)),
    ]);

    const input: DetectorInput = {
      text: scan.text,
      keywords,
      options: DEFAULT_OPTIONS,
    };

    const detectorOutput = runFullDetector(input);
    const highlightedCount = highlightDetectorMatches(scan, detectorOutput);
    startObserver();
    observerRestarted = true;

    const ocrOutput = ocrEnabled
      ? await scanImagesWithOcr(document.body, keywords, DEFAULT_OPTIONS)
      : { stats: createEmptyOcrStats() };

    applyBlurToHighlights(blurEnabled);
    storeLatestScan(detectorOutput, ocrOutput.stats);

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

    const change = changes[BLUR_SETTING_STORAGE_KEY];
    if (!change || typeof change.newValue !== "boolean") {
      const ocrChange = changes[OCR_SETTING_STORAGE_KEY];
      if (ocrChange && typeof ocrChange.newValue === "boolean") {
        ocrEnabled = ocrChange.newValue;
        scheduleScan(100);
      }

      return;
    }

    blurEnabled = change.newValue;
    applyBlurToHighlights(blurEnabled);

    const ocrChange = changes[OCR_SETTING_STORAGE_KEY];
    if (ocrChange && typeof ocrChange.newValue === "boolean") {
      ocrEnabled = ocrChange.newValue;
      scheduleScan(100);
    }
  };

  try {
    chrome.storage.onChanged.addListener(storageChangeListener);
  } catch (error) {
    handleExtensionContextError(error);
  }
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

function storeLatestScan(output: DetectorOutput, ocrStats: OcrStats): void {
  if (!isExtensionContextAvailable()) {
    return;
  }

  const snapshot: LatestScanSnapshot = {
    url: window.location.href,
    title: document.title,
    scannedAt: Date.now(),
    stats: output.stats,
    ocrStats,
  };

  latestScanSnapshot = snapshot;

  try {
    if (chrome.storage?.local) {
      void chrome.storage.local.set({
        [LATEST_SCAN_STORAGE_KEY]: snapshot,
      });
    }

    chrome.runtime.sendMessage(
      {
        type: SCAN_UPDATED_MESSAGE,
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
