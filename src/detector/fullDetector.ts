import { runAhoCorasick } from "../algorithms/ahoCorasick";
import { runBoyerMoore } from "../algorithms/boyerMoore";
import { runKmp } from "../algorithms/kmp";
import { runRabinKarp } from "../algorithms/rabinKarp";
import { runRegexMatcher } from "../algorithms/regexMatcher";
import { runWeightedLevenshtein } from "../algorithms/weightedLevenshtein";
import type {
  AlgorithmMatchResult,
  AlgorithmExecutionStats,
  AlgorithmName,
  DetectorInput,
  DetectorOutput,
  MatchContribution,
  MatchKind,
  MergedMatch,
  RawMatch,
} from "../shared/types";

const MATCH_KIND_ORDER: MatchKind[] = ["exact", "regex", "fuzzy"];
const ALGORITHM_ORDER: AlgorithmName[] = [
  "KMP",
  "BoyerMoore",
  "AhoCorasick",
  "RabinKarp",
  "RegEx",
  "WeightedLevenshtein",
];

type AlgorithmRunner = (input: DetectorInput) => RawMatch[];
type DetectorProgressCallback = (
  output: DetectorOutput,
  algorithm: AlgorithmName,
) => void | Promise<void>;

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

  const regexResult = runConfiguredAlgorithm({
    algorithm: "RegEx",
    enabled: sanitizedInput.options.enableRegex,
    runner: runRegexMatcher,
    input: sanitizedInput,
    filterBoundaries: false,
  });

  const fuzzyResult = runConfiguredAlgorithm({
    algorithm: "WeightedLevenshtein",
    enabled: sanitizedInput.options.enableFuzzy,
    runner: runWeightedLevenshtein,
    input: sanitizedInput,
    filterBoundaries: true,
  });

  return createDetectorOutput(
    sanitizedInput.text,
    exactResults,
    regexResult,
    fuzzyResult,
  );
}

export async function runFullDetectorProgressively(
  input: DetectorInput,
  onProgress: DetectorProgressCallback,
): Promise<DetectorOutput> {
  const sanitizedInput = sanitizeInput(input);
  const exactResults: RunResult[] = [];

  for (const config of createExactAlgorithmConfigs(sanitizedInput)) {
    const result = runConfiguredAlgorithm(config);
    exactResults.push(result);
    await onProgress(
      createDetectorOutput(sanitizedInput.text, exactResults),
      config.algorithm,
    );
  }

  const regexResult = runConfiguredAlgorithm({
    algorithm: "RegEx",
    enabled: sanitizedInput.options.enableRegex,
    runner: runRegexMatcher,
    input: sanitizedInput,
    filterBoundaries: false,
  });
  await onProgress(
    createDetectorOutput(sanitizedInput.text, exactResults, regexResult),
    "RegEx",
  );

  const fuzzyResult = runConfiguredAlgorithm({
    algorithm: "WeightedLevenshtein",
    enabled: sanitizedInput.options.enableFuzzy,
    runner: runWeightedLevenshtein,
    input: sanitizedInput,
    filterBoundaries: true,
  });
  const output = createDetectorOutput(
    sanitizedInput.text,
    exactResults,
    regexResult,
    fuzzyResult,
  );
  await onProgress(output, "WeightedLevenshtein");

  return output;
}

function createDetectorOutput(
  text: string,
  exactResults: RunResult[],
  regexResult?: RunResult,
  fuzzyResult?: RunResult,
): DetectorOutput {
  const exactMatches = exactResults.flatMap((result) => result.matches);
  const regexMatches = regexResult?.matches ?? [];
  const fuzzyMatches = fuzzyResult?.matches ?? [];
  const nonFuzzyMatches = [...exactMatches, ...regexMatches];
  const rawMatches = [
    ...exactMatches,
    ...regexMatches,
    ...removeMatchesCoveredBy(nonFuzzyMatches, fuzzyMatches),
  ].sort(compareMatches);
  const matches = mergeMatches(text, rawMatches);
  const baseAlgorithmStats = [
    ...exactResults.map((result) => result.stats),
    ...(regexResult ? [regexResult.stats] : []),
    ...(fuzzyResult ? [fuzzyResult.stats] : []),
  ];
  const algorithmStats = syncAlgorithmMatchCounts(
    completeAlgorithmStats(baseAlgorithmStats),
    matches,
  );

  return {
      rawMatches,
      matches,
      stats: {
        totalRawMatches: rawMatches.length,
        totalMergedMatches: countDetections(matches),
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
  return createExactAlgorithmConfigs(input).map(runConfiguredAlgorithm);
}

function createExactAlgorithmConfigs(input: DetectorInput): RunnerConfig[] {
  return [
    {
      algorithm: "KMP",
      enabled: input.options.enableKMP,
      runner: runKmp,
      input,
      filterBoundaries: false,
    },
    {
      algorithm: "BoyerMoore",
      enabled: input.options.enableBoyerMoore,
      runner: runBoyerMoore,
      input,
      filterBoundaries: false,
    },
    {
      algorithm: "AhoCorasick",
      enabled: input.options.enableAhoCorasick === true,
      runner: runAhoCorasick,
      input,
      filterBoundaries: false,
    },
    {
      algorithm: "RabinKarp",
      enabled: input.options.enableRabinKarp === true,
      runner: runRabinKarp,
      input,
      filterBoundaries: false,
    },
  ];
}

function runConfiguredAlgorithm(config: RunnerConfig): RunResult {
  const startedAt = now();
  const rawMatches = config.enabled
    ? config.runner(config.input)
    : [];
  const comparisons = getComparisonCount(rawMatches);
  const matches = config.enabled
    ? sanitizeMatches(config.input.text, rawMatches, config.filterBoundaries)
    : [];
  const executionTimeMs = now() - startedAt;

  return {
    matches,
    stats: {
      algorithm: config.algorithm,
      matchCount: matches.length,
      executionTimeMs,
      comparisons,
    },
  };
}

function getComparisonCount(matches: RawMatch[]): number {
  const comparisonResult = matches as Partial<AlgorithmMatchResult>;
  if (typeof comparisonResult.comparisons === "number") {
    return comparisonResult.comparisons;
  }

  return matches.reduce(
    (total, match) => total + (match.comparisons ?? 0),
    0,
  );
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

function syncAlgorithmMatchCounts(
  stats: AlgorithmExecutionStats[],
  matches: MergedMatch[],
): AlgorithmExecutionStats[] {
  const counts: Partial<Record<AlgorithmName, number>> = {};

  for (const match of matches) {
    const seen: string[] = [];

    for (const contribution of match.contributions) {
      const key = `${contribution.algorithm}\u0000${contribution.keyword}\u0000${contribution.matchedText}`;
      if (hasSeenKey(seen, key)) {
        continue;
      }

      seen.push(key);
      counts[contribution.algorithm] = (counts[contribution.algorithm] ?? 0) + 1;
    }
  }

  return stats.map((item) => ({
    ...item,
    matchCount: counts[item.algorithm] ?? 0,
  }));
}

function completeAlgorithmStats(
  stats: AlgorithmExecutionStats[],
): AlgorithmExecutionStats[] {
  const statsByAlgorithm = new Map<AlgorithmName, AlgorithmExecutionStats>();

  for (const item of stats) {
    statsByAlgorithm.set(item.algorithm, item);
  }

  return ALGORITHM_ORDER.map(
    (algorithm) =>
      statsByAlgorithm.get(algorithm) ?? {
        algorithm,
        matchCount: 0,
        executionTimeMs: 0,
        comparisons: 0,
      },
  );
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
    const seen: string[] = [];

    for (const contribution of match.contributions) {
      const kind = getContributionMatchKind(contribution);
      const key = `${kind}\u0000${contribution.keyword}\u0000${contribution.matchedText}`;
      if (hasSeenKey(seen, key)) {
        continue;
      }

      seen.push(key);
      counts[kind] += 1;
    }
  }

  return counts;
}

function getContributionMatchKind(contribution: MatchContribution): MatchKind {
  if (contribution.algorithm === "WeightedLevenshtein") {
    return "fuzzy";
  }

  return contribution.algorithm === "RegEx" ? "regex" : "exact";
}

function hasSeenKey(items: string[], candidate: string): boolean {
  for (const item of items) {
    if (item === candidate) {
      return true;
    }
  }

  return false;
}

function countDetections(matches: MergedMatch[]): number {
  const counts = countMatchKinds(matches);

  return counts.exact + counts.regex + counts.fuzzy;
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
  for (let i = 0; i < ALGORITHM_ORDER.length; i++) {
    if (ALGORITHM_ORDER[i] === algorithm) {
      return i;
    }
  }

  return ALGORITHM_ORDER.length;
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
