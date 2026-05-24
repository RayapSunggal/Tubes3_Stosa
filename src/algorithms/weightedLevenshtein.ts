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

function fuzzyMatcher(text: string, pattern: string, keyword: string, threshold: number): RawMatch[] {
  const matches: RawMatch[]=[];
  const n=text.length;
  const m=pattern.length;
  if (m===0 || n===0) return matches;

  const data=text.toLowerCase();
  const target=pattern.toLowerCase();
  const limit=normalizeThreshold(threshold);
  const slack=Math.ceil(m*(1-limit));
  const minLen=Math.max(1, m-slack);
  const maxLen=Math.min(n, m+slack);

  for (let i=0; i<n; i++) {
    let bestDistance=Number.POSITIVE_INFINITY;
    let bestSimilarity=0;
    let bestEnd=-1;

    for (let len=minLen; len<=maxLen && i+len<=n; len++) {
      const end=i+len;
      const candidate=data.slice(i, end);
      const distance=weightedLevenshtein(candidate, target);
      const similarity=1-distance/Math.max(len, m);

      if (similarity>=limit && (similarity>bestSimilarity || (similarity===bestSimilarity && distance<bestDistance))) {
        bestDistance=distance;
        bestSimilarity=similarity;
        bestEnd=end;
      }
    }

    if (bestEnd!==-1) {
      matches.push({
        keyword,
        matchedText: text.slice(i, bestEnd),
        algorithm: "WeightedLevenshtein",
        start: i,
        end: bestEnd,
        distance: bestDistance,
        similarity: bestSimilarity,
      });
    }
  }

  return matches;
}

export function runWeightedLevenshtein(input: DetectorInput): RawMatch[] {
  const { text, keywords, options }=input;
  const results: RawMatch[]=[];

  for (const keyword of keywords) {
    results.push(...fuzzyMatcher(text, keyword, keyword, options.fuzzyThreshold));
  }

  return results;
}
