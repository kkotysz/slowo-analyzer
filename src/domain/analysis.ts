import type { AnalysisStep, BucketSummary, Guess, MoveScore, Word } from "../types/wordle";
import { filterCandidates, patternToString, scoreGuess } from "./wordle";

const BUCKET_EXAMPLE_LIMIT = 8;
const BUCKET_SUMMARY_LIMIT = 8;

function buildBucketMap(word: Word, candidates: readonly Word[]): Map<string, Word[]> {
  const buckets = new Map<string, Word[]>();

  for (const answer of candidates) {
    const pattern = patternToString(scoreGuess(word, answer));
    const bucket = buckets.get(pattern);
    if (bucket) bucket.push(answer);
    else buckets.set(pattern, [answer]);
  }

  return buckets;
}

function summarizeBuckets(
  buckets: ReadonlyMap<string, readonly Word[]>,
  currentPattern?: string,
  limit = BUCKET_SUMMARY_LIMIT,
): BucketSummary[] {
  return [...buckets.entries()]
    .map(([pattern, words]) => ({
      pattern,
      count: words.length,
      examples: [...words].slice(0, BUCKET_EXAMPLE_LIMIT),
      isCurrentBucket: pattern === currentPattern,
    }))
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
    .slice(0, limit);
}

export function computeLuckScore(bucketSize: number, worstBucket: number): number {
  if (bucketSize <= 0) return 0;
  if (worstBucket <= 1) return 100;
  return Math.max(0, Math.min(100, (1 - (bucketSize - 1) / (worstBucket - 1)) * 100));
}

export function analyzeGame(guesses: readonly Guess[], answers: readonly Word[]): AnalysisStep[] {
  let candidates = [...answers];
  const steps: AnalysisStep[] = [];

  for (const guess of guesses) {
    const candidatesBefore = [...candidates];
    const bucketPattern = patternToString(guess.pattern);
    const buckets = buildBucketMap(guess.word, candidatesBefore);
    const bucketWords = buckets.get(bucketPattern) ?? [];
    const worstBucket = Math.max(0, ...[...buckets.values()].map((bucket) => bucket.length));
    candidates = filterCandidates(candidatesBefore, guess);
    steps.push({
      guess,
      candidatesBefore,
      candidatesAfter: candidates,
      countBefore: candidatesBefore.length,
      countAfter: candidates.length,
      reductionPercent: candidatesBefore.length
        ? ((candidatesBefore.length - candidates.length) / candidatesBefore.length) * 100
        : 0,
      bucketPattern,
      bucketSize: bucketWords.length,
      luckScore: computeLuckScore(bucketWords.length, worstBucket),
    });
  }

  return steps;
}

export function candidatesAfterGuesses(guesses: readonly Guess[], answers: readonly Word[]): Word[] {
  const steps = analyzeGame(guesses, answers);
  return steps.at(-1)?.candidatesAfter ?? [...answers];
}

export function scoreMove(word: Word, candidates: readonly Word[]): MoveScore {
  const bucketWords = buildBucketMap(word, candidates);
  const buckets = new Map<string, number>();

  for (const [pattern, words] of bucketWords) buckets.set(pattern, words.length);

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
  const bucketRecord: Record<string, number> = {};

  for (const [pattern, count] of buckets) {
    const probability = count / total;
    entropy -= probability * Math.log2(probability);
    weightedBucketSize += count * count;
    worstBucket = Math.max(worstBucket, count);
    bucketRecord[pattern] = count;
  }

  const isCandidate = candidates.includes(word);
  const currentBucket = isCandidate
    ? summarizeBuckets(bucketWords, "GGGGG", BUCKET_SUMMARY_LIMIT).find((bucket) => bucket.pattern === "GGGGG")
    : undefined;

  return {
    word,
    entropy,
    averageBucket: weightedBucketSize / total,
    worstBucket,
    hitProbability: isCandidate ? 1 / total : 0,
    isCandidate,
    buckets: bucketRecord,
    bucketSummaries: summarizeBuckets(bucketWords),
    currentBucket,
  };
}

export function bucketSummariesForMove(
  word: Word,
  candidates: readonly Word[],
  currentPattern?: string,
): BucketSummary[] {
  return summarizeBuckets(buildBucketMap(word, candidates), currentPattern);
}
