import type { DetectorInput, RawMatch } from "../shared/types";

const BASE=256;
const MOD=1000000007;

function rabinKarp(text: string, pattern: string, keyword: string): RawMatch[] {
  const matches: RawMatch[]=[];
  const n=text.length;
  const m=pattern.length;
  if (m===0 || n<m) return matches;

  const data=text.toLowerCase();
  const target=pattern.toLowerCase();

  let power=1;
  let patternHash=0;
  let windowHash=0;
  let ni=0;

  for (let i=0; i<m-1; i++) {
    power=(power*BASE)%MOD;
  }

  for (let i=0; i<m; i++) {
    patternHash=(patternHash*BASE+target.charCodeAt(i))%MOD;
    windowHash=(windowHash*BASE+data.charCodeAt(i))%MOD;
  }

  for (let i=0; i<=n-m; i++) {
    ni++;
    if (patternHash===windowHash) {
      let j=0;

      while (j<m) {
        ni++;
        if (data[i+j]!==target[j]) break;
        j++;
      }

      if (j===m) {
        matches.push({
          keyword,
          matchedText: text.slice(i, i+m),
          algorithm: "RabinKarp",
          start: i,
          end: i+m,
          comparisons: ni,
        });
      }
    }

    if (i<n-m) {
      windowHash=(windowHash-data.charCodeAt(i)*power)%MOD;
      if (windowHash<0) windowHash+=MOD;
      windowHash=(windowHash*BASE+data.charCodeAt(i+m))%MOD;
    }
  }

  return matches;
}

export function runRabinKarp(input: DetectorInput): RawMatch[] {
  const { text, keywords }=input;
  const results: RawMatch[]=[];

  for (const keyword of keywords) {
    results.push(...rabinKarp(text, keyword, keyword));
  }

  return results;
}
