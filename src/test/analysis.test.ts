import { describe, expect, it } from "vitest";
import { analyzeGame, scoreMove } from "../domain/analysis";
import { compareMoveScores, rankMoves } from "../domain/ranking";
import { stringToPattern } from "../domain/wordle";

describe("analysis", () => {
  const words = ["trefl", "trela", "trwać", "stare", "krety"];

  it("tracks candidates after every move", () => {
    const steps = analyzeGame(
      [{ word: "trefl", pattern: stringToPattern("GGGGG") }],
      words,
    );

    expect(steps).toHaveLength(1);
    expect(steps[0].countAfter).toBe(1);
    expect(steps[0].candidatesAfter).toEqual(["trefl"]);
  });

  it("computes entropy and bucket metrics", () => {
    const score = scoreMove("stare", words);

    expect(score.entropy).toBeGreaterThan(0);
    expect(score.averageBucket).toBeGreaterThanOrEqual(1);
    expect(score.worstBucket).toBeGreaterThanOrEqual(1);
    expect(score.hitProbability).toBe(1 / words.length);
    expect(score.buckets).not.toEqual({});
  });

  it("ranks moves with candidate and information words", () => {
    const moves = rankMoves(words, words.slice(0, 3), { limit: 3, candidateOnly: false });

    expect(moves).toHaveLength(3);
    expect(moves[0].entropy).toBeGreaterThanOrEqual(moves[1].entropy);
  });

  it("sorts average attempts by solve rate before the solved-only average", () => {
    const reliable = {
      ...scoreMove("stare", words),
      turnsMetric: {
        averageAttempts: 4.2,
        solveRate: 1,
        solvedAnswers: 5,
        totalAnswers: 5,
        status: "simulated" as const,
      },
    };
    const deceptivelyFast = {
      ...scoreMove("krety", words),
      turnsMetric: {
        averageAttempts: 2.5,
        solveRate: 0.8,
        solvedAnswers: 4,
        totalAnswers: 5,
        status: "simulated" as const,
      },
    };

    expect(compareMoveScores(reliable, deceptivelyFast, "averageAttempts")).toBeLessThan(0);
  });
});
