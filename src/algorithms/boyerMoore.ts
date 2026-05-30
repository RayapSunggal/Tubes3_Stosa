import type { AlgorithmMatchResult, DetectorInput, RawMatch } from "../shared/types";

function buildLastOccurrence(pattern: string): Map<string, number> {
  const last=new Map<string, number>();
  const m=pattern.length;

  for (let i=0; i<m; i++) {
    last.set(pattern[i], i);
  }

  return last;
}

function boyerMoore(text: string, pattern: string, keyword: string): AlgorithmMatchResult {
  const matches: RawMatch[]=[];
  const n=text.length;
  const m=pattern.length;
  if (m===0 || n<m) return withComparisons(matches, 0);

  const data=text.toLowerCase();
  const target=pattern.toLowerCase();
  const last=buildLastOccurrence(target);

  let ni=0;
  let i=0;

  while (i<=n-m) {
    let j=m-1;

    while (j>=0) {
      ni++;
      if (data[i+j]!==target[j]) break;
      j--;
    }

    if (j<0) {
      matches.push({
        keyword,
        matchedText: text.slice(i, i+m),
        algorithm: "BoyerMoore",
        start: i,
        end: i+m,
        comparisons: ni,
      });
      i++;
    }
    else {
      const badChar=data[i+j];
      const lastIdx=last.get(badChar) ?? -1;
      const shift=j-lastIdx;
      i+=shift>0 ? shift : 1;
    }
  }

  return withComparisons(matches, ni);
}

function withComparisons(matches: RawMatch[], comparisons: number): AlgorithmMatchResult {
  const result=matches as AlgorithmMatchResult;
  result.comparisons=comparisons;

  return result;
}

export function runBoyerMoore(input: DetectorInput): AlgorithmMatchResult {
  const { text, keywords }=input;
  const results: RawMatch[]=[];
  let comparisons=0;

  for (const keyword of keywords) {
    const matches=boyerMoore(text, keyword, keyword);
    comparisons+=matches.comparisons;
    results.push(...matches);
  }

  return withComparisons(results, comparisons);
}
