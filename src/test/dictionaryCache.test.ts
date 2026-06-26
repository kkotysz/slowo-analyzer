import { beforeEach, describe, expect, it, vi } from "vitest";
import { DICTIONARY_VERSION } from "../domain/dictionaryMetadata";
import { readCachedDictionary, writeCachedDictionary } from "../storage/dictionaryCache";
import type { DictionaryLists } from "../types/wordle";

const CACHE_KEY = "slowoAnalyzerDictionaryV2";

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => store.delete(key)),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  };
}

function makeWords(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index.toString(36).padStart(4, "0")}`.slice(0, 5));
}

function makeLists(dictionaryVersion?: string): DictionaryLists {
  const allowedGuesses = makeWords("g", 1200);
  const possibleAnswers = allowedGuesses.slice(0, 1100);
  return {
    allowedGuesses,
    possibleAnswers,
    answerMetadata: {
      [possibleAnswers[0]]: { likelihood: "unlikely", reason: "inflection", lemmas: ["lemma"] },
    },
    guesses: allowedGuesses,
    answers: possibleAnswers,
    mode: "separate",
    dictionaryVersion,
  };
}

describe("dictionary cache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.stubGlobal("indexedDB", undefined);
  });

  it("ignores old cached dictionaries without the current dictionary version", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      source: "old cache",
      lists: makeLists(),
    }));

    await expect(readCachedDictionary()).resolves.toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("stores and reads dictionaries with the current dictionary version", async () => {
    await writeCachedDictionary(makeLists(DICTIONARY_VERSION), "test source");

    const cached = await readCachedDictionary();

    expect(cached).toBeTruthy();
    expect(cached?.source).toBe("test source");
    expect(cached?.lists.dictionaryVersion).toBe(DICTIONARY_VERSION);
    expect(cached?.lists.allowedGuesses).toHaveLength(1200);
    expect(cached?.lists.possibleAnswers).toHaveLength(1100);
    expect(cached!.lists.answerMetadata[cached!.lists.possibleAnswers[0]].likelihood).toBe("unlikely");
  });

  it("treats cached dictionaries without metadata as likely", async () => {
    const lists = makeLists(DICTIONARY_VERSION);
    const { answerMetadata: _answerMetadata, ...legacyLists } = lists;
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      source: "legacy cache",
      lists: legacyLists,
    }));

    const cached = await readCachedDictionary();

    expect(cached).toBeTruthy();
    expect(cached!.lists.answerMetadata[cached!.lists.possibleAnswers[0]].likelihood).toBe("likely");
  });
});
