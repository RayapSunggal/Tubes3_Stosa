import { useState } from "react";

interface KeywordDatum {
  keyword: string;
  count: number;
  kind: "Exact" | "RegEx" | "Fuzzy" | "OCR" | "Detected";
}

interface ChartPanelProps {
  keywords: KeywordDatum[];
}

export function ChartPanel({ keywords }: ChartPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const displayedKeywords = showAll ? keywords : keywords.slice(0, 5);
  const maxCount = keywords.reduce((max, item) => Math.max(max, item.count), 1);
  const visibleKeywordCount = keywords.filter((item) => item.count > 0).length;
  const canToggle = keywords.length > 5;

  return (
    <section className="section" aria-labelledby="keyword-chart-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Keyword</p>
          <h2 id="keyword-chart-title">Perbandingan temuan</h2>
        </div>
        <span className="section-value">Keyword unik: {visibleKeywordCount}</span>
      </div>

      <div className="keyword-chart" aria-label="Perbandingan jumlah keyword">
        {displayedKeywords.map((item) => {
          const width = `${Math.max((item.count / maxCount) * 100, 8)}%`;

          return (
            <div className="keyword-row" key={item.keyword}>
              <div className="keyword-meta">
                <span className="keyword-name">{item.keyword}</span>
                <span className="keyword-kind">{item.kind}</span>
              </div>
              <div className="bar-track" aria-hidden="true">
                <span className="bar-fill" style={{ width }} />
              </div>
              <span className="keyword-count">{item.count}</span>
            </div>
          );
        })}
      </div>

      {canToggle ? (
        <button
          className="chart-toggle"
          type="button"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? "Tampilkan top 5" : "Tampilkan semua"}
        </button>
      ) : null}
    </section>
  );
}
