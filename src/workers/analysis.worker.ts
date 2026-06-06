import { codeToPatternString, scoreGuessCode } from "../domain/wordle";
import { buildRankingPool, compareMoveScores } from "../domain/ranking";
import type { MoveScore, WorkerAnalyzeRequest, WorkerAnalyzeResponse, Word } from "../types/wordle";

const SCORE_CACHE_LIMIT = 280_000;
const RANKING_CACHE_LIMIT = 24;
const BUCKET_SUMMARY_LIMIT = 8;
const BUCKET_EXAMPLE_LIMIT = 8;
const scoreCache = new Map<string, number>();
const rankingCache = new Map<string, MoveScore[]>();
let activeRequestId = 0;

function post(message: WorkerAnalyzeResponse): void {
  self.postMessage(message);
}

function scoreCodeCached(word: Word, answer: Word): number {
  const key = `${word}|${answer}`;
  const cached = scoreCache.get(key);
  if (cached !== undefined) return cached;
  const code = scoreGuessCode(word, answer);
  if (scoreCache.size > SCORE_CACHE_LIMIT) scoreCache.clear();
  scoreCache.set(key, code);
  return code;
}

function cacheKey(request: WorkerAnalyzeRequest): string {
  return [
    request.candidateOnly ? "c" : "a",
    request.exact ? "exact" : "fast",
    request.sortKey,
    request.limit,
    request.candidates.join(","),
    request.allowedGuesses.length,
  ].join("|");
}

function scoreMoveCached(word: Word, candidates: readonly Word[]): MoveScore {
  const bucketCounts = new Map<number, number>();
  const bucketExamples = new Map<number, Word[]>();

  for (const answer of candidates) {
    const code = scoreCodeCached(word, answer);
    bucketCounts.set(code, (bucketCounts.get(code) ?? 0) + 1);
    const examples = bucketExamples.get(code);
    if (examples) {
      if (examples.length < BUCKET_EXAMPLE_LIMIT) examples.push(answer);
    } else {
      bucketExamples.set(code, [answer]);
    }
  }

  const total = candidates.length;
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

  let entropy = 0;
  let weightedBucketSize = 0;
  let worstBucket = 0;
  const buckets: Record<string, number> = {};

  for (const [code, count] of bucketCounts) {
    const probability = count / total;
    const pattern = codeToPatternString(code);
    entropy -= probability * Math.log2(probability);
    weightedBucketSize += count * count;
    worstBucket = Math.max(worstBucket, count);
    buckets[pattern] = count;
  }

  const bucketSummaries = [...bucketCounts.entries()]
    .map(([code, count]) => {
      const pattern = codeToPatternString(code);
      return {
        pattern,
        count,
        examples: bucketExamples.get(code) ?? [],
        isCurrentBucket: pattern === "GGGGG" && candidates.includes(word),
      };
    })
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
    .slice(0, BUCKET_SUMMARY_LIMIT);

  const currentBucket = bucketSummaries.find((bucket) => bucket.isCurrentBucket);
  const isCandidate = candidates.includes(word);

  return {
    word,
    entropy,
    averageBucket: weightedBucketSize / total,
    worstBucket,
    hitProbability: isCandidate ? 1 / total : 0,
    isCandidate,
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

async function runRanking(request: WorkerAnalyzeRequest): Promise<void> {
  const key = cacheKey(request);
  const cached = rankingCache.get(key);
  if (cached) {
    post({ type: "done", requestId: request.requestId, moves: cached });
    return;
  }

  post({ type: "running", requestId: request.requestId, progress: 0 });

  const pool = buildRankingPool(request.allowedGuesses, request.candidates, request.candidateOnly, request.exact);
  const scored: MoveScore[] = [];
  const progressStep = Math.max(1, Math.floor(pool.length / 20));

  for (let i = 0; i < pool.length; i += 1) {
    if (request.requestId !== activeRequestId) {
      post({ type: "cancelled", requestId: request.requestId });
      return;
    }

    scored.push(scoreMoveCached(pool[i], request.candidates));

    if (i > 0 && i % progressStep === 0) {
      post({
        type: "running",
        requestId: request.requestId,
        progress: Math.min(0.95, i / pool.length),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const moves = scored.sort((a, b) => compareMoveScores(a, b, request.sortKey)).slice(0, request.limit);
  rememberRanking(key, moves);
  post({ type: "done", requestId: request.requestId, moves });
}

self.onmessage = (event: MessageEvent<WorkerAnalyzeRequest>) => {
  const request = event.data;
  if (request.type !== "rank") return;
  activeRequestId = request.requestId;

  runRanking(request).catch((error) => {
    post({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
};

export {};
