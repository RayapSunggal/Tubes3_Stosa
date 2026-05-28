import type { DetectorInput, RawMatch } from "../shared/types";

function isRegexSpecial(char: string): boolean {
  return char==="." || char==="*" || char==="+" || char==="?" || char==="^" || char==="$" || char==="{" || char==="}" || char==="(" || char===")" || char==="|" || char==="[" || char==="]" || char==="\\" || char==="/";
}

function escapeRegex(pattern: string): string {
  let result="";

  for (let i=0; i<pattern.length; i++) {
    if (isRegexSpecial(pattern[i])) {
      result+="\\";
    }

    result+=pattern[i];
  }

  return result;
}

function regexMatcher(text: string, pattern: string, keyword: string): RawMatch[] {
  const matches: RawMatch[]=[];
  if (pattern.length===0) return matches;

  const regex=new RegExp(
    `(^|[^\\p{L}\\p{N}_])(${escapeRegex(pattern)}\\d{2,3})(?![\\p{L}\\p{N}_])`,
    "giu",
  );

  let result: RegExpExecArray | null;

  while ((result=regex.exec(text))!==null) {
    const matchedText=result[2];
    const start=result.index+result[1].length;

    if (matchedText.length===0) {
      regex.lastIndex++;
      continue;
    }

    matches.push({
      keyword,
      matchedText,
      algorithm: "RegEx",
      start,
      end: start+matchedText.length,
      isPatternMatch: true,
    });
  }

  return matches;
}

export function runRegexMatcher(input: DetectorInput): RawMatch[] {
  const { text, keywords }=input;
  const results: RawMatch[]=[];

  for (const keyword of keywords) {
    results.push(...regexMatcher(text, keyword, keyword));
  }

  return results;
}
