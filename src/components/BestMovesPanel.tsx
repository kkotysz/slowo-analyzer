import type { MoveScore, RankingSortKey, Word } from "../types/wordle";
import { formatWord } from "../domain/wordle";

interface BestMovesPanelProps {
  moves: MoveScore[];
  status: "idle" | "running" | "done" | "error" | "cancelled";
  progress: number;
  candidateOnly: boolean;
  exactRanking: boolean;
  compact?: boolean;
  hideUnlikelyAnswers: boolean;
  sortKey: RankingSortKey;
  inspectedWord?: Word;
  onCandidateOnlyChange: (value: boolean) => void;
  onExactRankingChange: (value: boolean) => void;
  onHideUnlikelyAnswersChange: (value: boolean) => void;
  onSortKeyChange: (value: RankingSortKey) => void;
  onPickWord: (word: Word) => void;
  onInspectMove: (move: MoveScore) => void;
}

function formatScore(value: number, digits = 2): string {
  return value.toLocaleString("pl-PL", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function unlikelyMoveTitle(move: MoveScore): string | undefined {
  if (move.likelihood !== "unlikely") return undefined;
  const lemmas = move.lemmas?.length ? `: ${move.lemmas.join(", ")}` : "";
  return `Odmiana${lemmas}`;
}

const SORTABLE_COLUMNS: Array<{ key: RankingSortKey; label: string; shortLabel: string }> = [
  { key: "entropy", label: "Entropia", shortLabel: "Entropia" },
  { key: "worstBucket", label: "Max bucket", shortLabel: "Max" },
  { key: "averageBucket", label: "Średni bucket", shortLabel: "Śr." },
  { key: "hitProbability", label: "Prawdopodobieństwo trafienia", shortLabel: "P(hit)" },
  { key: "averageAttempts", label: "Średnia liczba ruchów", shortLabel: "Ruchy" },
];

function formatAttempts(move: MoveScore): string {
  const metric = move.turnsMetric;
  if (!metric || metric.averageAttempts === null) return "—";
  const value = formatScore(metric.averageAttempts, 2);
  return metric.status === "estimated" ? `~${value}` : value;
}

function SortHeader({
  column,
  active,
  onSortKeyChange,
}: {
  column: { key: RankingSortKey; label: string; shortLabel: string };
  active: boolean;
  onSortKeyChange: (value: RankingSortKey) => void;
}) {
  return (
    <button
      className={active ? "sort-head active" : "sort-head"}
      type="button"
      aria-label={`Sortuj po: ${column.label}`}
      aria-pressed={active}
      onClick={() => onSortKeyChange(column.key)}
      title={`Sortuj po: ${column.label}`}
    >
      <span>{column.shortLabel}</span>
      <span className="sort-indicator">{active ? "↓" : ""}</span>
    </button>
  );
}

export function BestMovesPanel({
  moves,
  status,
  progress,
  candidateOnly,
  exactRanking,
  compact = false,
  hideUnlikelyAnswers,
  sortKey,
  inspectedWord,
  onCandidateOnlyChange,
  onExactRankingChange,
  onHideUnlikelyAnswersChange,
  onSortKeyChange,
  onPickWord,
  onInspectMove,
}: BestMovesPanelProps) {
  return (
    <section className="panel moves-panel">
      <div className="panel-header">
        <div>
          <h2>Najlepsze następne ruchy</h2>
          <p>{status === "running" ? `Liczenie ${Math.round(progress * 100)}%` : `${moves.length} rekomendacji`}</p>
        </div>
        <div className="panel-actions">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={candidateOnly}
              onChange={(event) => onCandidateOnlyChange(event.target.checked)}
            />
            <span>Tylko kandydaci</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={exactRanking}
              onChange={(event) => onExactRankingChange(event.target.checked)}
            />
            <span>Dokładnie</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={hideUnlikelyAnswers}
              onChange={(event) => onHideUnlikelyAnswersChange(event.target.checked)}
            />
            <span>Ukryj unlikely</span>
          </label>
        </div>
      </div>
      {compact ? (
        <div className="mobile-ranking-sort" role="group" aria-label="Sortowanie rankingu">
          {SORTABLE_COLUMNS.map((column) => (
            <button
              type="button"
              className={sortKey === column.key ? "active" : ""}
              aria-pressed={sortKey === column.key}
              key={column.key}
              onClick={() => onSortKeyChange(column.key)}
            >
              {column.shortLabel}
            </button>
          ))}
        </div>
      ) : null}
      <div className="move-table" role="table" aria-label="Ranking ruchów">
        <div className="move-row move-head" role="row">
          <span>#</span>
          <span>Słowo</span>
          {SORTABLE_COLUMNS.map((column) => (
            <SortHeader
              active={sortKey === column.key}
              column={column}
              key={column.key}
              onSortKeyChange={onSortKeyChange}
            />
          ))}
        </div>
        {moves.map((move, index) => {
          const unlikely = move.likelihood === "unlikely";
          return (
            <div
              className={move.word === inspectedWord ? "move-row-shell inspected" : "move-row-shell"}
              key={move.word}
            >
              <button
                className={move.word === inspectedWord ? "move-row inspected" : "move-row"}
                type="button"
                aria-current={move.word === inspectedWord ? "true" : undefined}
                title={unlikelyMoveTitle(move)}
                onFocus={() => onInspectMove(move)}
                onMouseEnter={() => onInspectMove(move)}
                onPointerEnter={() => onInspectMove(move)}
                onClick={() => {
                  onInspectMove(move);
                  onPickWord(move.word);
                }}
              >
                <span className="rank">{index + 1}</span>
                <span className={unlikely ? "move-word unlikely" : "move-word"}>
                  {formatWord(move.word)}
                  <small>{unlikely ? "odmiana" : move.isCandidate ? "kandydat" : "info"}</small>
                </span>
                <span>{formatScore(move.entropy, 3)}</span>
                <span>{move.worstBucket.toLocaleString("pl-PL")}</span>
                <span>{formatScore(move.averageBucket, 1)}</span>
                <span>{formatScore(move.hitProbability * 100, 1)}%</span>
                <span className="turns-cell">
                  <span>{formatAttempts(move)}</span>
                  <small>
                    {move.turnsMetric?.status === "simulated" && move.turnsMetric.solveRate !== null
                      ? `${formatScore(move.turnsMetric.solveRate * 100, 0)}%`
                      : "est."}
                  </small>
                </span>
              </button>
              {compact ? (
                <button
                  type="button"
                  className="move-inspect-button"
                  aria-label={`Pokaż szczegóły ${formatWord(move.word)}`}
                  aria-pressed={move.word === inspectedWord}
                  onClick={() => onInspectMove(move)}
                >
                  i
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
