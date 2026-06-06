import type { Guess, LetterState, Pattern, Word } from "../types/wordle";

const WORD_RE = /^[a-ząćęłńóśźż]+$/iu;
export const LETTER_STATES: readonly LetterState[] = ["B", "Y", "G"] as const;
export const EMPTY_PATTERN: Pattern = ["B", "B", "B", "B", "B"];

export function normalizeWord(word: unknown): Word {
  return String(word ?? "").trim().toLocaleLowerCase("pl-PL").normalize("NFC");
}

export function formatWord(word: Word): string {
  return word.toLocaleUpperCase("pl-PL");
}

export function isFiveLetterWord(word: Word): boolean {
  return word.length === 5 && WORD_RE.test(word);
}

export function patternToString(pattern: Pattern): string {
  return pattern.join("");
}

export function patternToCode(pattern: readonly LetterState[]): number {
  return pattern.reduce((code, state, index) => {
    const value = state === "G" ? 2 : state === "Y" ? 1 : 0;
    return code + value * (3 ** index);
  }, 0);
}

export function codeToPatternString(code: number): string {
  const states: LetterState[] = [];
  let value = code;
  for (let i = 0; i < 5; i += 1) {
    const digit = value % 3;
    states.push(digit === 2 ? "G" : digit === 1 ? "Y" : "B");
    value = Math.floor(value / 3);
  }
  return states.join("");
}

export function stringToPattern(value: string): Pattern {
  const raw = value.trim().toUpperCase();
  if (!/^[BYG]{5}$/.test(raw)) {
    throw new Error(`Invalid Wordle pattern: ${value}`);
  }
  return raw.split("") as unknown as Pattern;
}

export function safeStringToPattern(value: string): Pattern {
  const chars = value.trim().toUpperCase().padEnd(5, "B").slice(0, 5).split("");
  return chars.map((char) => (char === "Y" || char === "G" ? char : "B")) as unknown as Pattern;
}

export function cycleLetterState(state: LetterState): LetterState {
  const idx = LETTER_STATES.indexOf(state);
  return LETTER_STATES[(idx + 1) % LETTER_STATES.length];
}

export function replacePatternAt(pattern: Pattern, index: number, state: LetterState): Pattern {
  return pattern.map((current, idx) => (idx === index ? state : current)) as unknown as Pattern;
}

export function createEmptyGuess(): Guess {
  return { word: "", pattern: [...EMPTY_PATTERN] as Pattern };
}

export function guessIsComplete(guess: Guess): boolean {
  return isFiveLetterWord(guess.word);
}

export function scoreGuess(guess: Word, answer: Word): Pattern {
  const result: LetterState[] = ["B", "B", "B", "B", "B"];
  const remaining = new Map<string, number>();

  for (let i = 0; i < 5; i += 1) {
    if (guess[i] === answer[i]) {
      result[i] = "G";
    } else {
      remaining.set(answer[i], (remaining.get(answer[i]) ?? 0) + 1);
    }
  }

  for (let i = 0; i < 5; i += 1) {
    if (result[i] === "G") continue;
    const char = guess[i];
    const count = remaining.get(char) ?? 0;
    if (count > 0) {
      result[i] = "Y";
      remaining.set(char, count - 1);
    }
  }

  return result as unknown as Pattern;
}

export function scoreGuessCode(guess: Word, answer: Word): number {
  return patternToCode(scoreGuess(guess, answer));
}

export function filterCandidates(candidates: readonly Word[], guess: Guess): Word[] {
  const expected = patternToString(guess.pattern);
  return candidates.filter((candidate) => patternToString(scoreGuess(guess.word, candidate)) === expected);
}

export function normalizeWordList(words: Iterable<string>): Word[] {
  return [...new Set([...words].map(normalizeWord).filter(isFiveLetterWord))]
    .sort((a, b) => a.localeCompare(b, "pl"));
}
