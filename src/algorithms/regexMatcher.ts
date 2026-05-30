import type { AlgorithmMatchResult, DetectorInput, RawMatch } from "../shared/types";

function regexMatcher(text: string): AlgorithmMatchResult {
  const matches: RawMatch[]=[];
  const pattern=/(^|[^\p{L}\p{N}_])([\p{L}]+)(\d{2,})(?![\p{L}\p{N}_])/giu;
  const comparisons=countScannedCharacters(text);
  let result: RegExpExecArray | null;

  while ((result=pattern.exec(text))!==null) {
    const baseWord=result[2];
    const start=result.index+result[1].length;
    const matchedText=`${baseWord}${result[3]}`;

    matches.push({
      keyword: matchedText,
      matchedText,
      algorithm: "RegEx",
      start,
      end: start+matchedText.length,
      isPatternMatch: true,
    });
  }

  return withComparisons(matches, comparisons);
}

function countScannedCharacters(text: string): number {
  let comparisons=0;

  for (let i=0; i<text.length; i++) {
    comparisons++;
  }

  return comparisons;
}

function withComparisons(matches: RawMatch[], comparisons: number): AlgorithmMatchResult {
  const result=matches as AlgorithmMatchResult;
  result.comparisons=comparisons;

  return result;
}

export function runRegexMatcher(input: DetectorInput): AlgorithmMatchResult {
  return regexMatcher(input.text);
}
