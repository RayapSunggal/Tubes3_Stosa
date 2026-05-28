import { clearHighlights, highlightDetectorMatches } from "../content/highlighter";
import { scanDocumentText } from "../content/domScanner";
import { setupJudolTooltip } from "../content/tooltip";
import { runFullDetector } from "../detector/fullDetector";
import type {
  DetectorInput,
  DetectorOutput,
  MergedMatch,
  RawMatch,
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

let keywordsPromise: Promise<string[]> | null = null;
let observer: MutationObserver | null = null;
let scanTimeoutId: number | undefined;

void bootstrapContentScript();

async function bootstrapContentScript(): Promise<void> {
  await waitForBody();
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
    const output =
      detectorOutput.matches.length > 0 ? detectorOutput : buildPreviewOutput(input);
    const highlightedCount = highlightDetectorMatches(scan, output);

    console.info("[Judol Detector] scan complete", {
      detectorMatches: detectorOutput.matches.length,
      highlightedCount,
      previewMode: detectorOutput.matches.length === 0,
    });
  } catch (error) {
    console.error("[Judol Detector] scan failed", error);
  } finally {
    startObserver();
  }
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

// Temporary bridge so the highlighter can be tested before fullDetector is implemented.
function buildPreviewOutput(input: DetectorInput): DetectorOutput {
  const startedAt = performance.now();
  const rawMatches: RawMatch[] = [];

  collectKeywordPreviewMatches(input, rawMatches);
  collectNumberSuffixPreviewMatches(input.text, rawMatches);

  const matches = rawMatches
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .reduce<MergedMatch[]>((accepted, item) => {
      const previous = accepted[accepted.length - 1];
      if (previous && item.start < previous.end) {
        return accepted;
      }

      accepted.push({
        matchedText: item.matchedText,
        start: item.start,
        end: item.end,
        contributions: [
          {
            algorithm: item.algorithm,
            keyword: item.keyword,
            matchedText: item.matchedText,
          },
        ],
        keywords: [item.keyword],
        algorithms: [item.algorithm],
        matchKinds: [item.isPatternMatch ? "regex" : "exact"],
      });
      return accepted;
    }, []);

  const keywordCounts = matches.reduce<Record<string, number>>((counts, match) => {
    for (const keyword of match.keywords) {
      counts[keyword] = (counts[keyword] ?? 0) + 1;
    }

    return counts;
  }, {});

  return {
    rawMatches,
    matches,
    stats: {
      totalRawMatches: rawMatches.length,
      totalMergedMatches: matches.length,
      keywordCounts,
      algorithmStats: [
        {
          algorithm: "RegEx",
          matchCount: matches.length,
          executionTimeMs: performance.now() - startedAt,
          comparisons: 0,
        },
      ],
    },
  };
}

function collectKeywordPreviewMatches(input: DetectorInput, rawMatches: RawMatch[]): void {
  const keywords = [...input.keywords].sort((left, right) => right.length - left.length);

  for (const keyword of keywords) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_])(${escapeRegExp(keyword)})(?=$|[^\\p{L}\\p{N}_])`,
      "giu",
    );

    for (const match of input.text.matchAll(pattern)) {
      const prefix = match[1] ?? "";
      const matchedText = match[2] ?? "";
      const start = (match.index ?? 0) + prefix.length;

      rawMatches.push({
        keyword,
        matchedText,
        algorithm: "RegEx",
        start,
        end: start + matchedText.length,
      });
    }
  }
}

function collectNumberSuffixPreviewMatches(text: string, rawMatches: RawMatch[]): void {
  const pattern =
    /(^|[^\p{L}\p{N}_])([\p{L}][\p{L}\p{M}0-9]{2,}\d{2,3})(?=$|[^\p{L}\p{N}_])/giu;

  for (const match of text.matchAll(pattern)) {
    const prefix = match[1] ?? "";
    const matchedText = match[2] ?? "";
    const start = (match.index ?? 0) + prefix.length;

    rawMatches.push({
      keyword: matchedText,
      matchedText,
      algorithm: "RegEx",
      start,
      end: start + matchedText.length,
      isPatternMatch: true,
    });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
