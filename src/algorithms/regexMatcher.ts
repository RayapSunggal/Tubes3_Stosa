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

  const regex=new RegExp(`${escapeRegex(pattern)}\\d{2,3}`, "gi");

  let result: RegExpExecArray | null;

  while ((result=regex.exec(text))!==null) {
    const matchedText=result[0];

    if (matchedText.length===0) {
      regex.lastIndex++;
      continue;
    }

    matches.push({
      keyword,
      matchedText,
      algorithm: "RegEx",
      start: result.index,
      end: result.index+matchedText.length,
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
