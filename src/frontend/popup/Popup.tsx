import { useMemo, useState } from "react";
import { ChartPanel } from "./ChartPanel";
import { StatsPanel } from "./StatsPanel";

const popupStats = {
  scannedNodes: 187,
  totalKeywords: 42,
  totalMatches: 58,
  executionTimeMs: 37.84,
  matchKinds: [
    { label: "Exact", value: 21 },
    { label: "RegEx", value: 17 },
    { label: "Fuzzy", value: 14 },
    { label: "OCR", value: 6 },
  ],
  keywords: [
    { keyword: "GACOR99", count: 12, kind: "RegEx" as const },
    { keyword: "MAXWIN", count: 10, kind: "Exact" as const },
    { keyword: "H0KI88", count: 8, kind: "Fuzzy" as const },
    { keyword: "SLOT99", count: 7, kind: "RegEx" as const },
    { keyword: "MADU308", count: 5, kind: "OCR" as const },
  ],
  algorithms: [
    { name: "KMP", matches: 13, timeMs: 4.22, comparisons: 1140, tone: "green" as const },
    { name: "Boyer Moore", matches: 8, timeMs: 3.76, comparisons: 930, tone: "blue" as const },
    { name: "RegEx", matches: 17, timeMs: 1.18, comparisons: 0, tone: "red" as const },
    {
      name: "Weighted Levenshtein",
      matches: 14,
      timeMs: 18.34,
      comparisons: 2680,
      tone: "amber" as const,
    },
    { name: "Aho-Corasick", matches: 5, timeMs: 2.57, comparisons: 720, tone: "violet" as const },
    { name: "Rabin-Karp", matches: 1, timeMs: 7.77, comparisons: 510, tone: "cyan" as const },
  ],
};

export function Popup() {
  const [blurEnabled, setBlurEnabled] = useState(true);
  const [ocrEnabled, setOcrEnabled] = useState(true);

  const kindTotal = useMemo(
    () => popupStats.matchKinds.reduce((total, item) => total + item.value, 0),
    [],
  );

  return (
    <main className="popup">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Judol Detector</p>
          <h1>Realtime Scan</h1>
        </div>
        <span className="status-pill">
          <span aria-hidden="true" />
          Aktif
        </span>
      </header>

      <section className="summary-grid" aria-label="Ringkasan deteksi">
        <article className="summary-tile">
          <span className="tile-label">Keyword ditemukan</span>
          <strong>{popupStats.totalKeywords}</strong>
          <small>{popupStats.totalMatches} total match</small>
        </article>
        <article className="summary-tile">
          <span className="tile-label">Waktu eksekusi</span>
          <strong>{popupStats.executionTimeMs.toFixed(2)} ms</strong>
          <small>{popupStats.scannedNodes} node DOM</small>
        </article>
      </section>

      <section className="section" aria-labelledby="kind-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Hirarki</p>
            <h2 id="kind-title">Jenis matching</h2>
          </div>
          <span className="section-value">{kindTotal}</span>
        </div>

        <div className="kind-grid">
          {popupStats.matchKinds.map((item) => (
            <article className="kind-tile" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <StatsPanel algorithms={popupStats.algorithms} />
      <ChartPanel keywords={popupStats.keywords} />

      <section className="section bonus-section" aria-labelledby="bonus-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Bonus</p>
            <h2 id="bonus-title">Proteksi visual</h2>
          </div>
        </div>

        <div className="toggle-list">
          <label className="toggle-row">
            <span>
              <strong>Blur teks otomatis</strong>
              <small>Sensor elemen DOM yang terdeteksi.</small>
            </span>
            <input
              type="checkbox"
              checked={blurEnabled}
              onChange={(event) => setBlurEnabled(event.currentTarget.checked)}
            />
          </label>

          <label className="toggle-row">
            <span>
              <strong>OCR gambar</strong>
              <small>Deteksi keyword dari teks pada gambar.</small>
            </span>
            <input
              type="checkbox"
              checked={ocrEnabled}
              onChange={(event) => setOcrEnabled(event.currentTarget.checked)}
            />
          </label>
        </div>
      </section>

      <footer className="popup-footer">
        <span>Threshold fuzzy: 0.82</span>
        <span>Custom tooltip DOM siap</span>
      </footer>
    </main>
  );
}
