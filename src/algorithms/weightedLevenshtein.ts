import type { DetectorInput, RawMatch } from "../shared/types";

const SIMILAR_CHARS=[
  "a4@\u03b1",
  "e3",
  "i1!l",
  "o0",
  "s5$",
  "t7",
  "g69",
  "b8",
  "z2",
];

interface TokenCandidate {
  text: string;
  lowerText: string;
  start: number;
  end: number;
}

function inGroup(char: string, group: string): boolean {
  for (let i=0; i<group.length; i++) {
    if (char===group[i]) return true;
  }

  return false;
}

function substitutionCost(a: string, b: string): number {
  if (a===b) return 0;

  for (const group of SIMILAR_CHARS) {
    if (inGroup(a, group) && inGroup(b, group)) return 0.5;
  }

  return 1;
}

function weightedLevenshtein(source: string, target: string): number {
  const n=source.length;
  const m=target.length;
  const prev=new Array<number>(m+1);
  const curr=new Array<number>(m+1);

  for (let j=0; j<=m; j++) {
    prev[j]=j;
  }

  for (let i=1; i<=n; i++) {
    curr[0]=i;

    for (let j=1; j<=m; j++) {
      const del=prev[j]+1;
      const ins=curr[j-1]+1;
      const sub=prev[j-1]+substitutionCost(source[i-1], target[j-1]);
      curr[j]=Math.min(del, ins, sub);
    }

    for (let j=0; j<=m; j++) {
      prev[j]=curr[j];
    }
  }

  return prev[m];
}

function normalizeThreshold(threshold: number): number {
  const value=threshold>1 ? threshold/100 : threshold;

  return Math.max(0, Math.min(1, value));
}

function fuzzyMatcher(text: string, pattern: string, keyword: string, threshold: number, tokens: TokenCandidate[]): RawMatch[] {
  const matches: RawMatch[]=[];
  const target=normalizeComparableText(pattern);
  const m=target.length;
  if (m===0 || tokens.length===0) return matches;

  const limit=normalizeThreshold(threshold);
  const slack=Math.ceil(m*(1-limit));
  const minLen=Math.max(1, m-slack);
  const maxLen=m+slack;
  const cache=new Map<string, { distance: number; similarity: number } | null>();
  const candidates=createFuzzyCandidates(pattern, tokens, text);

  for (const candidate of candidates) {
    const len=candidate.lowerText.length;
    if (len<minLen || len>maxLen) {
      continue;
    }

    if (!cache.has(candidate.lowerText)) {
      cache.set(candidate.lowerText, scoreCandidate(candidate.lowerText, target, limit));
    }

    const score=cache.get(candidate.lowerText);
    if (score===null || score===undefined) {
      continue;
    }

    matches.push({
      keyword,
      matchedText: text.slice(candidate.start, candidate.end),
      algorithm: "WeightedLevenshtein",
      start: candidate.start,
      end: candidate.end,
      distance: score.distance,
      similarity: score.similarity,
    });
  }

  return matches;
}

function createFuzzyCandidates(
  pattern: string,
  tokens: TokenCandidate[],
  text: string,
): TokenCandidate[] {
  const patternTokenCount=countTokens(pattern);

  if (patternTokenCount<=1) {
    return tokens;
  }

  const candidates: TokenCandidate[]=[];
  for (let i=0; i<=tokens.length-patternTokenCount; i++) {
    const startToken=tokens[i];
    const endToken=tokens[i+patternTokenCount-1];
    const value=text.slice(startToken.start, endToken.end);

    candidates.push({
      text: value,
      lowerText: normalizeComparableText(value),
      start: startToken.start,
      end: endToken.end,
    });
  }

  return candidates;
}

function normalizeComparableText(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, " ").trim();
}

function scoreCandidate(source: string, target: string, limit: number): { distance: number; similarity: number } | null {
  if (!hasSharedVisualGroup(source, target)) {
    return null;
  }

  const distance=weightedLevenshtein(source, target);
  const similarity=1-distance/Math.max(source.length, target.length);

  if (similarity<limit) {
    return null;
  }

  return { distance, similarity };
}

function hasSharedVisualGroup(source: string, target: string): boolean {
  for (const sourceChar of source) {
    for (const targetChar of target) {
      if (sourceChar===targetChar || substitutionCost(sourceChar, targetChar)<1) {
        return true;
      }
    }
  }

  return false;
}

function countTokens(value: string): number {
  const regex=/[\p{L}\p{N}_@!$]+/giu;
  let count=0;

  while (regex.exec(value)!==null) {
    count++;
  }

  return count;
}

function extractTokenCandidates(text: string): TokenCandidate[] {
  const candidates: TokenCandidate[]=[];
  const regex=/[\p{L}\p{N}_@!$]{2,}/giu;
  let result: RegExpExecArray | null;

  while ((result=regex.exec(text))!==null) {
    const token=result[0];

    candidates.push({
      text: token,
      lowerText: token.toLowerCase(),
      start: result.index,
      end: result.index+token.length,
    });
  }

  return candidates;
}

export function runWeightedLevenshtein(input: DetectorInput): RawMatch[] {
  const { text, keywords, options }=input;
  const results: RawMatch[]=[];
  const candidates=extractTokenCandidates(text);

  for (const keyword of keywords) {
    results.push(...fuzzyMatcher(text, keyword, keyword, options.fuzzyThreshold, candidates));
  }

  return results;
}
