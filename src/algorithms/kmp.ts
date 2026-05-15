import type { DetectorInput, RawMatch } from "../shared/types";

function buildLps(pattern: string): number[] {
  const m=pattern.length;
  const lps=new Array<number>(m).fill(0);

  let len=0;
  let i=1;
  while (i<m) {
    if (pattern[i]===pattern[len]) {
      len++;
      lps[i]=len;
      i++;
    }
    else {
      if (len!==0) {
        len=lps[len-1];
      }
      else {
        lps[i]=0;
        i++;
      }
    }
  }

  return lps;
}
//keyword untuk pengembangkan fuzzy 
function kmp(text: string, pattern: string, keyword: string): RawMatch[] {
  const matches: RawMatch[]=[];
  const n=text.length;
  const m=pattern.length;
  if (m===0 || n<m) return matches;

  const data=text.toLowerCase();
  const target=pattern.toLowerCase();
  const lps=buildLps(target);

  let ni=0;
  let i=0;
  let j=0;

  while (i<n) {
    ni++;
    if (data[i]===target[j]) {
      i++;
      j++;
      if (j===m) {
        matches.push({
          keyword,
          matchedText: text.slice(i-m, i),
          algorithm: "KMP",
          start: i-m,
          end: i,
          comparisons: ni,
        });
        j=lps[j-1];
      }
    }
    else {
      if (j!==0) {
        j=lps[j-1];
      }
      else {
        i++;
      }
    }
  }

  return matches;
}

export function runKmp(input: DetectorInput): RawMatch[] {
  const { text, keywords }=input;
  const results: RawMatch[]=[];

  for (const keyword of keywords) {
    results.push(...kmp(text, keyword, keyword));
  }

  return results;
}
