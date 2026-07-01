import { describe, expect, it } from "vitest";
import {
  estimateAverageAttempts,
  estimateTurnsMetric,
  evaluateMove,
  pickSolverMove,
  simulateSolverHistogram,
  solveState,
  turnsMetricFromSolverResult,
} from "../domain/solver";
import { scoreMove } from "../domain/analysis";
import type { SolverStrategySnapshot } from "../types/wordle";

describe("solver", () => {
  const words = ["trefl", "trela", "stare", "krety"];
  const strategy: SolverStrategySnapshot = {
    candidateOnly: true,
    exact: true,
    sortKey: "entropy",
  };

  it("returns a bounded expected-turn estimate with a best move", () => {
    const result = solveState(words.slice(0, 2), words, { depth: 1, branchLimit: 4 });

    expect(result.expectedTurns).toBeGreaterThanOrEqual(1);
    expect(result.worstCaseTurns).toBeGreaterThanOrEqual(1);
    expect(result.bestMove?.word).toBeTruthy();
  });

  it("computes a skill and luck score for a chosen move", () => {
    const bestMove = scoreMove("stare", words);
    const chosenMove = scoreMove("krety", words);
    const evaluation = evaluateMove(chosenMove, bestMove, 72);

    expect(evaluation.skillScore).toBeGreaterThanOrEqual(0);
    expect(evaluation.skillScore).toBeLessThanOrEqual(100);
    expect(evaluation.luckScore).toBe(72);
  });

  it("counts the start word as attempt one and keeps unresolved answers in the overflow bucket", async () => {
    const result = await simulateSolverHistogram(["stare", "trefl"], words, {
      startWord: "stare",
      maxAttempts: 1,
      strategy,
    });

    expect(result.histogram.find((bucket) => bucket.attempts === 1)?.count).toBe(1);
    expect(result.histogram.find((bucket) => bucket.attempts === "unsolved")?.count).toBe(1);
    expect(result.processedAnswers).toBe(2);
  });

  it("solves a one-candidate bucket with that candidate on the next attempt", async () => {
    const result = await simulateSolverHistogram(["stare", "trefl"], words, {
      startWord: "stare",
      maxAttempts: 2,
      strategy,
    });

    expect(result.histogram.find((bucket) => bucket.attempts === 1)?.count).toBe(1);
    expect(result.histogram.find((bucket) => bucket.attempts === 2)?.count).toBe(1);
    expect(result.unsolvedAnswers).toBe(0);
  });

  it("keeps histogram counts equal to the tested answer count", async () => {
    const result = await simulateSolverHistogram(["stare", "trefl", "trela"], words, {
      startWord: "stare",
      maxAttempts: 3,
      strategy,
    });

    const total = result.histogram.reduce((sum, bucket) => sum + bucket.count, 0);
    expect(total).toBe(3);
    expect(result.totalAnswers).toBe(3);
  });

  it("estimates turns from buckets and skips the solved bucket", () => {
    const move = scoreMove("stare", ["stare", "trefl", "trela"]);
    const metric = estimateTurnsMetric(move, 3);
    const entries = Object.entries(move.buckets);
    const solvedIndex = entries.findIndex(([pattern]) => pattern === "GGGGG");
    const directEstimate = estimateAverageAttempts([1, 2], 3, 0);

    expect(metric.status).toBe("estimated");
    expect(metric.solveRate).toBeNull();
    expect(metric.averageAttempts).toBeCloseTo(estimateAverageAttempts(
      entries.map(([, count]) => count),
      3,
      solvedIndex,
    ));
    expect(directEstimate).toBeCloseTo(7 / 3);
  });

  it("builds a simulated turns metric with solve rate under the hard limit", async () => {
    const result = await simulateSolverHistogram(["stare", "trefl"], words, {
      startWord: "stare",
      maxAttempts: 1,
      strategy,
    });
    const metric = turnsMetricFromSolverResult(result);

    expect(metric.status).toBe("simulated");
    expect(metric.averageAttempts).toBe(1);
    expect(metric.solveRate).toBe(0.5);
    expect(metric.solvedAnswers).toBe(1);
    expect(metric.totalAnswers).toBe(2);
  });

  it("uses the configured strategy and avoids repeated non-terminal moves", async () => {
    const chosenMove = pickSolverMove({
      candidates: ["trefl", "trela"],
      allowedGuesses: ["trefl", "trela", "stare"],
      usedWords: new Set(["trefl"]),
      strategy,
    });
    const result = await simulateSolverHistogram(["stare"], words, {
      startWord: "stare",
      maxAttempts: 2,
      strategy: {
        candidateOnly: false,
        exact: false,
        sortKey: "worstBucket",
      },
    });

    expect(chosenMove).toBe("trela");
    expect(result.strategy).toEqual({
      candidateOnly: false,
      exact: false,
      sortKey: "worstBucket",
    });
  });
});
