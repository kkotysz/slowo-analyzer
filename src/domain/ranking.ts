import type { MoveScore, RankingSortKey, Word } from "../types/wordle";
import { scoreMove } from "./analysis";

const MAX_INFO_GUESSES_WHEN_WIDE = 900;
const MAX_CANDIDATE_GUESSES_WHEN_WIDE = 700;

export function compareMoveScores(a: MoveScore, b: MoveScore, sortKey: RankingSortKey = "entropy"): number {
  const stableFallback = (
    b.entropy - a.entropy ||
    a.averageBucket - b.averageBucket ||
    a.worstBucket - b.worstBucket ||
    Number(b.isCandidate) - Number(a.isCandidate) ||
    a.word.localeCompare(b.word, "pl")
  );

  if (sortKey === "worstBucket") {
    return a.worstBucket - b.worstBucket || stableFallback;
  }
  if (sortKey === "averageBucket") {
    return a.averageBucket - b.averageBucket || stableFallback;
  }
  if (sortKey === "hitProbability") {
    return b.hitProbability - a.hitProbability || stableFallback;
  }
  if (sortKey === "candidateFirst") {
    return Number(b.isCandidate) - Number(a.isCandidate) || stableFallback;
  }

  return stableFallback;
}

export function rankByLetterHeuristic(pool: readonly Word[], candidates: readonly Word[], limit: number): Word[] {
  const frequency = new Map<string, number>();

  for (const candidate of candidates) {
    for (const char of new Set(candidate)) {
      frequency.set(char, (frequency.get(char) ?? 0) + 1);
    }
  }

  return [...pool]
    .map((word) => {
      const unique = new Set(word);
      let score = 0;
      for (const char of unique) score += frequency.get(char) ?? 0;
      score += unique.size / 100;
      return { word, score };
    })
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, "pl"))
    .slice(0, limit)
    .map((item) => item.word);
}

export function buildRankingPool(
  allowedGuesses: readonly Word[],
  candidates: readonly Word[],
  candidateOnly: boolean,
  exact = false,
): Word[] {
  if (candidateOnly) {
    return !exact && candidates.length > MAX_CANDIDATE_GUESSES_WHEN_WIDE
      ? rankByLetterHeuristic(candidates, candidates, MAX_CANDIDATE_GUESSES_WHEN_WIDE)
      : [...candidates];
  }

  const pool = new Set<Word>();
  const candidateWords = !exact && candidates.length > MAX_CANDIDATE_GUESSES_WHEN_WIDE
    ? rankByLetterHeuristic(candidates, candidates, MAX_CANDIDATE_GUESSES_WHEN_WIDE)
    : candidates;
  const infoWords = !exact && candidates.length > 350
    ? rankByLetterHeuristic(allowedGuesses, candidates, MAX_INFO_GUESSES_WHEN_WIDE)
    : allowedGuesses;

  for (const word of candidateWords) pool.add(word);
  for (const word of infoWords) pool.add(word);

  return [...pool];
}

export function rankMoves(
  allowedGuesses: readonly Word[],
  candidates: readonly Word[],
  options: { limit: number; candidateOnly: boolean; sortKey?: RankingSortKey; exact?: boolean },
): MoveScore[] {
  if (!candidates.length) return [];

  return buildRankingPool(allowedGuesses, candidates, options.candidateOnly, options.exact)
    .map((word) => scoreMove(word, candidates))
    .sort((a, b) => compareMoveScores(a, b, options.sortKey))
    .slice(0, options.limit);
}
