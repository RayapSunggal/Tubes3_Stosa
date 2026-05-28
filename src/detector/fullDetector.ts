import { runAhoCorasick } from "../algorithms/ahoCorasick";
import { runBoyerMoore } from "../algorithms/boyerMoore";
import { runKmp } from "../algorithms/kmp";
import { runRabinKarp } from "../algorithms/rabinKarp";
import { runRegexMatcher } from "../algorithms/regexMatcher";
import { runWeightedLevenshtein } from "../algorithms/weightedLevenshtein";
import type {
  AlgorithmExecutionStats,
  AlgorithmName,
  DetectorInput,
  DetectorOutput,
  MatchContribution,
  MatchKind,
  MergedMatch,
  RawMatch,
} from "../shared/types";

const EXACT_ALGORITHMS: AlgorithmName[] = [
  "KMP",
  "BoyerMoore",
  "AhoCorasick",
  "RabinKarp",
];

const MATCH_KIND_ORDER: MatchKind[] = ["exact", "regex", "fuzzy"];

type AlgorithmRunner = (input: DetectorInput) => RawMatch[];

interface RunnerConfig {
  algorithm: AlgorithmName;
  enabled: boolean;
  runner: AlgorithmRunner;
  input: DetectorInput;
  filterBoundaries: boolean;
}

interface RunResult {
  matches: RawMatch[];
  stats: AlgorithmExecutionStats;
}

export function runFullDetector(input: DetectorInput): DetectorOutput {
  const sanitizedInput = sanitizeInput(input);
  const exactResults = runExactAlgorithms(sanitizedInput);
  const exactMatches = exactResults.flatMap((result) => result.matches);
  const exactKeywords = collectMatchedKeywords(exactMatches);
  const fuzzyKeywords = sanitizedInput.keywords.filter(
    (keyword) => !exactKeywords.has(keyword),
  );
  const fuzzyInput: DetectorInput = {
    ...sanitizedInput,
    keywords: fuzzyKeywords,
  };

  const regexResult = runConfiguredAlgorithm({
    algorithm: "RegEx",
    enabled: sanitizedInput.options.enableRegex,
    runner: runRegexMatcher,
    input: sanitizedInput,
    filterBoundaries: false,
  });

  const fuzzyResult = runConfiguredAlgorithm({
    algorithm: "WeightedLevenshtein",
    enabled: sanitizedInput.options.enableFuzzy && fuzzyKeywords.length > 0,
    runner: runWeightedLevenshtein,
    input: fuzzyInput,
    filterBoundaries: true,
  });

  const algorithmStats = [
    ...exactResults.map((result) => result.stats),
    regexResult.stats,
    fuzzyResult.stats,
  ];
  const rawMatches = [
    ...exactMatches,
    ...regexResult.matches,
    ...removeMatchesCoveredBy(exactMatches, fuzzyResult.matches),
  ].sort(compareMatches);
  const matches = mergeMatches(sanitizedInput.text, rawMatches);

  return {
    rawMatches,
    matches,
    stats: {
      totalRawMatches: rawMatches.length,
      totalMergedMatches: matches.length,
      keywordCounts: countKeywords(matches),
      matchKindCounts: countMatchKinds(matches),
      algorithmStats,
    },
  };
}

function sanitizeInput(input: DetectorInput): DetectorInput {
  const seen = new Set<string>();
  const keywords: string[] = [];
  const normalizedText = input.options.normalizeText
    ? input.text.normalize("NFKC")
    : input.text;

  for (const keyword of input.keywords) {
    const trimmed = keyword.trim();
    const normalized = input.options.normalizeText
      ? trimmed.normalize("NFKC")
      : trimmed;

    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    keywords.push(normalized);
  }

  return {
    ...input,
    text: normalizedText.length === input.text.length ? normalizedText : input.text,
    keywords,
  };
}

function runExactAlgorithms(input: DetectorInput): RunResult[] {
  return [
    runConfiguredAlgorithm({
      algorithm: "KMP",
      enabled: input.options.enableKMP,
      runner: runKmp,
      input,
      filterBoundaries: true,
    }),
    runConfiguredAlgorithm({
      algorithm: "BoyerMoore",
      enabled: input.options.enableBoyerMoore,
      runner: runBoyerMoore,
      input,
      filterBoundaries: true,
    }),
    runConfiguredAlgorithm({
      algorithm: "AhoCorasick",
      enabled: input.options.enableAhoCorasick === true,
      runner: runAhoCorasick,
      input,
      filterBoundaries: true,
    }),
    runConfiguredAlgorithm({
      algorithm: "RabinKarp",
      enabled: input.options.enableRabinKarp === true,
      runner: runRabinKarp,
      input,
      filterBoundaries: true,
    }),
  ];
}

function runConfiguredAlgorithm(config: RunnerConfig): RunResult {
  const startedAt = now();
  const matches = config.enabled
    ? sanitizeMatches(config.input.text, config.runner(config.input), config.filterBoundaries)
    : [];
  const executionTimeMs = now() - startedAt;

  return {
    matches,
    stats: {
      algorithm: config.algorithm,
      matchCount: matches.length,
      executionTimeMs,
      comparisons: matches.reduce(
        (total, match) => total + (match.comparisons ?? 0),
        0,
      ),
    },
  };
}

function sanitizeMatches(
  text: string,
  matches: RawMatch[],
  filterBoundaries: boolean,
): RawMatch[] {
  return matches
    .filter((match) => isValidMatch(text, match, filterBoundaries))
    .sort(compareMatches);
}

function isValidMatch(
  text: string,
  match: RawMatch,
  filterBoundaries: boolean,
): boolean {
  if (match.start < 0 || match.end > text.length || match.end <= match.start) {
    return false;
  }

  if (!hasVisibleTokenEdges(match.matchedText)) {
    return false;
  }

  return !filterBoundaries || hasTokenBoundaries(text, match.start, match.end);
}

function hasVisibleTokenEdges(value: string): boolean {
  let first = "";
  let last = "";

  for (const char of value) {
    if (first.length === 0 && char.trim().length > 0) {
      first = char;
    }

    if (char.trim().length > 0) {
      last = char;
    }
  }

  return first.length > 0 && isTokenCharacter(first) && isTokenCharacter(last);
}

function hasTokenBoundaries(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";

  return !isTokenCharacter(before) && !isTokenCharacter(after);
}

function isTokenCharacter(char: string): boolean {
  if (char.length === 0) {
    return false;
  }

  return /[\p{L}\p{N}_]/u.test(char);
}

function collectMatchedKeywords(matches: RawMatch[]): Set<string> {
  const keywords = new Set<string>();

  for (const match of matches) {
    if (isExactAlgorithm(match.algorithm)) {
      keywords.add(match.keyword);
    }
  }

  return keywords;
}

function isExactAlgorithm(algorithm: AlgorithmName): boolean {
  for (const exactAlgorithm of EXACT_ALGORITHMS) {
    if (algorithm === exactAlgorithm) {
      return true;
    }
  }

  return false;
}

function removeMatchesCoveredBy(coveredBy: RawMatch[], candidates: RawMatch[]): RawMatch[] {
  return candidates.filter((candidate) => {
    for (const match of coveredBy) {
      if (candidate.start >= match.start && candidate.end <= match.end) {
        return false;
      }
    }

    return true;
  });
}

function mergeMatches(text: string, rawMatches: RawMatch[]): MergedMatch[] {
  const merged: MergedMatch[] = [];

  for (const rawMatch of rawMatches) {
    const last = merged[merged.length - 1];

    if (last && rawMatch.start <= last.end) {
      last.start = Math.min(last.start, rawMatch.start);
      last.end = Math.max(last.end, rawMatch.end);
      last.matchedText = text.slice(last.start, last.end);
      addContribution(last, rawMatch);
      continue;
    }

    merged.push({
      matchedText: text.slice(rawMatch.start, rawMatch.end),
      start: rawMatch.start,
      end: rawMatch.end,
      contributions: [toContribution(rawMatch)],
      keywords: [rawMatch.keyword],
      algorithms: [rawMatch.algorithm],
      matchKinds: [getMatchKind(rawMatch)],
    });
  }

  return merged;
}

function addContribution(match: MergedMatch, rawMatch: RawMatch): void {
  match.contributions.push(toContribution(rawMatch));
  addUnique(match.keywords, rawMatch.keyword);
  addUnique(match.algorithms, rawMatch.algorithm);
  addUnique(match.matchKinds, getMatchKind(rawMatch));
  match.matchKinds.sort(
    (left, right) => matchKindRank(left) - matchKindRank(right),
  );
}

function toContribution(match: RawMatch): MatchContribution {
  return {
    algorithm: match.algorithm,
    keyword: match.keyword,
    matchedText: match.matchedText,
    comparisons: match.comparisons,
    distance: match.distance,
    similarity: match.similarity,
  };
}

function addUnique<T>(items: T[], candidate: T): void {
  for (const item of items) {
    if (item === candidate) {
      return;
    }
  }

  items.push(candidate);
}

function getMatchKind(match: RawMatch): MatchKind {
  if (match.algorithm === "WeightedLevenshtein") {
    return "fuzzy";
  }

  if (match.algorithm === "RegEx" || match.isPatternMatch === true) {
    return "regex";
  }

  return "exact";
}

function countKeywords(matches: MergedMatch[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const match of matches) {
    for (const keyword of match.keywords) {
      counts[keyword] = (counts[keyword] ?? 0) + 1;
    }
  }

  return counts;
}

function countMatchKinds(matches: MergedMatch[]): Record<MatchKind, number> {
  const counts: Record<MatchKind, number> = {
    exact: 0,
    regex: 0,
    fuzzy: 0,
  };

  for (const match of matches) {
    for (const kind of match.matchKinds) {
      counts[kind] += 1;
    }
  }

  return counts;
}

function compareMatches(left: RawMatch, right: RawMatch): number {
  if (left.start !== right.start) {
    return left.start - right.start;
  }

  if (left.end !== right.end) {
    return right.end - left.end;
  }

  return algorithmRank(left.algorithm) - algorithmRank(right.algorithm);
}

function algorithmRank(algorithm: AlgorithmName): number {
  const order: AlgorithmName[] = [
    "KMP",
    "BoyerMoore",
    "AhoCorasick",
    "RabinKarp",
    "RegEx",
    "WeightedLevenshtein",
  ];

  for (let i = 0; i < order.length; i++) {
    if (order[i] === algorithm) {
      return i;
    }
  }

  return order.length;
}

function matchKindRank(kind: MatchKind): number {
  for (let i = 0; i < MATCH_KIND_ORDER.length; i++) {
    if (MATCH_KIND_ORDER[i] === kind) {
      return i;
    }
  }

  return MATCH_KIND_ORDER.length;
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}
