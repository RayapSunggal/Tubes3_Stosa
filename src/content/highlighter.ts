import type { DetectorOutput, MergedMatch } from "../shared/types";
import type { DomScanResult, TextSegment } from "./domScanner";
import { attachTooltipData } from "./tooltip";

interface HighlightSegment {
  match: MergedMatch;
  textSegment: TextSegment;
  localStart: number;
  localEnd: number;
}

export function highlightDetectorMatches(
  scan: DomScanResult,
  output: DetectorOutput,
): number {
  injectHighlightStyle();

  const matches = removeOverlappingMatches(output.matches);
  const segments = createHighlightSegments(scan, matches);

  segments.sort((left, right) => {
    if (left.textSegment.start !== right.textSegment.start) {
      return right.textSegment.start - left.textSegment.start;
    }

    return right.localStart - left.localStart;
  });

  let highlightedCount = 0;

  for (const segment of segments) {
    const span = wrapTextSegment(segment);
    if (!span) {
      continue;
    }

    const algorithms = segment.match.algorithms;
    const keyword = segment.match.keywords.join(", ");
    const executionTimeMs = output.stats.algorithmStats
      .filter((item) => algorithms.some((algorithm) => algorithm === item.algorithm))
      .reduce((total, item) => total + item.executionTimeMs, 0);
    const count = segment.match.keywords.reduce(
      (total, item) => total + (output.stats.keywordCounts[item] ?? 1),
      0,
    );

    attachTooltipData(span, {
      keyword,
      algorithm: algorithms.join(", "),
      count,
      executionTimeMs,
      matchedText: segment.match.matchedText,
    });

    highlightedCount += 1;
  }

  return highlightedCount;
}

export function clearHighlights(root: ParentNode = document): void {
  const highlights = Array.from(
    root.querySelectorAll<HTMLElement>("[data-judol-highlight='true']"),
  );

  for (const highlight of highlights) {
    const parent = highlight.parentNode;
    if (!parent) {
      continue;
    }

    while (highlight.firstChild) {
      parent.insertBefore(highlight.firstChild, highlight);
    }

    parent.removeChild(highlight);
    parent.normalize();
  }
}

function removeOverlappingMatches(matches: MergedMatch[]): MergedMatch[] {
  const sorted = [...matches]
    .filter((match) => match.end > match.start)
    .sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start;
      }

      return right.end - left.end;
    });

  const accepted: MergedMatch[] = [];
  let lastEnd = -1;

  for (const match of sorted) {
    if (match.start < lastEnd) {
      continue;
    }

    accepted.push(match);
    lastEnd = match.end;
  }

  return accepted;
}

function createHighlightSegments(
  scan: DomScanResult,
  matches: MergedMatch[],
): HighlightSegment[] {
  const segments: HighlightSegment[] = [];

  for (const match of matches) {
    for (const textSegment of scan.segments) {
      if (textSegment.end <= match.start || textSegment.start >= match.end) {
        continue;
      }

      const localStart = Math.max(match.start, textSegment.start) - textSegment.start;
      const localEnd = Math.min(match.end, textSegment.end) - textSegment.start;

      if (localEnd > localStart) {
        segments.push({ match, textSegment, localStart, localEnd });
      }
    }
  }

  return segments;
}

function wrapTextSegment(segment: HighlightSegment): HTMLElement | null {
  const node = segment.textSegment.node;

  if (!node.isConnected || segment.localEnd > node.length) {
    return null;
  }

  const range = document.createRange();
  range.setStart(node, segment.localStart);
  range.setEnd(node, segment.localEnd);

  const span = document.createElement("span");
  span.className = "judol-detector-highlight";
  span.dataset.judolHighlight = "true";
  span.tabIndex = 0;

  try {
    range.surroundContents(span);
    return span;
  } catch {
    range.detach();
    return null;
  }
}

function injectHighlightStyle(): void {
  if (document.getElementById("judol-detector-highlight-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "judol-detector-highlight-style";
  style.textContent = `
    .judol-detector-highlight {
      border-radius: 3px;
      background: rgba(255, 204, 51, 0.5);
      box-shadow: 0 0 0 1px rgba(214, 79, 69, 0.42);
      color: inherit;
      cursor: help;
      text-decoration: underline;
      text-decoration-color: rgba(214, 79, 69, 0.72);
      text-decoration-thickness: 2px;
      text-underline-offset: 2px;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }

    .judol-detector-highlight:focus {
      outline: 2px solid #d64f45;
      outline-offset: 2px;
    }
  `;
  document.documentElement.appendChild(style);
}
