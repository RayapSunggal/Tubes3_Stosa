import type { DetectorInput, RawMatch } from "../shared/types";

interface RegexKeywordIndex {
  byBaseWord: Map<string, string>;
}

function buildRegexKeywordIndex(keywords: string[]): RegexKeywordIndex {
  const byBaseWord=new Map<string, string>();

  for (const keyword of keywords) {
    if (!isRegexBaseKeyword(keyword)) {
      continue;
    }

    const normalized=keyword.toLowerCase();
    if (!byBaseWord.has(normalized)) {
      byBaseWord.set(normalized, keyword);
    }
  }

  return { byBaseWord };
}

function isRegexBaseKeyword(keyword: string): boolean {
  if (keyword.length===0) {
    return false;
  }

  for (const char of keyword) {
    if (!isLetter(char)) {
      return false;
    }
  }

  return true;
}

function isLetter(char: string): boolean {
  return char.toLowerCase()!==char.toUpperCase();
}

function regexMatcher(text: string, keywordIndex: RegexKeywordIndex): RawMatch[] {
  const matches: RawMatch[]=[];
  const pattern=/(^|[^\p{L}\p{N}_])([\p{L}]+)(\d{2,3})(?![\p{L}\p{N}_])/giu;
  let result: RegExpExecArray | null;

  while ((result=pattern.exec(text))!==null) {
    const baseWord=result[2];
    const normalizedBaseWord=baseWord.toLowerCase();
    const keyword=keywordIndex.byBaseWord.get(normalizedBaseWord);

    if (keyword===undefined) {
      continue;
    }

    const start=result.index+result[1].length;
    const matchedText=`${baseWord}${result[3]}`;

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
  return regexMatcher(input.text, buildRegexKeywordIndex(input.keywords));
}
