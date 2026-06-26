import type {
  MoveEvaluation,
  MoveScore,
  SolverHistogramBucket,
  SolverHistogramResult,
  SolverResult,
  SolverStrategySnapshot,
  Word,
} from "../types/wordle";
import { scoreMove } from "./analysis";
import { buildRankingPool, compareMoveScores, rankMoves } from "./ranking";
import { patternToString, scoreGuess } from "./wordle";

const DEFAULT_BRANCH_LIMIT = 10;
const PROGRESS_STEP = 0.025;

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

export class SolverSimulationCancelledError extends Error {
  constructor() {
    super("Solver simulation cancelled");
    this.name = "SolverSimulationCancelledError";
  }
}

export interface SolverMovePickerInput {
  candidates: readonly Word[];
  allowedGuesses: readonly Word[];
  usedWords: ReadonlySet<Word>;
  strategy: SolverStrategySnapshot;
}

export type SolverMovePicker = (input: SolverMovePickerInput) => Word | undefined;

export interface SolverSimulationOptions {
  onProgress?: (result: SolverHistogramResult) => void | Promise<void>;
  shouldCancel?: () => boolean;
  pickMove?: SolverMovePicker;
}

interface SolverTreeState {
  candidates: readonly Word[];
  guess: Word;
  attempt: number;
  usedWords: readonly Word[];
}

function createHistogramBucket(attempts: number | "unsolved", label: string, count: number, total: number): SolverHistogramBucket {
  return {
    attempts,
    label,
    count,
    percentage: total > 0 ? (count / total) * 100 : 0,
  };
}

function createSolverHistogramResult(
  startWord: Word,
  maxAttempts: number,
  totalAnswers: number,
  processedAnswers: number,
  solvedTurnSum: number,
  solvedCounts: readonly number[],
  unsolvedAnswers: number,
  strategy: SolverStrategySnapshot,
): SolverHistogramResult {
  const solvedAnswers = processedAnswers - unsolvedAnswers;
  const histogram = Array.from({ length: maxAttempts }, (_, index) => {
    const attempt = index + 1;
    return createHistogramBucket(attempt, String(attempt), solvedCounts[attempt] ?? 0, totalAnswers);
  });

  histogram.push(createHistogramBucket("unsolved", `>${maxAttempts}`, unsolvedAnswers, totalAnswers));

  return {
    startWord,
    maxAttempts,
    totalAnswers,
    processedAnswers,
    solvedAnswers,
    unsolvedAnswers,
    averageAttempts: solvedAnswers > 0 ? solvedTurnSum / solvedAnswers : 0,
    strategy,
    histogram,
  };
}

function addUsedWord(usedWords: readonly Word[], word: Word): Word[] {
  return usedWords.includes(word) ? [...usedWords] : [...usedWords, word];
}

export function pickSolverMove({
  candidates,
  allowedGuesses,
  usedWords,
  strategy,
}: SolverMovePickerInput): Word | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const pool = buildRankingPool(allowedGuesses, candidates, strategy.candidateOnly, strategy.exact)
    .filter((word) => !usedWords.has(word));
  if (!pool.length) return candidates.find((word) => !usedWords.has(word));

  return pool
    .map((word) => scoreMove(word, candidates))
    .sort((a, b) => compareMoveScores(a, b, strategy.sortKey))[0]?.word;
}

export async function simulateSolverHistogram(
  answers: readonly Word[],
  allowedGuesses: readonly Word[],
  input: {
    startWord: Word;
    maxAttempts: number;
    strategy: SolverStrategySnapshot;
  },
  options: SolverSimulationOptions = {},
): Promise<SolverHistogramResult> {
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts));
  const totalAnswers = answers.length;
  const solvedCounts = Array<number>(maxAttempts + 1).fill(0);
  const states: SolverTreeState[] = [{
    candidates: [...answers],
    guess: input.startWord,
    attempt: 1,
    usedWords: [],
  }];
  let processedAnswers = 0;
  let solvedTurnSum = 0;
  let unsolvedAnswers = 0;
  let nextProgress = 0;

  const buildResult = () => createSolverHistogramResult(
    input.startWord,
    maxAttempts,
    totalAnswers,
    processedAnswers,
    solvedTurnSum,
    solvedCounts,
    unsolvedAnswers,
    input.strategy,
  );

  const reportProgress = async (force = false) => {
    if (!options.onProgress || totalAnswers === 0) return;
    const progress = processedAnswers / totalAnswers;
    if (!force && progress < nextProgress && processedAnswers < totalAnswers) return;
    nextProgress = Math.min(1, progress + PROGRESS_STEP);
    await options.onProgress(buildResult());
  };

  const assertNotCancelled = () => {
    if (options.shouldCancel?.()) throw new SolverSimulationCancelledError();
  };

  const recordSolved = async (attempt: number, count: number) => {
    solvedCounts[attempt] += count;
    solvedTurnSum += attempt * count;
    processedAnswers += count;
    await reportProgress();
  };

  const recordUnsolved = async (count: number) => {
    unsolvedAnswers += count;
    processedAnswers += count;
    await reportProgress();
  };

  await reportProgress(true);

  let stateIndex = 0;
  while (stateIndex < states.length) {
    assertNotCancelled();
    const state = states[stateIndex];
    stateIndex += 1;
    if (!state.candidates.length) continue;

    if (state.attempt > maxAttempts) {
      await recordUnsolved(state.candidates.length);
      continue;
    }

    const buckets = bucketCandidates(state.guess, state.candidates);
    const nextUsedWords = addUsedWord(state.usedWords, state.guess);
    const nextUsedSet = new Set(nextUsedWords);

    for (const [pattern, bucket] of buckets) {
      assertNotCancelled();

      if (pattern === "GGGGG") {
        await recordSolved(state.attempt, bucket.length);
        continue;
      }

      if (state.attempt >= maxAttempts) {
        await recordUnsolved(bucket.length);
        continue;
      }

      const nextGuess = bucket.length === 1
        ? bucket[0]
        : (options.pickMove ?? pickSolverMove)({
            candidates: bucket,
            allowedGuesses,
            usedWords: nextUsedSet,
            strategy: input.strategy,
          });

      if (!nextGuess) {
        await recordUnsolved(bucket.length);
        continue;
      }

      states.push({
        candidates: bucket,
        guess: nextGuess,
        attempt: state.attempt + 1,
        usedWords: nextUsedWords,
      });
    }
  }

  await reportProgress(true);
  return buildResult();
}
