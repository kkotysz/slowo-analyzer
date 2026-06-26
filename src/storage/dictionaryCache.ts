import type { DictionaryLists, Word } from "../types/wordle";
import { normalizeAnswerMetadata } from "../domain/answerMetadata";
import { DICTIONARY_VERSION } from "../domain/dictionaryMetadata";

const DICTIONARY_CACHE_KEY = "slowoAnalyzerDictionaryV2";
const LEGACY_DICTIONARY_KEY = "slowoAnalyzerDictionaryV1";
const DB_NAME = "slowoAnalyzer";
const DB_VERSION = 1;
const STORE_NAME = "dictionary";
const FULL_DICTIONARY_ID = "full";
const MIN_CACHED_WORDS = 1000;

interface CachedDictionary {
  savedAt: number;
  source: string;
  lists: DictionaryLists;
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function normalizeCachedLists(raw: unknown, source = "cache", savedAt = Date.now()): DictionaryLists | null {
  if (!raw || typeof raw !== "object") return null;
  const maybe = raw as Partial<DictionaryLists> & { words?: Word[] };
  if (maybe.dictionaryVersion !== DICTIONARY_VERSION) return null;

  if (
    Array.isArray(maybe.allowedGuesses) &&
    maybe.allowedGuesses.length >= MIN_CACHED_WORDS &&
    Array.isArray(maybe.possibleAnswers) &&
    maybe.possibleAnswers.length >= MIN_CACHED_WORDS
  ) {
    return {
      allowedGuesses: maybe.allowedGuesses,
      possibleAnswers: maybe.possibleAnswers,
      answerMetadata: normalizeAnswerMetadata(maybe.answerMetadata, maybe.possibleAnswers),
      guesses: maybe.allowedGuesses,
      answers: maybe.possibleAnswers,
      mode: maybe.mode === "separate" ? "separate" : "shared",
      source: maybe.source ?? source,
      validatedAt: maybe.validatedAt ?? savedAt,
      rejectedCount: maybe.rejectedCount,
      rawCount: maybe.rawCount,
      dictionaryVersion: DICTIONARY_VERSION,
    };
  }
  return null;
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readIndexedDbDictionary(): Promise<{ lists: DictionaryLists; source: string } | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(FULL_DICTIONARY_ID);
    request.onsuccess = () => {
      const cached = request.result as (CachedDictionary & { id: string }) | undefined;
      const lists = normalizeCachedLists(cached?.lists, cached?.source, cached?.savedAt);
      resolve(lists ? { lists, source: cached?.source ?? "IndexedDB" } : null);
    };
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function writeIndexedDbDictionary(lists: DictionaryLists, source: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({
      id: FULL_DICTIONARY_ID,
      savedAt: Date.now(),
      source,
      lists,
    });
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      resolve(false);
    };
  });
}

export async function readCachedDictionary(): Promise<{ lists: DictionaryLists; source: string } | null> {
  const indexed = await readIndexedDbDictionary();
  if (indexed) return indexed;
  if (!hasLocalStorage()) return null;

  const raw = localStorage.getItem(DICTIONARY_CACHE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as CachedDictionary | { words?: Word[]; source?: string; savedAt?: number };
      const lists = normalizeCachedLists("lists" in parsed ? parsed.lists : parsed, parsed.source, parsed.savedAt);
      if (lists) {
        await writeCachedDictionary(lists, lists.source ?? parsed.source ?? "localStorage");
        localStorage.removeItem(DICTIONARY_CACHE_KEY);
        return { lists, source: lists.source ?? parsed.source ?? "localStorage" };
      }
      localStorage.removeItem(DICTIONARY_CACHE_KEY);
    } catch {
      localStorage.removeItem(DICTIONARY_CACHE_KEY);
    }
  }

  localStorage.removeItem(LEGACY_DICTIONARY_KEY);

  return null;
}

export async function writeCachedDictionary(lists: DictionaryLists, source: string): Promise<void> {
  const payload = { ...lists, source, validatedAt: Date.now(), dictionaryVersion: DICTIONARY_VERSION };
  const stored = await writeIndexedDbDictionary(payload, source);
  if (!stored && hasLocalStorage()) {
    const compact: CachedDictionary = {
      savedAt: Date.now(),
      source,
      lists: payload,
    };
    localStorage.setItem(DICTIONARY_CACHE_KEY, JSON.stringify(compact));
  }
}
