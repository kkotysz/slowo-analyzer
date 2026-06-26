export type LetterState = "B" | "Y" | "G";

export type Pattern = readonly [
  LetterState,
  LetterState,
  LetterState,
  LetterState,
  LetterState,
];

export type Word = string;

export type AppMode = "manual" | "simulation";

export type DictionaryMode = "shared" | "separate";

export type AnswerLikelihood = "likely" | "unlikely";

export type AnswerLikelihoodReason = "inflection";

export type AnswerProfile = "all" | "likelyOnly";

export type RankingSortKey =
  | "entropy"
  | "worstBucket"
  | "averageBucket"
  | "hitProbability"
  | "candidateFirst";

export type WorkerStatus = "idle" | "running" | "done" | "error" | "cancelled";

export interface Guess {
  word: Word;
  pattern: Pattern;
}

export interface DictionaryLists {
  allowedGuesses: Word[];
  possibleAnswers: Word[];
  answerMetadata: AnswerMetadata;
  guesses: Word[];
  answers: Word[];
  mode: DictionaryMode;
  source?: string;
  validatedAt?: number;
  rejectedCount?: number;
  rawCount?: number;
  dictionaryVersion?: string;
}

export type WordLists = DictionaryLists;

export interface AnswerMetadataEntry {
  likelihood: AnswerLikelihood;
  reason?: AnswerLikelihoodReason;
  lemmas?: Word[];
}

export type AnswerMetadata = Record<Word, AnswerMetadataEntry>;

export interface AnswerMetadataFile {
  dictionaryVersion: string;
  generatedAt?: string;
  source?: string;
  answerCount: number;
  entries: AnswerMetadata;
}

export interface BucketSummary {
  pattern: string;
  count: number;
  examples: Word[];
  isCurrentBucket?: boolean;
}

export interface AnalysisStep {
  guess: Guess;
  candidatesBefore: Word[];
  candidatesAfter: Word[];
  countBefore: number;
  countAfter: number;
  reductionPercent: number;
  bucketPattern: string;
  bucketSize: number;
  luckScore: number;
}

export interface MoveScore {
  word: Word;
  entropy: number;
  averageBucket: number;
  worstBucket: number;
  hitProbability: number;
  isCandidate: boolean;
  buckets: Record<string, number>;
  bucketSummaries: BucketSummary[];
  currentBucket?: BucketSummary;
  likelihood?: AnswerLikelihood;
  likelihoodReason?: AnswerLikelihoodReason;
  lemmas?: Word[];
}

export interface PrecomputedOpeningMoveRankings {
  candidateOnly: Partial<Record<RankingSortKey, MoveScore[]>>;
  allMoves: Partial<Record<RankingSortKey, MoveScore[]>>;
}

export interface PrecomputedOpeningMoves {
  dictionaryVersion: string;
  guessCount: number;
  answerCount: number;
  likelyGuessCount?: number;
  likelyAnswerCount?: number;
  firstGuess?: Word;
  lastGuess?: Word;
  firstLikelyGuess?: Word;
  lastLikelyGuess?: Word;
  firstAnswer: Word;
  lastAnswer: Word;
  firstLikelyAnswer?: Word;
  lastLikelyAnswer?: Word;
  rankings: PrecomputedOpeningMoveRankings;
  likelyOnlyRankings?: PrecomputedOpeningMoveRankings;
}

export interface MoveDetailsStats {
  countBefore: number;
  countAfter: number;
  bucketLabel: string;
  luckScore?: number;
  kind: "actual" | "expected";
}

export interface MoveEvaluation {
  skillScore: number;
  luckScore: number;
  bestMove?: MoveScore;
  chosenMove?: MoveScore;
}

export interface SolverResult {
  candidates: number;
  depth: number;
  expectedTurns: number;
  worstCaseTurns: number;
  bestMove?: MoveScore;
}

export interface SolverStrategySnapshot {
  candidateOnly: boolean;
  exact: boolean;
  sortKey: RankingSortKey;
}

export interface SolverHistogramBucket {
  attempts: number | "unsolved";
  label: string;
  count: number;
  percentage: number;
}

export interface SolverHistogramResult {
  startWord: Word;
  maxAttempts: number;
  totalAnswers: number;
  processedAnswers: number;
  solvedAnswers: number;
  unsolvedAnswers: number;
  averageAttempts: number;
  strategy: SolverStrategySnapshot;
  histogram: SolverHistogramBucket[];
}

export interface DictionaryStatus {
  state: "idle" | "loading" | "ready" | "error";
  title: string;
  detail: string;
  source?: string;
  offline?: boolean;
  cached?: boolean;
}

export interface GameState {
  mode: AppMode;
  answer: Word;
  guesses: Guess[];
  candidates: Word[];
  dictionaryStatus: DictionaryStatus;
  hardMode: boolean;
}

export interface WorkerRankRequest {
  type: "rank";
  requestId: number;
  candidates: Word[];
  allowedGuesses: Word[];
  limit: number;
  candidateOnly: boolean;
  sortKey: RankingSortKey;
  exact: boolean;
  answerProfile?: AnswerProfile;
  dictionaryVersion?: string;
}

export interface WorkerSolveRequest {
  type: "solve";
  requestId: number;
  startWord: Word;
  maxAttempts: number;
  answers: Word[];
  allowedGuesses: Word[];
  strategy: SolverStrategySnapshot;
  dictionaryVersion?: string;
}

export interface WorkerCancelRequest {
  type: "cancel";
  requestId: number;
}

export type WorkerAnalyzeRequest = WorkerRankRequest | WorkerSolveRequest | WorkerCancelRequest;

export type WorkerRankResponse =
  | {
      type: "running";
      requestId: number;
      progress: number;
    }
  | {
      type: "done";
      requestId: number;
      moves: MoveScore[];
    }
  | {
      type: "cancelled";
      requestId: number;
    }
  | {
      type: "error";
      requestId: number;
      message: string;
    };

export type WorkerSolveResponse =
  | {
      type: "solver-running";
      requestId: number;
      progress: number;
      result: SolverHistogramResult;
    }
  | {
      type: "solver-done";
      requestId: number;
      result: SolverHistogramResult;
    }
  | {
      type: "solver-cancelled";
      requestId: number;
    }
  | {
      type: "solver-error";
      requestId: number;
      message: string;
    };

export type WorkerAnalyzeResponse = WorkerRankResponse | WorkerSolveResponse;

export type GameCommandStatus = "ok" | "error";

export interface GameCommandResult {
  status: GameCommandStatus;
  nextGuesses: Guess[];
  nextDraft: Guess;
  message: string;
}

export interface SessionV2 {
  version: 2;
  mode: AppMode;
  answer: Word;
  guesses: Array<{ word: Word; pattern: string }>;
  dictionaryMode: DictionaryMode;
  createdAt: string;
}
