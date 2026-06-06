import type { AnalysisStep, Guess, MoveScore, Word } from "../types/wordle";
import { formatWord, patternToString } from "../domain/wordle";

interface GameSummaryProps {
  guesses: Guess[];
  steps: AnalysisStep[];
  candidateCount: number;
  bestMove?: MoveScore;
  onPickWord: (word: Word) => void;
  onSelectStep: (index: number) => void;
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`;
}

export function GameSummary({ guesses, steps, candidateCount, bestMove, onPickWord, onSelectStep }: GameSummaryProps) {
  return (
    <section className="panel summary-panel">
      <div className="panel-header">
        <div>
          <h2>Stan gry</h2>
          <p>{guesses.length} / 6 ruchów</p>
        </div>
        <strong className="candidate-badge">{candidateCount.toLocaleString("pl-PL")} słów</strong>
      </div>
      <div className="metric-grid wide">
        <div className="metric-box">
          <small>Kandydaci</small>
          <strong>{candidateCount.toLocaleString("pl-PL")}</strong>
        </div>
        <button
          className="metric-box metric-button"
          type="button"
          disabled={!bestMove}
          onClick={() => {
            if (bestMove) onPickWord(bestMove.word);
          }}
        >
          <small>Najlepszy ruch</small>
          <strong>{bestMove ? formatWord(bestMove.word) : "—"}</strong>
        </button>
        <div className="metric-box">
          <small>Entropia</small>
          <strong>{bestMove ? bestMove.entropy.toFixed(3) : "—"}</strong>
        </div>
        <div className="metric-box">
          <small>Max bucket</small>
          <strong>{bestMove ? bestMove.worstBucket.toLocaleString("pl-PL") : "—"}</strong>
        </div>
        <div className="metric-box">
          <small>Śr. bucket</small>
          <strong>{bestMove ? bestMove.averageBucket.toFixed(1) : "—"}</strong>
        </div>
        <div className="metric-box">
          <small>P(hit)</small>
          <strong>{bestMove ? formatPercent(bestMove.hitProbability * 100) : "—"}</strong>
        </div>
      </div>
      <div className="step-list">
        {steps.length ? steps.map((step, index) => (
          <button
            type="button"
            className="step-item"
            key={`${step.guess.word}-${index}`}
            onClick={() => onSelectStep(index)}
            title="Cofnij strategię do tego etapu"
          >
            <span>
              {index + 1}. {formatWord(step.guess.word)} <small>{patternToString(step.guess.pattern)}</small>
              <small> redukcja {formatPercent(step.reductionPercent)} · luck {Math.round(step.luckScore)}</small>
            </span>
            <strong>{step.countAfter.toLocaleString("pl-PL")}</strong>
          </button>
        )) : <p className="empty-copy">Brak ruchów.</p>}
      </div>
    </section>
  );
}
