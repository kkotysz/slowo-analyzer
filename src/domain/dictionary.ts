import type { AnswerMetadata, DictionaryLists, DictionaryStatus, Word } from "../types/wordle";
import {
  countUnlikelyAnswers,
  createLikelyAnswerMetadata,
  parseAnswerMetadataText,
} from "./answerMetadata";
import { DICTIONARY_VERSION } from "./dictionaryMetadata";
import { readCachedDictionary, writeCachedDictionary } from "../storage/dictionaryCache";
import { isFiveLetterWord, normalizeWord } from "./wordle";

const PUBLIC_GUESSES_URL = "/slowa.txt";
const PUBLIC_ANSWERS_URL = "/hasla.txt";
const PUBLIC_METADATA_URL = "/answer-metadata.json";
const PUBLIC_DICTIONARY_SOURCE = `${PUBLIC_GUESSES_URL} + ${PUBLIC_ANSWERS_URL} + ${PUBLIC_METADATA_URL}`;
const MIN_FULL_GUESS_WORDS = 20000;
const MIN_FULL_ANSWER_WORDS = 5000;

export interface DictionaryValidationReport {
  words: Word[];
  rawCount: number;
  rejectedCount: number;
}

export interface SeparateDictionaryValidationReport {
  allowedGuesses: DictionaryValidationReport;
  possibleAnswers: DictionaryValidationReport;
  filteredAnswerCount: number;
}

export const FALLBACK_WORDS = validateDictionaryText(`
audio stare krety brent treli trefl teraz serca karta renta tenor trend trent tremo trevi treść
butyl buty mury ruchy futry łupy obłym korty motyl młoty młody plony polny wolny wolno solny dolny
proch tropy drogi drogo brody bródź broić broił groty grono krowy kropi kroki kręgi kręci
firma filmy front flota flora flory flety fleki fikus focus bonus burty borys borów boruj borze
słowo słowa słony słoma słota środa żarty żebra źrebi trwać trefi trefn trema trele trela
wanna awans ławka żółty źródł śledź gęsty klucz cisza blask ekran sanki praca droga lampa
`.split(/\s+/).join("\n")).words;

function createSharedDictionaryLists(
  words: readonly Word[],
  source: string,
  report?: Pick<DictionaryValidationReport, "rawCount" | "rejectedCount">,
  answerMetadata: AnswerMetadata = createLikelyAnswerMetadata(words),
): DictionaryLists {
  const shared = [...words];
  return {
    allowedGuesses: shared,
    possibleAnswers: shared,
    answerMetadata,
    guesses: shared,
    answers: shared,
    mode: "shared",
    source,
    validatedAt: Date.now(),
    rejectedCount: report?.rejectedCount ?? 0,
    rawCount: report?.rawCount ?? words.length,
    dictionaryVersion: DICTIONARY_VERSION,
  };
}

export function createSeparateDictionaryLists(
  report: SeparateDictionaryValidationReport,
  source: string,
  answerMetadata: AnswerMetadata = createLikelyAnswerMetadata(report.possibleAnswers.words),
): DictionaryLists {
  const allowedGuesses = [...report.allowedGuesses.words];
  const possibleAnswers = [...report.possibleAnswers.words];

  return {
    allowedGuesses,
    possibleAnswers,
    answerMetadata,
    guesses: allowedGuesses,
    answers: possibleAnswers,
    mode: "separate",
    source,
    validatedAt: Date.now(),
    rejectedCount: report.allowedGuesses.rejectedCount + report.possibleAnswers.rejectedCount,
    rawCount: report.allowedGuesses.rawCount + report.possibleAnswers.rawCount,
    dictionaryVersion: DICTIONARY_VERSION,
  };
}

export function validateDictionaryWords(rawWords: Iterable<string>): DictionaryValidationReport {
  const normalized: Word[] = [];
  let rawCount = 0;
  let rejectedCount = 0;

  for (const raw of rawWords) {
    if (!String(raw ?? "").trim()) continue;
    rawCount += 1;
    const word = normalizeWord(raw);
    if (isFiveLetterWord(word)) normalized.push(word);
    else rejectedCount += 1;
  }

  const words = [...new Set(normalized)].sort((a, b) => a.localeCompare(b, "pl"));
  rejectedCount += normalized.length - words.length;

  return { words, rawCount, rejectedCount };
}

export function validateDictionaryText(text: string): DictionaryValidationReport {
  return validateDictionaryWords(text.split(/\r?\n|\s+/));
}

export function validateSeparateDictionaryText(
  guessesText: string,
  answersText: string,
): SeparateDictionaryValidationReport {
  const allowedGuesses = validateDictionaryText(guessesText);
  const allowedSet = new Set(allowedGuesses.words);
  const rawAnswers = validateDictionaryText(answersText);
  const possibleAnswers = rawAnswers.words.filter((word) => allowedSet.has(word));
  const filteredAnswerCount = rawAnswers.words.length - possibleAnswers.length;

  return {
    allowedGuesses,
    possibleAnswers: {
      ...rawAnswers,
      words: possibleAnswers,
      rejectedCount: rawAnswers.rejectedCount + filteredAnswerCount,
    },
    filteredAnswerCount,
  };
}

export function parseDictionaryText(text: string): string[] {
  return validateDictionaryText(text).words;
}

function appendQueryParam(source: string, key: string, value: string): string {
  const [urlWithoutHash, hash = ""] = source.split("#", 2);
  const separator = urlWithoutHash.includes("?") ? "&" : "?";
  const updated = `${urlWithoutHash}${separator}${key}=${encodeURIComponent(value)}`;
  return hash ? `${updated}#${hash}` : updated;
}

export function createDictionaryFetchUrl(source: string, forceRefresh: boolean, token = Date.now().toString()): string {
  if (!forceRefresh) return source;
  return appendQueryParam(source, "_slowo_refresh", token);
}

function formatDictionaryCounts(lists: Pick<DictionaryLists, "allowedGuesses" | "possibleAnswers">): string {
  return `${lists.allowedGuesses.length.toLocaleString("pl-PL")} prób, ${lists.possibleAnswers.length.toLocaleString("pl-PL")} haseł`;
}

function formatDictionaryDetail(lists: Pick<DictionaryLists, "allowedGuesses" | "possibleAnswers" | "answerMetadata">): string {
  const unlikelyCount = countUnlikelyAnswers(lists.answerMetadata, lists.possibleAnswers);
  const unlikelyDetail = unlikelyCount
    ? `, ${unlikelyCount.toLocaleString("pl-PL")} oznaczono jako odmiany`
    : "";
  return `${formatDictionaryCounts(lists)}${unlikelyDetail}`;
}

async function fetchDictionarySource(source: string, forceRefresh: boolean): Promise<string> {
  const versionedSource = appendQueryParam(source, "_slowo_version", DICTIONARY_VERSION);
  const fetchUrl = createDictionaryFetchUrl(versionedSource, forceRefresh);
  const response = await fetch(fetchUrl, { cache: forceRefresh ? "reload" : "force-cache" });
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  return response.text();
}

export async function loadWordLists(options: { forceRefresh?: boolean } = {}): Promise<{
  lists: DictionaryLists;
  status: DictionaryStatus;
}> {
  if (!options.forceRefresh) {
    const cached = await readCachedDictionary();
    if (cached?.lists.allowedGuesses.length) {
      return {
        lists: cached.lists,
        status: {
          state: "ready",
          title: "Słownik gotowy",
          detail: `${formatDictionaryDetail(cached.lists)} z cache`,
          source: cached.source,
          cached: true,
        },
      };
    }
  }

  const errors: string[] = [];

  try {
    const [guessesText, answersText] = await Promise.all([
      fetchDictionarySource(PUBLIC_GUESSES_URL, Boolean(options.forceRefresh)),
      fetchDictionarySource(PUBLIC_ANSWERS_URL, Boolean(options.forceRefresh)),
    ]);
    const report = validateSeparateDictionaryText(guessesText, answersText);
    if (report.allowedGuesses.words.length < MIN_FULL_GUESS_WORDS) {
      throw new Error(`za mało prób (${report.allowedGuesses.words.length})`);
    }
    if (report.possibleAnswers.words.length < MIN_FULL_ANSWER_WORDS) {
      throw new Error(`za mało haseł (${report.possibleAnswers.words.length})`);
    }
    const metadataText = await fetchDictionarySource(PUBLIC_METADATA_URL, Boolean(options.forceRefresh)).catch(() => "");
    const answerMetadata = parseAnswerMetadataText(
      metadataText,
      report.possibleAnswers.words,
      DICTIONARY_VERSION,
    );
    const lists = createSeparateDictionaryLists(report, PUBLIC_DICTIONARY_SOURCE, answerMetadata);
    await writeCachedDictionary(lists, PUBLIC_DICTIONARY_SOURCE);
    return {
      lists,
      status: {
        state: "ready",
        title: "Słownik gotowy",
        detail: `${formatDictionaryDetail(lists)}, odrzucono ${lists.rejectedCount?.toLocaleString("pl-PL") ?? "0"}`,
        source: PUBLIC_DICTIONARY_SOURCE,
      },
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const lists = createSharedDictionaryLists(FALLBACK_WORDS, "fallback");
  return {
    lists,
    status: {
      state: "error",
      title: "Tryb awaryjny",
      detail: `Pełny słownik niedostępny, używam ${FALLBACK_WORDS.length} słów fallback`,
      source: errors.at(-1),
    },
  };
}
