interface AlgorithmStat {
  name: string;
  matches: number;
  timeMs: number;
  comparisons: number;
  tone: "green" | "blue" | "red" | "amber" | "violet" | "cyan";
}

interface StatsPanelProps {
  algorithms: AlgorithmStat[];
}

export function StatsPanel({ algorithms }: StatsPanelProps) {
  const totalMatches = algorithms.reduce((total, item) => total + item.matches, 0);

  return (
    <section className="section" aria-labelledby="algorithm-stats-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Algoritma</p>
          <h2 id="algorithm-stats-title">Waktu dan match</h2>
        </div>
        <span className="section-value">Raw match: {totalMatches}</span>
      </div>

      <div className="algorithm-list">
        {algorithms.map((item) => (
          <article className="algorithm-row" key={item.name}>
            <span className={`algorithm-dot ${item.tone}`} aria-hidden="true" />
            <div className="algorithm-main">
              <h3>{item.name}</h3>
              <p>{item.comparisons.toLocaleString("id-ID")} komparasi</p>
            </div>
            <div className="algorithm-numbers">
              <strong>{item.matches}</strong>
              <span>{item.timeMs.toFixed(2)} ms</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
