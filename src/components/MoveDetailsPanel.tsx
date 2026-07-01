import type { AnalysisStep, BucketSummary, MoveDetailsStats, MoveScore } from "../types/wordle";
import { formatWord } from "../domain/wordle";

interface MoveDetailsPanelProps {
  compact?: boolean;
  move?: MoveScore;
  moveStats?: MoveDetailsStats;
  moveBuckets?: BucketSummary[];
  latestStep?: AnalysisStep;
}

function formatNumber(value: number): string {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`;
}

export function MoveDetailsPanel({
  compact = false,
  move,
  moveStats,
  moveBuckets,
  latestStep,
}: MoveDetailsPanelProps) {
  const bucketSummaries = moveBuckets ?? move?.bucketSummaries ?? [];

  const content = (
    <>
      <div className="panel-header">
        <div>
          <h2>Szczegóły ruchu</h2>
          <p>
            {move
              ? `${formatWord(move.word)} · ${move.bucketSummaries.length} największych bucketów`
              : latestStep
                ? `${formatWord(latestStep.guess.word)} · bucket ${latestStep.bucketPattern}`
                : "Wybierz ruch z rankingu albo dodaj próbę."}
          </p>
        </div>
      </div>

      {moveStats ? (
        <div className={`detail-strip ${moveStats.kind}`} key={`${move?.word ?? "move"}-${moveStats.bucketLabel}-${moveStats.countAfter}`}>
          <span>Przed <strong>{formatNumber(moveStats.countBefore)}</strong></span>
          <span>
            {moveStats.kind === "actual" ? "Po" : "Śr. po"}{" "}
            <strong>{formatNumber(moveStats.countAfter)}</strong>
          </span>
          <span>
            {moveStats.kind === "actual" ? "Bucket" : "Max"}{" "}
            <strong>{moveStats.bucketLabel}</strong>
          </span>
          <span>
            {moveStats.kind === "actual" ? "Luck" : "P(hit)"}{" "}
            <strong>
              {moveStats.kind === "actual"
                ? Math.round(moveStats.luckScore ?? 0)
                : formatPercent(moveStats.luckScore ?? 0)}
            </strong>
          </span>
        </div>
      ) : latestStep ? (
        <div className="detail-strip actual" key={`${latestStep.guess.word}-${latestStep.bucketPattern}`}>
          <span>Przed <strong>{formatNumber(latestStep.countBefore)}</strong></span>
          <span>Po <strong>{formatNumber(latestStep.countAfter)}</strong></span>
          <span>Bucket <strong>{latestStep.bucketPattern}</strong></span>
          <span>Luck <strong>{Math.round(latestStep.luckScore)}</strong></span>
        </div>
      ) : null}

      {move ? (
        <div className="bucket-list">
          {bucketSummaries.map((bucket) => (
            <div className={bucket.isCurrentBucket ? "bucket-item current" : "bucket-item"} key={bucket.pattern}>
              <div>
                <strong>{bucket.pattern}</strong>
                <span>{bucket.count.toLocaleString("pl-PL")} słów</span>
              </div>
              <small>{bucket.examples.length ? bucket.examples.map(formatWord).join(", ") : "Aktualny bucket"}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-copy">Najedź na rekomendację, żeby podejrzeć rozkład bucketów.</p>
      )}
    </>
  );

  if (compact) {
    return (
      <details className="panel move-details-panel mobile-move-details" open={Boolean(move)}>
        <summary>
          <span>Szczegóły ruchu</span>
          <strong>{move ? formatWord(move.word) : latestStep ? formatWord(latestStep.guess.word) : "Wybierz ruch"}</strong>
        </summary>
        <div className="mobile-move-details-content">{content}</div>
      </details>
    );
  }

  return <section className="panel move-details-panel">{content}</section>;
}
