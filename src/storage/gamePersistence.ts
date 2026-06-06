import type { AppMode, DictionaryMode, Guess, SessionV2, Word } from "../types/wordle";
import { normalizeWord, stringToPattern } from "../domain/wordle";

const GAME_STORAGE_KEY = "slowoAnalyzerGameV4";
const LEGACY_GAME_STORAGE_KEY = "slowoAnalyzerGameV3";
const THEME_STORAGE_KEY = "slowoAnalyzerTheme";

export interface StoredGame {
  mode: AppMode;
  answer: Word;
  guesses: Guess[];
  dictionaryMode: DictionaryMode;
}

function emptyGame(): StoredGame {
  return { mode: "simulation", answer: "", guesses: [], dictionaryMode: "shared" };
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function parseGuess(raw: { word?: string; pattern?: string }): Guess | null {
  try {
    if (!raw.word || !raw.pattern) return null;
    return {
      word: normalizeWord(raw.word),
      pattern: stringToPattern(raw.pattern),
    };
  } catch {
    return null;
  }
}

function createSession(game: StoredGame): SessionV2 {
  return {
    version: 2,
    mode: game.mode,
    answer: normalizeWord(game.answer),
    guesses: game.guesses.map((guess) => ({ word: normalizeWord(guess.word), pattern: guess.pattern.join("") })),
    dictionaryMode: game.dictionaryMode,
    createdAt: new Date().toISOString(),
  };
}

function parseSession(value: string): StoredGame | null {
  try {
    const parsed = JSON.parse(value) as
      | SessionV2
      | Array<{ word: string; pattern: string }>
      | { mode?: AppMode; answer?: string; dictionaryMode?: DictionaryMode; guesses?: Array<{ word?: string; pattern?: string }> };

    if (Array.isArray(parsed)) {
      return {
        ...emptyGame(),
        guesses: parsed.map(parseGuess).filter((guess): guess is Guess => Boolean(guess)),
      };
    }

    const guesses = (parsed.guesses ?? []).map(parseGuess).filter((guess): guess is Guess => Boolean(guess)).slice(0, 6);
    const mode: AppMode = parsed.mode === "manual" ? "manual" : "simulation";
    return {
      mode,
      answer: normalizeWord(parsed.answer),
      guesses,
      dictionaryMode: parsed.dictionaryMode === "separate" ? "separate" : "shared",
    };
  } catch {
    return null;
  }
}

export function readStoredGame(): StoredGame {
  if (!hasLocalStorage()) return emptyGame();

  const raw = localStorage.getItem(GAME_STORAGE_KEY) ?? localStorage.getItem(LEGACY_GAME_STORAGE_KEY);
  if (!raw) return emptyGame();

  const parsed = parseSession(raw);
  if (!parsed) {
    localStorage.removeItem(GAME_STORAGE_KEY);
    return emptyGame();
  }

  const mode = parsed.mode === "manual" && !parsed.answer && parsed.guesses.length === 0 ? "simulation" : parsed.mode;
  return { ...parsed, mode };
}

export function writeStoredGame(game: StoredGame): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(createSession(game)));
}

export function readStoredTheme(): "light" | "dark" | null {
  if (!hasLocalStorage()) return null;
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

export function writeStoredTheme(theme: "light" | "dark"): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
