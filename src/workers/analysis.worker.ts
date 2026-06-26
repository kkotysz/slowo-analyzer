import { encodeWord, PATTERN_COUNT, scoreEncodedGuessCode, SOLVED_PATTERN_CODE } from "../domain/fastScoring";
import type { EncodedWord } from "../domain/fastScoring";
import { DICTIONARY_VERSION } from "../domain/dictionaryMetadata";
import { buildRankingPool, compareMoveScores } from "../domain/ranking";
import { simulateSolverHistogram, SolverSimulationCancelledError } from "../domain/solver";
import type { SolverMovePicker } from "../domain/solver";
import { codeToPatternString } from "../domain/wordle";
import { createPublicAssetUrl } from "../domain/publicAssets";
import type {
  MoveScore,
  PrecomputedOpeningMoves,
  WorkerAnalyzeRequest,
  WorkerAnalyzeResponse,
  WorkerRankRequest,
  WorkerSolveRequest,
  Word,
} from "../types/wordle";

const OPENING_MOVES_URL = createPublicAssetUrl("opening-moves.json");
const RANKING_CACHE_LIMIT = 24;
const BUCKET_SUMMARY_LIMIT = 8;
const BUCKET_EXAMPLE_LIMIT = 8;
const rankingCache = new Map<string, MoveScore[]>();
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

async function runRanking(request: WorkerRankRequest): Promise<void> {
  const key = cacheKey(request);
  const cached = rankingCache.get(key);
  if (cached) {
    post({ type: "done", requestId: request.requestId, moves: cached });
    return;
  }

  const precomputed = await readPrecomputedMoves(request);
  if (precomputed) {
    rememberRanking(key, precomputed);
    post({ type: "done", requestId: request.requestId, moves: precomputed });
    return;
  }

  post({ type: "running", requestId: request.requestId, progress: 0 });

  const pool = buildRankingPool(request.allowedGuesses, request.candidates, request.candidateOnly, request.exact);
  const encodeCached = createCachedEncoder();
  const context: RankingContext = {
    candidates: request.candidates,
    encodedCandidates: request.candidates.map(encodeCached),
    candidateSet: new Set(request.candidates),
    bucketCounts: new Uint32Array(PATTERN_COUNT),
    remainingChars: new Uint16Array(5),
    remainingCounts: new Uint8Array(5),
  };
  const scored: MoveScore[] = [];
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
        progress: Math.min(0.95, i / pool.length),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const moves = scored
    .sort((a, b) => compareMoveScores(a, b, request.sortKey))
    .slice(0, request.limit)
    .map((move) => scoreMoveWithDetails(move.word, encodeCached(move.word), context));
  rememberRanking(key, moves);
  post({ type: "done", requestId: request.requestId, moves });
}

function createSolverMovePicker(encodeCached: (word: Word) => EncodedWord): SolverMovePicker {
  return ({ candidates, allowedGuesses, usedWords, strategy }) => {
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    const pool = buildRankingPool(allowedGuesses, candidates, strategy.candidateOnly, strategy.exact)
      .filter((word) => !usedWords.has(word));
    if (!pool.length) return candidates.find((word) => !usedWords.has(word));

    const context: RankingContext = {
      candidates,
      encodedCandidates: candidates.map(encodeCached),
      candidateSet: new Set(candidates),
      bucketCounts: new Uint32Array(PATTERN_COUNT),
      remainingChars: new Uint16Array(5),
      remainingCounts: new Uint8Array(5),
    };
    let bestMove: MoveScore | undefined;

    for (const word of pool) {
      const move = scoreMoveStats(word, encodeCached(word), context);
      if (!bestMove || compareMoveScores(move, bestMove, strategy.sortKey) < 0) {
        bestMove = move;
      }
    }

    return bestMove?.word;
  };
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
      post({
        type: "error",
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
