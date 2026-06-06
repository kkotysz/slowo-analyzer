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
  guesses: Word[];
  answers: Word[];
  mode: DictionaryMode;
  source?: string;
  validatedAt?: number;
  rejectedCount?: number;
  rawCount?: number;
}

export type WordLists = DictionaryLists;

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

export interface WorkerAnalyzeRequest {
  type: "rank";
  requestId: number;
  candidates: Word[];
  allowedGuesses: Word[];
  limit: number;
  candidateOnly: boolean;
  sortKey: RankingSortKey;
  exact: boolean;
}

export type WorkerAnalyzeResponse =
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
