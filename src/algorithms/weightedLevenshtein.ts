import type { AlgorithmMatchResult, DetectorInput, RawMatch } from "../shared/types";

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
  comparableText: string;
  start: number;
  end: number;
}

interface KeywordProfile {
  keyword: string;
  target: string;
  tokenCount: number;
  threshold: number;
}

interface Score {
  distance: number;
  similarity: number;
  comparisons: number;
}

interface ScoreResult {
  score: Score | null;
  comparisons: number;
}

interface DistanceResult {
  distance: number;
  comparisons: number;
  withinLimit: boolean;
}

interface SharedVisualGroupResult {
  shared: boolean;
  comparisons: number;
}

function inGroup(char: string, group: string): boolean {
  for (let i=0; i<group.length; i++) {
    if (char===group[i]) {
      return true;
    }
  }

  return false;
}

function substitutionCost(a: string, b: string): number {
  if (a===b) {
    return 0;
  }

  for (const group of SIMILAR_CHARS) {
    if (inGroup(a, group) && inGroup(b, group)) {
      return 0.5;
    }
  }

  return 1;
}

function weightedLevenshtein(source: string, target: string, maxDistance: number): DistanceResult {
  const n=source.length;
  const m=target.length;

  if (Math.abs(n-m)>maxDistance) {
    return { distance: Math.abs(n-m), comparisons: 0, withinLimit: false };
  }

  const prev=new Array<number>(m+1);
  const curr=new Array<number>(m+1);
  let comparisons=0;

  for (let j=0; j<=m; j++) {
    prev[j]=j;
  }

  for (let i=1; i<=n; i++) {
    curr[0]=i;
    let rowMin=curr[0];

    for (let j=1; j<=m; j++) {
      comparisons++;

      const del=prev[j]+1;
      const ins=curr[j-1]+1;
      const sub=prev[j-1]+substitutionCost(source[i-1], target[j-1]);
      const best=Math.min(del, ins, sub);

      curr[j]=best;
      if (best<rowMin) {
        rowMin=best;
      }
    }

    if (rowMin>maxDistance) {
      return { distance: rowMin, comparisons, withinLimit: false };
    }

    for (let j=0; j<=m; j++) {
      prev[j]=curr[j];
    }
  }

  return { distance: prev[m], comparisons, withinLimit: prev[m]<=maxDistance };
}

function normalizeThreshold(threshold: number): number {
  const value=threshold>1 ? threshold/100 : threshold;

  return Math.max(0, Math.min(1, value));
}

function fuzzyMatcher(
  text: string,
  profile: KeywordProfile,
  candidates: TokenCandidate[],
  scoreCache: Map<string, ScoreResult>,
  comparisonCounter: { value: number },
): RawMatch[] {
  const matches: RawMatch[]=[];
  if (profile.target.length===0 || candidates.length===0) {
    return matches;
  }

  for (const candidate of candidates) {
    const score=getCachedScore(profile, candidate, scoreCache, comparisonCounter);
    if (score===null || hasAcceptedMatch(matches, profile.keyword, candidate.start, candidate.end)) {
      continue;
    }

    matches.push({
      keyword: profile.keyword,
      matchedText: text.slice(candidate.start, candidate.end),
      algorithm: "WeightedLevenshtein",
      start: candidate.start,
      end: candidate.end,
      distance: score.distance,
      similarity: score.similarity,
      comparisons: score.comparisons,
    });
  }

  return matches;
}

function hasAcceptedMatch(matches: RawMatch[], keyword: string, start: number, end: number): boolean {
  for (const match of matches) {
    if (match.keyword===keyword && match.start===start && match.end===end) {
      return true;
    }
  }

  return false;
}

function getCachedScore(
  profile: KeywordProfile,
  candidate: TokenCandidate,
  scoreCache: Map<string, ScoreResult>,
  comparisonCounter: { value: number },
): Score | null {
  const cacheKey=`${profile.target}\u0000${candidate.lowerText}`;
  const cached=scoreCache.get(cacheKey);
  if (cached!==undefined) {
    return cached.score;
  }

  const result=scoreCandidate(candidate.lowerText, profile.target, profile.threshold);
  comparisonCounter.value+=result.comparisons;
  scoreCache.set(cacheKey, result);

  return result.score;
}

function createKeywordProfiles(keywords: string[], threshold: number): KeywordProfile[] {
  const profiles: KeywordProfile[]=[];
  const normalizedThreshold=normalizeThreshold(threshold);

  for (const keyword of keywords) {
    const target=normalizeComparableText(keyword);
    const tokenCount=countTokens(keyword);

    if (target.length===0 || tokenCount===0) {
      continue;
    }

    profiles.push({
      keyword,
      target,
      tokenCount,
      threshold: normalizedThreshold,
    });
  }

  return profiles;
}

function createFuzzyCandidates(tokenCount: number, tokens: TokenCandidate[], text: string): TokenCandidate[] {
  if (tokenCount<=1) {
    return createSingleTokenCandidates(tokens);
  }

  const candidates: TokenCandidate[]=[];
  for (let i=0; i<=tokens.length-tokenCount; i++) {
    const startToken=tokens[i];
    const endToken=tokens[i+tokenCount-1];

    candidates.push({
      text: text.slice(startToken.start, endToken.end),
      lowerText: joinTokenWindow(tokens, i, tokenCount),
      comparableText: joinTokenWindow(tokens, i, tokenCount),
      start: startToken.start,
      end: endToken.end,
    });
  }

  return candidates;
}

function createSingleTokenCandidates(tokens: TokenCandidate[]): TokenCandidate[] {
  const candidates: TokenCandidate[]=[];

  for (const token of tokens) {
    candidates.push(token);

    if (token.comparableText!==token.lowerText && token.comparableText.length>=2) {
      candidates.push({
        ...token,
        lowerText: token.comparableText,
      });
    }
  }

  return candidates;
}

function joinTokenWindow(tokens: TokenCandidate[], startIndex: number, tokenCount: number): string {
  let result="";

  for (let offset=0; offset<tokenCount; offset++) {
    if (offset>0) {
      result+=" ";
    }

    result+=tokens[startIndex+offset].comparableText;
  }

  return result;
}

function normalizeComparableText(value: string): string {
  let result="";
  let pendingSpace=false;

  for (let i=0; i<value.length; i++) {
    const char=value[i].toLowerCase();

    if (isWhitespace(char)) {
      pendingSpace=result.length>0;
      continue;
    }

    if (pendingSpace) {
      result+=" ";
      pendingSpace=false;
    }

    result+=char;
  }

  return result;
}

function scoreCandidate(source: string, target: string, limit: number): ScoreResult {
  const maxLength=Math.max(source.length, target.length);
  if (maxLength===0) {
    return { score: null, comparisons: 0 };
  }

  const maxDistance=(1-limit)*maxLength;
  if (!canReachThresholdByLength(source.length, target.length, maxDistance)) {
    return { score: null, comparisons: 1 };
  }

  const shared=hasSharedVisualGroup(source, target);
  if (!shared.shared) {
    return { score: null, comparisons: shared.comparisons };
  }

  const distance=weightedLevenshtein(source, target, maxDistance);
  const comparisons=shared.comparisons+distance.comparisons;
  if (!distance.withinLimit) {
    return { score: null, comparisons };
  }

  const similarity=1-distance.distance/maxLength;

  return similarity>=limit
    ? {
        score: {
          distance: distance.distance,
          similarity,
          comparisons: distance.comparisons,
        },
        comparisons,
      }
    : { score: null, comparisons };
}

function canReachThresholdByLength(sourceLength: number, targetLength: number, maxDistance: number): boolean {
  return Math.abs(sourceLength-targetLength)<=maxDistance;
}

function hasSharedVisualGroup(source: string, target: string): SharedVisualGroupResult {
  let comparisons=0;

  for (const sourceChar of source) {
    for (const targetChar of target) {
      comparisons++;
      if (sourceChar===targetChar || substitutionCost(sourceChar, targetChar)<1) {
        return { shared: true, comparisons };
      }
    }
  }

  return { shared: false, comparisons };
}

function countTokens(value: string): number {
  let count=0;
  let inToken=false;

  for (let i=0; i<value.length; i++) {
    if (isTokenCharacter(value[i])) {
      if (!inToken) {
        count++;
        inToken=true;
      }
      continue;
    }

    inToken=false;
  }

  return count;
}

function extractTokenCandidates(text: string): TokenCandidate[] {
  const candidates: TokenCandidate[]=[];
  let tokenStart=-1;
  let tokenText="";

  for (let i=0; i<text.length; i++) {
    const char=text[i];

    if (isTokenCharacter(char)) {
      if (tokenStart<0) {
        tokenStart=i;
        tokenText="";
      }

      tokenText+=char;
      continue;
    }

    if (tokenStart>=0) {
      addTokenCandidate(candidates, tokenText, tokenStart, i);
      tokenStart=-1;
      tokenText="";
    }
  }

  if (tokenStart>=0) {
    addTokenCandidate(candidates, tokenText, tokenStart, text.length);
  }

  return candidates;
}

function addTokenCandidate(candidates: TokenCandidate[], tokenText: string, start: number, end: number): void {
  if (tokenText.length<2) {
    return;
  }

  const lowerText=tokenText.toLowerCase();

  candidates.push({
    text: tokenText,
    lowerText,
    comparableText: createComparableTokenText(lowerText),
    start,
    end,
  });
}

function createComparableTokenText(value: string): string {
  const trimmed=trimEdgeDigits(value);

  return trimmed.length>=2 ? trimmed : value;
}

function trimEdgeDigits(value: string): string {
  let start=0;
  let end=value.length;

  while (start<end && isDigit(value[start])) {
    start++;
  }

  while (end>start && isDigit(value[end-1])) {
    end--;
  }

  return value.slice(start, end);
}

function isTokenCharacter(char: string): boolean {
  return isLetter(char) || isDigit(char) || char==="_" || char==="@" || char==="!" || char==="$";
}

function isLetter(char: string): boolean {
  return char.toLowerCase()!==char.toUpperCase();
}

function isDigit(char: string): boolean {
  return char>="0" && char<="9";
}

function isWhitespace(char: string): boolean {
  return char===" " || char==="\n" || char==="\r" || char==="\t" || char==="\f" || char==="\v";
}

function withComparisons(matches: RawMatch[], comparisons: number): AlgorithmMatchResult {
  const result=matches as AlgorithmMatchResult;
  result.comparisons=comparisons;

  return result;
}

export function runWeightedLevenshtein(input: DetectorInput): AlgorithmMatchResult {
  const { text, keywords, options }=input;
  const results: RawMatch[]=[];
  const tokens=extractTokenCandidates(text);
  const profiles=createKeywordProfiles(keywords, options.fuzzyThreshold);
  const candidateCache=new Map<number, TokenCandidate[]>();
  const scoreCache=new Map<string, ScoreResult>();
  const comparisonCounter={ value: 0 };

  for (const profile of profiles) {
    let candidates=candidateCache.get(profile.tokenCount);
    if (candidates===undefined) {
      candidates=createFuzzyCandidates(profile.tokenCount, tokens, text);
      candidateCache.set(profile.tokenCount, candidates);
    }

    results.push(...fuzzyMatcher(text, profile, candidates, scoreCache, comparisonCounter));
  }

  return withComparisons(results, comparisonCounter.value);
}
