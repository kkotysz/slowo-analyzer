import type { AppMode, DictionaryLists, GameCommandResult, Guess, Pattern, Word } from "../types/wordle";
import { createEmptyGuess, isFiveLetterWord, normalizeWord, scoreGuess } from "./wordle";

interface CommitWordInput {
  mode: AppMode;
  answer: Word;
  guesses: readonly Guess[];
  word: Word;
  manualPattern: Pattern;
  dictionary: Pick<DictionaryLists, "allowedGuesses">;
}

export function commitWordToGame(input: CommitWordInput): GameCommandResult {
  const word = normalizeWord(input.word);
  const normalizedAnswer = normalizeWord(input.answer);

  if (!isFiveLetterWord(word)) {
    return {
      status: "error",
      nextGuesses: [...input.guesses],
      nextDraft: { word, pattern: input.manualPattern },
      message: "Wpisz pięcioliterowe polskie słowo.",
    };
  }

  if (input.guesses.length >= 6) {
    return {
      status: "error",
      nextGuesses: [...input.guesses],
      nextDraft: { word, pattern: input.manualPattern },
      message: "Plansza ma już sześć ruchów.",
    };
  }

  if (input.mode === "simulation" && !isFiveLetterWord(normalizedAnswer)) {
    return {
      status: "error",
      nextGuesses: [...input.guesses],
      nextDraft: { word, pattern: input.manualPattern },
      message: "W trybie symulacji wpisz najpierw pięcioliterowe hasło końcowe.",
    };
  }

  if (!input.dictionary.allowedGuesses.length) {
    return {
      status: "error",
      nextGuesses: [...input.guesses],
      nextDraft: { word, pattern: input.manualPattern },
      message: "Poczekaj, aż słownik się wczyta.",
    };
  }

  if (!input.dictionary.allowedGuesses.includes(word)) {
    return {
      status: "error",
      nextGuesses: [...input.guesses],
      nextDraft: { word, pattern: input.manualPattern },
      message: "To nie jest słowo ze słownika.",
    };
  }

  const pattern = input.mode === "simulation" ? scoreGuess(word, normalizedAnswer) : input.manualPattern;
  return {
    status: "ok",
    nextGuesses: [...input.guesses, { word, pattern }],
    nextDraft: createEmptyGuess(),
    message: "",
  };
}

export function updateGuessForMode(
  guess: Guess,
  mode: AppMode,
  answer: Word,
): Guess {
  const word = normalizeWord(guess.word);
  const normalizedAnswer = normalizeWord(answer);
  const pattern = mode === "simulation" && isFiveLetterWord(word) && isFiveLetterWord(normalizedAnswer)
    ? scoreGuess(word, normalizedAnswer)
    : guess.pattern;
  return { ...guess, word, pattern };
}

export function truncateGuesses(guesses: readonly Guess[], index: number): Guess[] {
  return guesses.slice(0, Math.max(0, Math.min(index + 1, guesses.length)));
}

export function pickRandomAnswer(dictionary: Pick<DictionaryLists, "possibleAnswers">, random = Math.random): Word {
  if (!dictionary.possibleAnswers.length) return "";
  return dictionary.possibleAnswers[Math.floor(random() * dictionary.possibleAnswers.length)];
}
