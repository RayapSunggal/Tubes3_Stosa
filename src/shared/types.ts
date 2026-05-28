export type AlgorithmName =
  | "KMP"
  | "BoyerMoore"
  | "RegEx"
  | "WeightedLevenshtein"
  | "AhoCorasick"
  | "RabinKarp";

export type MatchKind = "exact" | "regex" | "fuzzy";

export interface DetectorInput {
  text: string;
  keywords: string[];
  options: DetectorOptions;
}

export interface DetectorOptions {
  enableKMP: boolean;
  enableBoyerMoore: boolean;
  enableRegex: boolean;
  enableFuzzy: boolean;
  enableAhoCorasick?: boolean;
  enableRabinKarp?: boolean;
  fuzzyThreshold: number;
  normalizeText?: boolean;
}

export interface RawMatch {
  keyword: string;
  matchedText: string;
  algorithm: AlgorithmName;
  start: number;
  end: number;
  comparisons?: number;
  distance?: number;
  similarity?: number;
  isPatternMatch?: boolean;
}

export interface MatchContribution {
  algorithm: AlgorithmName;
  keyword: string;
  matchedText: string;
  comparisons?: number;
  distance?: number;
  similarity?: number;
}

export interface MergedMatch {
  matchedText: string;
  start: number;
  end: number;
  contributions: MatchContribution[];
  keywords: string[];
  algorithms: AlgorithmName[];
  matchKinds: MatchKind[];
}

export interface AlgorithmExecutionStats {
  algorithm: AlgorithmName;
  matchCount: number;
  executionTimeMs: number;
  comparisons: number;
}

export interface DetectorStats {
  totalRawMatches: number;
  totalMergedMatches: number;
  keywordCounts: Record<string, number>;
  matchKindCounts: Record<MatchKind, number>;
  algorithmStats: AlgorithmExecutionStats[];
}

export interface DetectorOutput {
  rawMatches: RawMatch[];
  matches: MergedMatch[];
  stats: DetectorStats;
}
