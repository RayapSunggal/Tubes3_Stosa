import { clearHighlights, highlightDetectorMatches } from "../content/highlighter";
import { applyBlurToHighlights, clearBlurState } from "../content/blur";
import { scanDocumentText } from "../content/domScanner";
import { setupJudolTooltip } from "../content/tooltip";
import { runFullDetector } from "../detector/fullDetector";
import {
  BLUR_SETTING_STORAGE_KEY,
  DEFAULT_BLUR_ENABLED,
  LATEST_SCAN_STORAGE_KEY,
  type LatestScanSnapshot,
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

void bootstrapContentScript();

async function bootstrapContentScript(): Promise<void> {
  await waitForBody();
  blurEnabled = await loadBlurSetting();
  watchBlurSetting();
  setupJudolTooltip();
  startObserver();
  scheduleScan(50);
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
  if (!document.body) {
    return;
  }

  observer = new MutationObserver(() => scheduleScan(350));
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function scheduleScan(delayMs: number): void {
  window.clearTimeout(scanTimeoutId);
  scanTimeoutId = window.setTimeout(() => {
    void scanAndHighlight();
  }, delayMs);
}

async function scanAndHighlight(): Promise<void> {
  if (!document.body) {
    return;
  }

  observer?.disconnect();

  try {
    clearBlurState();
    clearHighlights();

    const [keywords, scan] = await Promise.all([
      loadKeywords(),
      Promise.resolve(scanDocumentText(document.body)),
    ]);

    if (scan.text.trim().length === 0) {
      return;
    }

    const input: DetectorInput = {
      text: scan.text,
      keywords,
      options: DEFAULT_OPTIONS,
    };

    const detectorOutput = runFullDetector(input);
    const highlightedCount = highlightDetectorMatches(scan, detectorOutput);
    applyBlurToHighlights(blurEnabled);
    storeLatestScan(detectorOutput);

    console.info("[Judol Detector] scan complete", {
      detectorMatches: detectorOutput.matches.length,
      highlightedCount,
    });
  } catch (error) {
    console.error("[Judol Detector] scan failed", error);
  } finally {
    startObserver();
  }
}

function loadBlurSetting(): Promise<boolean> {
  if (!chrome.storage?.local) {
    return Promise.resolve(DEFAULT_BLUR_ENABLED);
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(BLUR_SETTING_STORAGE_KEY, (result) => {
      const value = result[BLUR_SETTING_STORAGE_KEY];
      resolve(typeof value === "boolean" ? value : DEFAULT_BLUR_ENABLED);
    });
  });
}

function watchBlurSetting(): void {
  if (!chrome.storage?.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    const change = changes[BLUR_SETTING_STORAGE_KEY];
    if (!change || typeof change.newValue !== "boolean") {
      return;
    }

    blurEnabled = change.newValue;
    applyBlurToHighlights(blurEnabled);
  });
}

function storeLatestScan(output: DetectorOutput): void {
  if (!chrome.storage?.local) {
    return;
  }

  const snapshot: LatestScanSnapshot = {
    url: window.location.href,
    title: document.title,
    scannedAt: Date.now(),
    stats: output.stats,
  };

  void chrome.storage.local.set({
    [LATEST_SCAN_STORAGE_KEY]: snapshot,
  });
}

function loadKeywords(): Promise<string[]> {
  if (keywordsPromise) {
    return keywordsPromise;
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
