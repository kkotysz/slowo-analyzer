import type { MoveScore, RankingSortKey, Word } from "../types/wordle";
import { formatWord } from "../domain/wordle";

interface BestMovesPanelProps {
  moves: MoveScore[];
  status: "idle" | "running" | "done" | "error" | "cancelled";
  progress: number;
  candidateOnly: boolean;
  exactRanking: boolean;
  sortKey: RankingSortKey;
  inspectedWord?: Word;
  onCandidateOnlyChange: (value: boolean) => void;
  onExactRankingChange: (value: boolean) => void;
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

const SORTABLE_COLUMNS: Array<{ key: RankingSortKey; label: string; shortLabel: string }> = [
  { key: "entropy", label: "Entropia", shortLabel: "Entropia" },
  { key: "worstBucket", label: "Max bucket", shortLabel: "Max" },
  { key: "averageBucket", label: "Średni bucket", shortLabel: "Śr." },
  { key: "hitProbability", label: "Prawdopodobieństwo trafienia", shortLabel: "P(hit)" },
];

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
  sortKey,
  inspectedWord,
  onCandidateOnlyChange,
  onExactRankingChange,
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
        </div>
      </div>
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
        {moves.map((move, index) => (
          <button
            className={move.word === inspectedWord ? "move-row inspected" : "move-row"}
            type="button"
            key={move.word}
            aria-current={move.word === inspectedWord ? "true" : undefined}
            onFocus={() => onInspectMove(move)}
            onMouseEnter={() => onInspectMove(move)}
            onPointerEnter={() => onInspectMove(move)}
            onClick={() => {
              onInspectMove(move);
              onPickWord(move.word);
            }}
          >
            <span className="rank">{index + 1}</span>
            <span className="move-word">
              {formatWord(move.word)}
              <small>{move.isCandidate ? "kandydat" : "info"}</small>
            </span>
            <span>{formatScore(move.entropy, 3)}</span>
            <span>{move.worstBucket.toLocaleString("pl-PL")}</span>
            <span>{formatScore(move.averageBucket, 1)}</span>
            <span>{formatScore(move.hitProbability * 100, 1)}%</span>
          </button>
        ))}
      </div>
    </section>
  );
}
