interface KeywordDatum {
  keyword: string;
  count: number;
  kind: "Exact" | "RegEx" | "Fuzzy" | "OCR" | "Detected";
}

interface ChartPanelProps {
  keywords: KeywordDatum[];
}

export function ChartPanel({ keywords }: ChartPanelProps) {
  const maxCount = keywords.reduce((max, item) => Math.max(max, item.count), 1);

  return (
    <section className="section" aria-labelledby="keyword-chart-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Keyword</p>
          <h2 id="keyword-chart-title">Perbandingan temuan</h2>
        </div>
        <span className="section-value">{keywords.length}</span>
      </div>

      <div className="keyword-chart" aria-label="Perbandingan jumlah keyword">
        {keywords.map((item) => {
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
    </section>
  );
}
