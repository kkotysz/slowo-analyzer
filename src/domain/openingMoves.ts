import type { AnswerProfile, MoveScore, PrecomputedOpeningMoves, RankingSortKey, Word } from "../types/wordle";
import { DICTIONARY_VERSION } from "./dictionaryMetadata";

const OPENING_MOVES_URL = "/opening-moves.json";

let openingMovesPromise: Promise<PrecomputedOpeningMoves | null> | undefined;

export interface OpeningMoveRequest {
  candidates: readonly Word[];
  allowedGuesses: readonly Word[];
  exact: boolean;
  candidateOnly: boolean;
  sortKey: RankingSortKey;
  limit: number;
  completeGuessCount: number;
  answerProfile?: AnswerProfile;
  dictionaryVersion?: string;
}

async function readOpeningMoves(): Promise<PrecomputedOpeningMoves | null> {
  if (!openingMovesPromise) {
    openingMovesPromise = fetch(OPENING_MOVES_URL, { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() as Promise<PrecomputedOpeningMoves> : null))
      .catch(() => null);
  }
  const openingMoves = await openingMovesPromise;
  if (!openingMoves) openingMovesPromise = undefined;
  return openingMoves;
}

export function isOpeningMoveRequest(request: OpeningMoveRequest): boolean {
  return Boolean(
    request.exact &&
    request.completeGuessCount === 0 &&
    request.dictionaryVersion === DICTIONARY_VERSION &&
    request.candidates.length > 0 &&
    request.allowedGuesses.length > 0
  );
}

function matchesOpeningState(request: OpeningMoveRequest, openingMoves: PrecomputedOpeningMoves): boolean {
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
    isOpeningMoveRequest(request) &&
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

export function preloadOpeningMoves(): void {
  void readOpeningMoves();
}

export async function readPrecomputedOpeningMoves(request: OpeningMoveRequest): Promise<MoveScore[] | null> {
  if (!request.exact || request.completeGuessCount > 0) return null;

  const openingMoves = await readOpeningMoves();
  if (!openingMoves || !matchesOpeningState(request, openingMoves)) return null;

  const rankings = request.answerProfile === "likelyOnly"
    ? openingMoves.likelyOnlyRankings
    : openingMoves.rankings;
  const rankingGroup = request.candidateOnly ? rankings?.candidateOnly : rankings?.allMoves;
  if (!rankingGroup) return null;
  const moves = rankingGroup[request.sortKey] ?? rankingGroup.entropy;
  return moves ? moves.slice(0, request.limit) : null;
}
