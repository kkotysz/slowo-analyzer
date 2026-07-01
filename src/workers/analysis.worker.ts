import { encodeWord, PATTERN_COUNT, scoreEncodedGuessCode, SOLVED_PATTERN_CODE } from "../domain/fastScoring";
import type { EncodedWord } from "../domain/fastScoring";
import { DICTIONARY_VERSION } from "../domain/dictionaryMetadata";
import { buildRankingPool, compareMoveScores } from "../domain/ranking";
import {
  estimateAverageAttempts,
  simulateSolverHistogram,
  SolverSimulationCancelledError,
  turnsMetricFromSolverResult,
} from "../domain/solver";
import type { SolverMovePicker } from "../domain/solver";
import { codeToPatternString } from "../domain/wordle";
import { createPublicAssetUrl } from "../domain/publicAssets";
import type {
  MoveScore,
  PrecomputedOpeningMoves,
  TurnsMetric,
  WorkerAnalyzeRequest,
  WorkerAnalyzeResponse,
  WorkerEvaluateTurnsRequest,
  WorkerRankRequest,
  WorkerSolveRequest,
  Word,
} from "../types/wordle";

const OPENING_MOVES_URL = createPublicAssetUrl("opening-moves.json");
const RANKING_CACHE_LIMIT = 24;
const TURNS_CACHE_LIMIT = 256;
const BUCKET_SUMMARY_LIMIT = 8;
const BUCKET_EXAMPLE_LIMIT = 8;
const MAX_SOLVER_ATTEMPTS = 6;
const WIDE_TURNS_SHORTLIST_LIMIT = 48;
const NARROW_TURNS_SHORTLIST_LIMIT = 96;
const rankingCache = new Map<string, MoveScore[]>();
const turnsCache = new Map<string, TurnsMetric>();
let activeRequestId = 0;
let openingMovesPromise: Promise<PrecomputedOpeningMoves | null> | undefined;

interface RankingContext {
  candidates: readonly Word[];
  encodedCandidates: readonly EncodedWord[];
  candidateSet: ReadonlySet<Word>;
  bucketCounts: Uint32Array;
  remainingChars: Uint16Array;
  remainingCounts: Uint8Array;
}

function post(message: WorkerAnalyzeResponse): void {
  self.postMessage(message);
}

function createCachedEncoder(): (word: Word) => EncodedWord {
  const encodedCache = new Map<Word, EncodedWord>();

  return (word: Word): EncodedWord => {
    const cached = encodedCache.get(word);
    if (cached) return cached;
    const encoded = encodeWord(word);
    encodedCache.set(word, encoded);
    return encoded;
  };
}

function cacheKey(request: WorkerRankRequest): string {
  return [
    request.candidateOnly ? "c" : "a",
    request.exact ? "exact" : "fast",
    request.sortKey,
    request.answerProfile ?? "all",
    request.limit,
    request.candidates.join(","),
    request.allowedGuesses.length,
    request.dictionaryVersion ?? "",
  ].join("|");
}

function hashWords(words: readonly Word[]): string {
  let hash = 2166136261;
  for (const word of words) {
    for (let index = 0; index < word.length; index += 1) {
      hash ^= word.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 31;
    hash = Math.imul(hash, 16777619);
  }
  return `${words.length}:${hash >>> 0}`;
}

function turnsCacheKey(
  word: Word,
  candidates: readonly Word[],
  allowedGuesses: readonly Word[],
  candidateOnly: boolean,
  exact: boolean,
  dictionaryVersion?: string,
): string {
  return [
    word,
    candidateOnly ? "c" : "a",
    exact ? "exact" : "fast",
    dictionaryVersion ?? "",
    hashWords(candidates),
    hashWords(allowedGuesses),
  ].join("|");
}

function rememberTurns(key: string, metric: TurnsMetric): void {
  if (turnsCache.size >= TURNS_CACHE_LIMIT) {
    const oldest = turnsCache.keys().next().value;
    if (oldest) turnsCache.delete(oldest);
  }
  turnsCache.set(key, metric);
}

async function readOpeningMoves(): Promise<PrecomputedOpeningMoves | null> {
  if (!openingMovesPromise) {
    openingMovesPromise = fetch(OPENING_MOVES_URL, { cache: "force-cache" })
      .then((response) => (response.ok ? response.json() as Promise<PrecomputedOpeningMoves> : null))
      .catch(() => null);
  }
  return openingMovesPromise;
}

function requestMatchesOpening(request: WorkerRankRequest, openingMoves: PrecomputedOpeningMoves): boolean {
  const answerProfile = request.answerProfile ?? "all";
  const guessCount = answerProfile === "likelyOnly"
    ? openingMoves.likelyGuessCount
    : openingMoves.guessCount;
  const firstGuess = answerProfile === "likelyOnly"
    ? openingMoves.firstLikelyGuess
    : openingMoves.firstGuess;
  const lastGuess = answerProfile === "likelyOnly"
    ? openingMoves.lastLikelyGuess
    : openingMoves.lastGuess;
  const answerCount = answerProfile === "likelyOnly"
    ? openingMoves.likelyAnswerCount
    : openingMoves.answerCount;
  const firstAnswer = answerProfile === "likelyOnly"
    ? openingMoves.firstLikelyAnswer
    : openingMoves.firstAnswer;
  const lastAnswer = answerProfile === "likelyOnly"
    ? openingMoves.lastLikelyAnswer
    : openingMoves.lastAnswer;

  return Boolean(
    request.exact &&
    request.dictionaryVersion === DICTIONARY_VERSION &&
    openingMoves.dictionaryVersion === DICTIONARY_VERSION &&
    guessCount &&
    answerCount &&
    request.candidates.length === answerCount &&
    request.allowedGuesses.length === guessCount &&
    (!firstGuess || request.allowedGuesses[0] === firstGuess) &&
    (!lastGuess || request.allowedGuesses.at(-1) === lastGuess) &&
    request.candidates[0] === firstAnswer &&
    request.candidates.at(-1) === lastAnswer,
  );
}

async function readPrecomputedMoves(request: WorkerRankRequest): Promise<MoveScore[] | null> {
  if (!request.exact) return null;

  const openingMoves = await readOpeningMoves();
  if (!openingMoves || !requestMatchesOpening(request, openingMoves)) return null;

  const rankings = request.answerProfile === "likelyOnly"
    ? openingMoves.likelyOnlyRankings
    : openingMoves.rankings;
  const rankingGroup = request.candidateOnly ? rankings?.candidateOnly : rankings?.allMoves;
  if (!rankingGroup) return null;
  if (request.sortKey === "averageAttempts") {
    const byWord = new Map<Word, MoveScore>();
    for (const sortKey of ["entropy", "averageBucket", "worstBucket", "hitProbability"] as const) {
      for (const move of rankingGroup[sortKey] ?? []) byWord.set(move.word, move);
    }
    return [...byWord.values()];
  }
  const moves = rankingGroup[request.sortKey] ?? rankingGroup.entropy;
  return moves ? moves.slice(0, request.limit) : null;
}

function scoreMoveStats(word: Word, encodedWord: EncodedWord, context: RankingContext): MoveScore {
  const total = context.candidates.length;
  if (total === 0) {
    return {
      word,
      entropy: 0,
      averageBucket: 0,
      worstBucket: 0,
      hitProbability: 0,
      isCandidate: false,
      buckets: {},
      bucketSummaries: [],
    };
  }

  const bucketCounts = context.bucketCounts;
  bucketCounts.fill(0);

  for (const answer of context.encodedCandidates) {
    const code = scoreEncodedGuessCode(
      encodedWord,
      answer,
      context.remainingChars,
      context.remainingCounts,
    );
    bucketCounts[code] += 1;
  }

  let entropy = 0;
  let weightedBucketSize = 0;
  let worstBucket = 0;

  for (let code = 0; code < PATTERN_COUNT; code += 1) {
    const count = bucketCounts[code];
    if (!count) continue;
    const probability = count / total;
    entropy -= probability * Math.log2(probability);
    weightedBucketSize += count * count;
    worstBucket = Math.max(worstBucket, count);
  }

  const isCandidate = context.candidateSet.has(word);
  return {
    word,
    entropy,
    averageBucket: weightedBucketSize / total,
    worstBucket,
    hitProbability: isCandidate ? 1 / total : 0,
    isCandidate,
    buckets: {},
    bucketSummaries: [],
    turnsMetric: {
      averageAttempts: estimateAverageAttempts(bucketCounts, total, SOLVED_PATTERN_CODE),
      solveRate: null,
      solvedAnswers: 0,
      totalAnswers: total,
      status: "estimated",
    },
  };
}

function scoreMoveWithDetails(word: Word, encodedWord: EncodedWord, context: RankingContext): MoveScore {
  const score = scoreMoveStats(word, encodedWord, context);
  const bucketCounts = context.bucketCounts;
  const buckets: Record<string, number> = {};
  const rankedBuckets: Array<{ code: number; count: number; pattern: string }> = [];

  for (let code = 0; code < PATTERN_COUNT; code += 1) {
    const count = bucketCounts[code];
    if (!count) continue;
    const pattern = codeToPatternString(code);
    buckets[pattern] = count;
    rankedBuckets.push({ code, count, pattern });
  }

  const topBuckets = rankedBuckets
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
    .slice(0, BUCKET_SUMMARY_LIMIT);
  const bucketSummaries = topBuckets.map((bucket) => ({
    pattern: bucket.pattern,
    count: bucket.count,
    examples: [] as Word[],
    isCurrentBucket: bucket.code === SOLVED_PATTERN_CODE && score.isCandidate,
  }));
  const summaryIndexByCode = new Map(topBuckets.map((bucket, index) => [bucket.code, index]));
  let completeSummaryCount = 0;

  for (let index = 0; index < context.encodedCandidates.length && completeSummaryCount < bucketSummaries.length; index += 1) {
    const code = scoreEncodedGuessCode(
      encodedWord,
      context.encodedCandidates[index],
      context.remainingChars,
      context.remainingCounts,
    );
    const summaryIndex = summaryIndexByCode.get(code);
    if (summaryIndex === undefined) continue;

    const examples = bucketSummaries[summaryIndex].examples;
    if (examples.length >= BUCKET_EXAMPLE_LIMIT) continue;
    examples.push(context.candidates[index]);
    if (examples.length === BUCKET_EXAMPLE_LIMIT) completeSummaryCount += 1;
  }

  const currentBucket = bucketSummaries.find((bucket) => bucket.isCurrentBucket);

  return {
    ...score,
    buckets,
    bucketSummaries,
    currentBucket,
  };
}

function rememberRanking(key: string, moves: MoveScore[]): void {
  if (rankingCache.size >= RANKING_CACHE_LIMIT) {
    const oldest = rankingCache.keys().next().value;
    if (oldest) rankingCache.delete(oldest);
  }
  rankingCache.set(key, moves);
}

function createRankingContext(
  candidates: readonly Word[],
  encodeCached: (word: Word) => EncodedWord,
): RankingContext {
  return {
    candidates,
    encodedCandidates: candidates.map(encodeCached),
    candidateSet: new Set(candidates),
    bucketCounts: new Uint32Array(PATTERN_COUNT),
    remainingChars: new Uint16Array(5),
    remainingCounts: new Uint8Array(5),
  };
}

function withEstimatedTurns(
  move: MoveScore,
  encodedWord: EncodedWord,
  context: RankingContext,
): MoveScore {
  if (move.turnsMetric) return move;
  const scored = scoreMoveStats(move.word, encodedWord, context);
  return { ...move, turnsMetric: scored.turnsMetric };
}

function turnsShortlistLimit(candidateCount: number): number {
  return candidateCount > 200 ? WIDE_TURNS_SHORTLIST_LIMIT : NARROW_TURNS_SHORTLIST_LIMIT;
}

function withDetailedScore(
  move: MoveScore,
  encodeCached: (word: Word) => EncodedWord,
  context: RankingContext,
): MoveScore {
  const detailed = scoreMoveWithDetails(move.word, encodeCached(move.word), context);
  return {
    ...detailed,
    turnsMetric: move.turnsMetric ?? detailed.turnsMetric,
  };
}

async function simulateTurnsForWord(
  word: Word,
  candidates: readonly Word[],
  allowedGuesses: readonly Word[],
  candidateOnly: boolean,
  exact: boolean,
  dictionaryVersion: string | undefined,
  requestId: number,
  pickMove: SolverMovePicker,
  onProgress?: (progress: number) => void,
): Promise<TurnsMetric> {
  const key = turnsCacheKey(word, candidates, allowedGuesses, candidateOnly, exact, dictionaryVersion);
  const cached = turnsCache.get(key);
  if (cached) return cached;

  let nextYieldProgress = 0;
  const result = await simulateSolverHistogram(
    candidates,
    allowedGuesses,
    {
      startWord: word,
      maxAttempts: MAX_SOLVER_ATTEMPTS,
      strategy: {
        candidateOnly,
        exact,
        sortKey: "entropy",
      },
    },
    {
      pickMove,
      shouldCancel: () => requestId !== activeRequestId,
      onProgress: async (partial) => {
        const progress = partial.totalAnswers
          ? partial.processedAnswers / partial.totalAnswers
          : 1;
        onProgress?.(progress);
        if (progress >= nextYieldProgress) {
          nextYieldProgress = progress + 0.1;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      },
    },
  );
  const metric = turnsMetricFromSolverResult(result);
  rememberTurns(key, metric);
  return metric;
}

async function runRanking(request: WorkerRankRequest): Promise<void> {
  const key = cacheKey(request);
  const cached = rankingCache.get(key);
  if (cached) {
    post({ type: "done", requestId: request.requestId, moves: cached });
    return;
  }

  post({ type: "running", requestId: request.requestId, progress: 0 });

  const encodeCached = createCachedEncoder();
  const context = createRankingContext(request.candidates, encodeCached);
  const precomputed = request.precomputedMoves ?? await readPrecomputedMoves(request);
  let scored: MoveScore[];

  if (precomputed?.length) {
    scored = precomputed.map((move) => withEstimatedTurns(move, encodeCached(move.word), context));
  } else {
    const pool = buildRankingPool(request.allowedGuesses, request.candidates, request.candidateOnly, request.exact);
    scored = [];
    const progressStep = request.exact
      ? Math.max(1, Math.min(64, Math.floor(pool.length / 100)))
      : Math.max(1, Math.floor(pool.length / 20));

    for (let i = 0; i < pool.length; i += 1) {
      if (request.requestId !== activeRequestId) {
        post({ type: "cancelled", requestId: request.requestId });
        return;
      }

      scored.push(scoreMoveStats(pool[i], encodeCached(pool[i]), context));

      if (i > 0 && i % progressStep === 0) {
        post({
          type: "running",
          requestId: request.requestId,
          progress: Math.min(0.45, (i / pool.length) * 0.45),
          phase: "ranking",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  const shortlistLimit = request.sortKey === "averageAttempts"
    ? turnsShortlistLimit(request.candidates.length)
    : request.limit;
  const shortlist = [...scored]
    .sort((a, b) => compareMoveScores(a, b, request.sortKey))
    .slice(0, shortlistLimit);
  const stableDisplayWords = shortlist.slice(0, request.limit).map((move) => move.word);
  const moveByWord = new Map(shortlist.map((move) => [move.word, move]));
  const detailByWord = new Map<Word, MoveScore>();
  const detailedMove = (move: MoveScore) => {
    let detailed = detailByWord.get(move.word);
    if (!detailed) {
      detailed = withDetailedScore(move, encodeCached, context);
      detailByWord.set(move.word, detailed);
    }
    return { ...detailed, turnsMetric: move.turnsMetric };
  };
  const displayMoves = () => stableDisplayWords
    .map((word) => moveByWord.get(word))
    .filter((move): move is MoveScore => Boolean(move))
    .map(detailedMove);

  post({
    type: "running",
    requestId: request.requestId,
    progress: 0.5,
    phase: "turns",
    moves: displayMoves(),
  });

  const pickMove = createSolverMovePicker(encodeCached);
  for (let index = 0; index < shortlist.length; index += 1) {
    if (request.requestId !== activeRequestId) {
      post({ type: "cancelled", requestId: request.requestId });
      return;
    }

    const move = shortlist[index];
    const metric = await simulateTurnsForWord(
      move.word,
      request.candidates,
      request.allowedGuesses,
      request.candidateOnly,
      request.exact,
      request.dictionaryVersion,
      request.requestId,
      pickMove,
    );
    const updatedMove = { ...move, turnsMetric: metric };
    shortlist[index] = updatedMove;
    moveByWord.set(move.word, updatedMove);
    post({
      type: "running",
      requestId: request.requestId,
      progress: 0.5 + ((index + 1) / shortlist.length) * 0.5,
      phase: "turns",
      moves: displayMoves(),
    });
  }

  const finalMoves = (request.sortKey === "averageAttempts"
    ? [...shortlist].sort((a, b) => compareMoveScores(a, b, request.sortKey)).slice(0, request.limit)
    : stableDisplayWords
      .map((word) => moveByWord.get(word))
      .filter((move): move is MoveScore => Boolean(move)))
    .map(detailedMove);
  rememberRanking(key, finalMoves);
  post({ type: "done", requestId: request.requestId, moves: finalMoves });
}

function createSolverMovePicker(encodeCached: (word: Word) => EncodedWord): SolverMovePicker {
  const moveCache = new Map<string, Word | null>();

  return ({ candidates, allowedGuesses, usedWords, strategy }) => {
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    const key = [
      strategy.candidateOnly ? "c" : "a",
      strategy.exact ? "exact" : "fast",
      [...usedWords].sort((a, b) => a.localeCompare(b, "pl")).join(","),
      candidates.join(","),
    ].join("|");
    const cached = moveCache.get(key);
    if (cached !== undefined) return cached ?? undefined;

    const pool = buildRankingPool(allowedGuesses, candidates, strategy.candidateOnly, strategy.exact)
      .filter((word) => !usedWords.has(word));
    if (!pool.length) {
      const fallback = candidates.find((word) => !usedWords.has(word));
      moveCache.set(key, fallback ?? null);
      return fallback;
    }

    const context = createRankingContext(candidates, encodeCached);
    let bestMove: MoveScore | undefined;

    for (const word of pool) {
      const move = scoreMoveStats(word, encodeCached(word), context);
      if (!bestMove || compareMoveScores(move, bestMove, strategy.sortKey) < 0) {
        bestMove = move;
      }
    }

    moveCache.set(key, bestMove?.word ?? null);
    return bestMove?.word;
  };
}

async function runTurnsEvaluation(request: WorkerEvaluateTurnsRequest): Promise<void> {
  const encodeCached = createCachedEncoder();
  const context = createRankingContext(request.candidates, encodeCached);
  const estimate = scoreMoveStats(request.word, encodeCached(request.word), context).turnsMetric;
  if (!estimate) throw new Error("Nie udało się oszacować średniej liczby prób.");

  post({
    type: "turns-running",
    requestId: request.requestId,
    progress: 0,
    metric: estimate,
  });

  const metric = await simulateTurnsForWord(
    request.word,
    request.candidates,
    request.allowedGuesses,
    request.candidateOnly,
    request.exact,
    request.dictionaryVersion,
    request.requestId,
    createSolverMovePicker(encodeCached),
    (progress) => {
      post({
        type: "turns-running",
        requestId: request.requestId,
        progress,
        metric: estimate,
      });
    },
  );
  if (request.requestId !== activeRequestId) {
    post({ type: "turns-cancelled", requestId: request.requestId });
    return;
  }
  post({ type: "turns-done", requestId: request.requestId, metric });
}

async function runSolver(request: WorkerSolveRequest): Promise<void> {
  const encodeCached = createCachedEncoder();
  const result = await simulateSolverHistogram(
    request.answers,
    request.allowedGuesses,
    {
      startWord: request.startWord,
      maxAttempts: request.maxAttempts,
      strategy: request.strategy,
    },
    {
      pickMove: createSolverMovePicker(encodeCached),
      shouldCancel: () => request.requestId !== activeRequestId,
      onProgress: async (result) => {
        post({
          type: "solver-running",
          requestId: request.requestId,
          progress: result.totalAnswers ? result.processedAnswers / result.totalAnswers : 1,
          result,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    },
  );

  if (request.requestId !== activeRequestId) {
    post({ type: "solver-cancelled", requestId: request.requestId });
    return;
  }

  post({ type: "solver-done", requestId: request.requestId, result });
}

self.onmessage = (event: MessageEvent<WorkerAnalyzeRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    if (request.requestId === activeRequestId) activeRequestId = 0;
    return;
  }

  activeRequestId = request.requestId;

  if (request.type === "rank") {
    runRanking(request).catch((error) => {
      if (error instanceof SolverSimulationCancelledError) {
        post({ type: "cancelled", requestId: request.requestId });
        return;
      }
      post({
        type: "error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  if (request.type === "evaluate-turns") {
    runTurnsEvaluation(request).catch((error) => {
      if (error instanceof SolverSimulationCancelledError) {
        post({ type: "turns-cancelled", requestId: request.requestId });
        return;
      }
      post({
        type: "turns-error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  runSolver(request).catch((error) => {
    if (error instanceof SolverSimulationCancelledError) {
      post({ type: "solver-cancelled", requestId: request.requestId });
      return;
    }

    post({
      type: "solver-error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
};

export {};
