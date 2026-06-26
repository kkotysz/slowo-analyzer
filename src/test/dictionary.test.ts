import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDictionaryFetchUrl,
  loadWordLists,
  validateDictionaryText,
  validateSeparateDictionaryText,
} from "../domain/dictionary";
import { DICTIONARY_VERSION } from "../domain/dictionaryMetadata";

const TEST_ALPHABET = "abcdefghijklmnoprstuwyz";

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

function makeWords(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    let value = index;
    let word = "";
    for (let position = 0; position < 5; position += 1) {
      word += TEST_ALPHABET[value % TEST_ALPHABET.length];
      value = Math.floor(value / TEST_ALPHABET.length);
    }
    return word;
  });
}

describe("dictionary validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.stubGlobal("indexedDB", undefined);
  });

  it("normalizes, deduplicates, sorts and reports rejected words", () => {
    const report = validateDictionaryText("STARE\nstare\nabc123\ntrefl\nżółty\nsześc");

    expect(report.words).toEqual(["stare", "sześc", "trefl", "żółty"]);
    expect(report.rawCount).toBe(6);
    expect(report.rejectedCount).toBe(2);
  });

  it("filters possible answers that are not allowed guesses", () => {
    const report = validateSeparateDictionaryText("stare\ntrefl\nżółty", "trefl\nobcex\nżółty\nabc123");

    expect(report.allowedGuesses.words).toEqual(["stare", "trefl", "żółty"]);
    expect(report.possibleAnswers.words).toEqual(["trefl", "żółty"]);
    expect(report.filteredAnswerCount).toBe(1);
    expect(report.possibleAnswers.rejectedCount).toBe(2);
  });

  it("adds a cache buster only when the dictionary is force refreshed", () => {
    expect(createDictionaryFetchUrl("/slowa.txt", false, "123")).toBe("/slowa.txt");
    expect(createDictionaryFetchUrl("/slowa.txt", true, "123")).toBe("/slowa.txt?_slowo_refresh=123");
    expect(createDictionaryFetchUrl("/slowa.txt?v=1#top", true, "123")).toBe("/slowa.txt?v=1&_slowo_refresh=123#top");
  });

  it("loads separate local guess and answer dictionaries", async () => {
    const guesses = makeWords(20000);
    const answers = guesses.slice(0, 6000);
    const metadata = {
      dictionaryVersion: DICTIONARY_VERSION,
      answerCount: answers.length,
      entries: {
        [answers[0]]: { likelihood: "unlikely", reason: "inflection", lemmas: ["lemma"] },
      },
    };
    const fetchMock = vi.fn(async (source: RequestInfo | URL) => {
      const url = new URL(String(source), "http://localhost");
      const body = url.pathname === "/hasla.txt"
        ? answers.join("\n")
        : url.pathname === "/answer-metadata.json"
          ? JSON.stringify(metadata)
          : guesses.join("\n");
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { lists, status } = await loadWordLists({ forceRefresh: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain("_slowo_refresh=");
    expect(String(fetchMock.mock.calls[0][0])).toContain("_slowo_version=");
    expect(lists.mode).toBe("separate");
    expect(lists.allowedGuesses).toHaveLength(20000);
    expect(lists.possibleAnswers).toHaveLength(6000);
    expect(lists.possibleAnswers.every((word) => lists.allowedGuesses.includes(word))).toBe(true);
    expect(lists.answerMetadata[answers[0]].likelihood).toBe("unlikely");
    expect(lists.answerMetadata[answers[1]].likelihood).toBe("likely");
    expect(status.detail.replace(/\s/g, "")).toContain("20000prób");
    expect(status.detail.replace(/\s/g, "")).toContain("6000haseł");
  });

  it("falls back to likely metadata when answer metadata is unavailable", async () => {
    const guesses = makeWords(20000);
    const answers = guesses.slice(0, 6000);
    const fetchMock = vi.fn(async (source: RequestInfo | URL) => {
      const url = new URL(String(source), "http://localhost");
      if (url.pathname === "/answer-metadata.json") return new Response("", { status: 404 });
      const body = url.pathname === "/hasla.txt" ? answers.join("\n") : guesses.join("\n");
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { lists } = await loadWordLists({ forceRefresh: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(lists.answerMetadata[answers[0]].likelihood).toBe("likely");
    expect(lists.answerMetadata[answers.at(-1)!].likelihood).toBe("likely");
  });
});
