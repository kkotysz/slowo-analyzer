import { describe, expect, it } from "vitest";
import { evaluateMove, solveState } from "../domain/solver";
import { scoreMove } from "../domain/analysis";

describe("solver", () => {
  const words = ["trefl", "trela", "stare", "krety"];

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
});
