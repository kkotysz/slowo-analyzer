import type { AnalysisStep, Guess, MoveScore } from "../types/wordle";
import { formatWord, patternToString } from "../domain/wordle";

interface GameSummaryProps {
  guesses: Guess[];
  steps: AnalysisStep[];
  candidateCount: number;
  currentMove?: MoveScore;
  onSelectStep: (index: number) => void;
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`;
}

function formatAttempts(move?: MoveScore): string {
  const metric = move?.turnsMetric;
  if (!metric || metric.averageAttempts === null) return "—";
  const value = metric.averageAttempts.toLocaleString("pl-PL", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  return metric.status === "estimated" ? `~${value}` : value;
}

export function GameSummary({ guesses, steps, candidateCount, currentMove, onSelectStep }: GameSummaryProps) {
  const turnsMetric = currentMove?.turnsMetric;

  return (
    <section className="panel summary-panel">
      <div className="panel-header">
        <div>
          <h2>Stan gry</h2>
          <p>
            {currentMove
              ? `${guesses.length} / 6 ruchów · ocena ${formatWord(currentMove.word)}`
              : `${guesses.length} / 6 ruchów · dodaj pierwszy ruch`}
          </p>
        </div>
        <strong className="candidate-badge">{candidateCount.toLocaleString("pl-PL")} słów</strong>
      </div>
      <div className="metric-grid wide">
        <div className="metric-box">
          <small>Kandydaci</small>
          <strong>{candidateCount.toLocaleString("pl-PL")}</strong>
        </div>
        <div className="metric-box">
          <small>Entropia</small>
          <strong>{currentMove ? currentMove.entropy.toFixed(3) : "—"}</strong>
        </div>
        <div className="metric-box">
          <small>Max bucket</small>
          <strong>{currentMove ? currentMove.worstBucket.toLocaleString("pl-PL") : "—"}</strong>
        </div>
        <div className="metric-box">
          <small>Śr. bucket</small>
          <strong>{currentMove ? currentMove.averageBucket.toFixed(1) : "—"}</strong>
        </div>
        <div className="metric-box">
          <small>P(hit)</small>
          <strong>{currentMove ? formatPercent(currentMove.hitProbability * 100) : "—"}</strong>
        </div>
        <div className="metric-box">
          <small>Śr. ruchy</small>
          <strong>{formatAttempts(currentMove)}</strong>
          <span className="metric-note">
            {turnsMetric?.status === "simulated" && turnsMetric.solveRate !== null
              ? `${formatPercent(turnsMetric.solveRate * 100)} w ≤6`
              : turnsMetric ? "estymacja" : "—"}
          </span>
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
