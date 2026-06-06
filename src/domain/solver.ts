import type { MoveEvaluation, MoveScore, SolverResult, Word } from "../types/wordle";
import { rankMoves } from "./ranking";
import { patternToString, scoreGuess } from "./wordle";

const DEFAULT_BRANCH_LIMIT = 10;

function stateKey(candidates: readonly Word[], depth: number): string {
  return `${depth}:${[...candidates].sort((a, b) => a.localeCompare(b, "pl")).join(",")}`;
}

function bucketCandidates(move: Word, candidates: readonly Word[]): Map<string, Word[]> {
  const buckets = new Map<string, Word[]>();
  for (const answer of candidates) {
    const pattern = patternToString(scoreGuess(move, answer));
    const bucket = buckets.get(pattern);
    if (bucket) bucket.push(answer);
    else buckets.set(pattern, [answer]);
  }
  return buckets;
}

function terminalEstimate(candidates: number): number {
  if (candidates <= 0) return 0;
  if (candidates === 1) return 1;
  return 1 + Math.log2(candidates);
}

export function solveState(
  candidates: readonly Word[],
  allowedGuesses: readonly Word[],
  options: { depth?: number; branchLimit?: number; memo?: Map<string, SolverResult> } = {},
): SolverResult {
  const depth = Math.max(0, options.depth ?? 1);
  const memo = options.memo ?? new Map<string, SolverResult>();
  const key = stateKey(candidates, depth);
  const cached = memo.get(key);
  if (cached) return cached;

  if (candidates.length <= 1) {
    const result: SolverResult = {
      candidates: candidates.length,
      depth,
      expectedTurns: candidates.length,
      worstCaseTurns: candidates.length,
      bestMove: candidates[0]
        ? rankMoves(allowedGuesses, candidates, { limit: 1, candidateOnly: true, exact: true })[0]
        : undefined,
    };
    memo.set(key, result);
    return result;
  }

  const branchLimit = options.branchLimit ?? DEFAULT_BRANCH_LIMIT;
  const moves = rankMoves(allowedGuesses, candidates, {
    limit: branchLimit,
    candidateOnly: false,
    exact: candidates.length <= 60,
  });

  let best: SolverResult | null = null;
  let bestMove: MoveScore | undefined;

  for (const move of moves) {
    const buckets = bucketCandidates(move.word, candidates);
    let expectedAfterMove = 1;
    let worstAfterMove = 1;

    for (const [pattern, bucket] of buckets) {
      if (pattern === "GGGGG") continue;

      const future = depth > 0
        ? solveState(bucket, allowedGuesses, { depth: depth - 1, branchLimit, memo })
        : {
            expectedTurns: terminalEstimate(bucket.length),
            worstCaseTurns: bucket.length,
          };
      expectedAfterMove += (bucket.length / candidates.length) * future.expectedTurns;
      worstAfterMove = Math.max(worstAfterMove, 1 + future.worstCaseTurns);
    }

    if (!best || expectedAfterMove < best.expectedTurns || (
      expectedAfterMove === best.expectedTurns && move.worstBucket < (bestMove?.worstBucket ?? Number.POSITIVE_INFINITY)
    )) {
      bestMove = move;
      best = {
        candidates: candidates.length,
        depth,
        expectedTurns: expectedAfterMove,
        worstCaseTurns: worstAfterMove,
        bestMove,
      };
    }
  }

  const result = best ?? {
    candidates: candidates.length,
    depth,
    expectedTurns: terminalEstimate(candidates.length),
    worstCaseTurns: candidates.length,
  };
  memo.set(key, result);
  return result;
}

export function evaluateMove(
  chosenMove: MoveScore | undefined,
  bestMove: MoveScore | undefined,
  luckScore: number,
): MoveEvaluation {
  if (!chosenMove || !bestMove) {
    return { skillScore: 0, luckScore, chosenMove, bestMove };
  }

  const entropyRatio = bestMove.entropy > 0 ? chosenMove.entropy / bestMove.entropy : 1;
  const worstRatio = chosenMove.worstBucket > 0 ? bestMove.worstBucket / chosenMove.worstBucket : 1;
  const skillScore = Math.max(0, Math.min(100, ((entropyRatio * 0.7) + (worstRatio * 0.3)) * 100));

  return {
    skillScore,
    luckScore,
    chosenMove,
    bestMove,
  };
}
