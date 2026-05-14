import type { DetectorInput, DetectorOutput } from "../shared/types";

export function runFullDetector(input: DetectorInput): DetectorOutput {
  void input;
  // TODO : run algorithmnya, terus hasilnya dalam bentu raw matches dimerge, jadi satu set terakhir 
  // nanti return detectoroutput data, bisa cek dari types.ts, ato ikutin aja return yang di bawah ini
  return {
    rawMatches: [],
    matches: [],
    stats: {
      totalRawMatches: 0,
      totalMergedMatches: 0,
      keywordCounts: {},
      algorithmStats: [],
    },
  };
}
