import { beforeEach, describe, expect, it, vi } from "vitest";
import { DICTIONARY_VERSION } from "../domain/dictionaryMetadata";
import { isOpeningMoveRequest, readPrecomputedOpeningMoves } from "../domain/openingMoves";
import type { OpeningMoveRequest } from "../domain/openingMoves";
import type { MoveScore } from "../types/wordle";

function makeMove(word: string, isCandidate = true): MoveScore {
  return {
    word,
    entropy: 1,
    averageBucket: 1,
    worstBucket: 1,
    hitProbability: isCandidate ? 0.5 : 0,
    isCandidate,
    buckets: { GGGGG: 1 },
    bucketSummaries: [{ pattern: "GGGGG", count: 1, examples: [word], isCurrentBucket: isCandidate }],
  };
}

function makeRequest(candidateOnly: boolean, overrides: Partial<OpeningMoveRequest> = {}): OpeningMoveRequest {
  return {
    candidates: ["butik", "lampa"],
    allowedGuesses: ["audio", "butik", "lampa"],
    exact: true,
    candidateOnly,
    sortKey: "entropy",
    limit: 2,
    completeGuessCount: 0,
    dictionaryVersion: DICTIONARY_VERSION,
    ...overrides,
  };
}

describe("precomputed opening moves", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("matches opening state when guess and answer lists are separate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      dictionaryVersion: DICTIONARY_VERSION,
      guessCount: 3,
      answerCount: 2,
      likelyGuessCount: 2,
      likelyAnswerCount: 1,
      firstGuess: "audio",
      lastGuess: "lampa",
      firstLikelyGuess: "audio",
      lastLikelyGuess: "butik",
      firstAnswer: "butik",
      lastAnswer: "lampa",
      firstLikelyAnswer: "butik",
      lastLikelyAnswer: "butik",
      rankings: {
        candidateOnly: {
          entropy: [makeMove("lampa"), makeMove("butik")],
        },
        allMoves: {
          entropy: [makeMove("audio", false), makeMove("lampa")],
        },
      },
      likelyOnlyRankings: {
        candidateOnly: {
          entropy: [makeMove("butik")],
        },
        allMoves: {
          entropy: [makeMove("audio", false), makeMove("butik")],
        },
      },
    }), { status: 200 })));

    expect(isOpeningMoveRequest(makeRequest(true))).toBe(true);
    await expect(readPrecomputedOpeningMoves(makeRequest(true))).resolves.toEqual([
      expect.objectContaining({ word: "lampa", isCandidate: true }),
      expect.objectContaining({ word: "butik", isCandidate: true }),
    ]);
    await expect(readPrecomputedOpeningMoves(makeRequest(false))).resolves.toEqual([
      expect.objectContaining({ word: "audio", isCandidate: false }),
      expect.objectContaining({ word: "lampa", isCandidate: true }),
    ]);
    await expect(readPrecomputedOpeningMoves(makeRequest(true, {
      candidates: ["butik"],
      allowedGuesses: ["audio", "butik"],
      answerProfile: "likelyOnly",
      limit: 1,
    }))).resolves.toEqual([
      expect.objectContaining({ word: "butik", isCandidate: true }),
    ]);
  });
});
