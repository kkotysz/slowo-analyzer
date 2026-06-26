import type { SolverHistogramBucket, SolverHistogramResult, SolverStrategySnapshot, Word, WorkerStatus } from "../types/wordle";

interface SolverPanelProps {
  startWord: Word;
  maxAttempts: number;
  answerCount: number;
  status: WorkerStatus;
  progress: number;
  result?: SolverHistogramResult;
  message: string;
  strategy: SolverStrategySnapshot;
  canStart: boolean;
  onStartWordChange: (word: Word) => void;
  onMaxAttemptsChange: (maxAttempts: number) => void;
  onStart: () => void;
  onStop: () => void;
}

const SORT_LABELS = {
  entropy: "entropia",
  worstBucket: "max bucket",
  averageBucket: "średni bucket",
  hitProbability: "P(hit)",
  candidateFirst: "kandydaci pierwsi",
} as const;

function emptyHistogram(maxAttempts: number): SolverHistogramBucket[] {
  return [
    ...Array.from({ length: Math.max(1, maxAttempts) }, (_, index) => ({
      attempts: index + 1,
      label: String(index + 1),
      count: 0,
      percentage: 0,
    })),
    {
      attempts: "unsolved" as const,
      label: `>${Math.max(1, maxAttempts)}`,
      count: 0,
      percentage: 0,
    },
  ];
}

function formatPercent(value: number): string {
  return value.toLocaleString("pl-PL", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
}

function formatAverage(value: number): string {
  return value.toLocaleString("pl-PL", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function strategyLabel(strategy: SolverStrategySnapshot): string {
  const pool = strategy.candidateOnly ? "tylko kandydaci" : "pełna pula";
  const precision = strategy.exact ? "dokładnie" : "szybko";
  return `${pool}, ${precision}, ${SORT_LABELS[strategy.sortKey]}`;
}

function statusTone(status: WorkerStatus): "info" | "success" | "error" {
  if (status === "done") return "success";
  if (status === "error" || status === "cancelled") return "error";
  return "info";
}

export function SolverPanel({
  startWord,
  maxAttempts,
  answerCount,
  status,
  progress,
  result,
  message,
  strategy,
  canStart,
  onStartWordChange,
  onMaxAttemptsChange,
  onStart,
  onStop,
}: SolverPanelProps) {
  const histogram = result?.histogram ?? emptyHistogram(maxAttempts);
  const maxCount = Math.max(1, ...histogram.map((bucket) => bucket.count));
  const progressPercent = Math.round(progress * 100);
  const statusText = message || (
    status === "running"
      ? `Liczenie ${progressPercent}%`
      : `${answerCount.toLocaleString("pl-PL")} haseł`
  );

  return (
    <section className="panel solver-panel">
      <div className="panel-header">
        <div>
          <h2>Solver startowy</h2>
          <p className={`solver-message ${statusTone(status)}`} aria-live="polite">{statusText}</p>
        </div>
        <div className="solver-actions">
          <button
            type="button"
            className="primary-button"
            onClick={onStart}
            disabled={!canStart || status === "running"}
          >
            Start
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onStop}
            disabled={status !== "running"}
          >
            Stop
          </button>
        </div>
      </div>

      <div className="solver-controls">
        <label className="solver-control">
          <span>Słowo startowe</span>
          <input
            value={startWord.toLocaleUpperCase("pl-PL")}
            maxLength={5}
            onChange={(event) => onStartWordChange(event.target.value)}
            placeholder="np. STARE"
          />
        </label>
        <label className="solver-control compact">
          <span>Limit prób</span>
          <input
            type="number"
            min={1}
            value={maxAttempts}
            onChange={(event) => onMaxAttemptsChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="solver-strategy">
        <span>Strategia</span>
        <strong>{strategyLabel(strategy)}</strong>
      </div>

      <div className="solver-histogram" role="list" aria-label="Histogram prób solvera">
        {histogram.map((bucket) => {
          const width = `${Math.max(2, (bucket.count / maxCount) * 100)}%`;
          return (
            <div
              className={bucket.attempts === "unsolved" ? "solver-bar unresolved" : "solver-bar"}
              key={bucket.label}
              role="listitem"
              aria-label={`${bucket.label}: ${bucket.count.toLocaleString("pl-PL")} haseł`}
            >
              <span className="solver-bar-label">{bucket.label}</span>
              <div className="solver-bar-track">
                <div className="solver-bar-fill" style={{ width }} />
              </div>
              <strong>{bucket.count.toLocaleString("pl-PL")}</strong>
              <small>{formatPercent(bucket.percentage)}%</small>
            </div>
          );
        })}
      </div>

      {result ? (
        <div className="solver-summary">
          <span>Rozwiązane <strong>{result.solvedAnswers.toLocaleString("pl-PL")}</strong></span>
          <span>Nierozwiązane <strong>{result.unsolvedAnswers.toLocaleString("pl-PL")}</strong></span>
          <span>Średnio <strong>{formatAverage(result.averageAttempts)}</strong></span>
        </div>
      ) : null}
    </section>
  );
}
