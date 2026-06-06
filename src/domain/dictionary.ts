import type { DictionaryLists, DictionaryStatus, Word } from "../types/wordle";
import { readCachedDictionary, readDictionaryUrl, writeCachedDictionary } from "../storage/dictionaryCache";
import { isFiveLetterWord, normalizeWord } from "./wordle";

const PUBLIC_DICTIONARY_URL = "/slowa.txt";
const MIN_FULL_DICTIONARY_WORDS = 1000;
const REMOTE_DICTIONARY_URLS = [
  "https://raw.githubusercontent.com/kkrypt0nn/wordlists/main/wordlists/languages/polish.txt",
  "https://raw.githubusercontent.com/turekj/msc/master/CheatAR/development/server/word-dictionary-importer/src/main/resources/scrabble-polish-words.txt",
];

export interface DictionaryValidationReport {
  words: Word[];
  rawCount: number;
  rejectedCount: number;
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
): DictionaryLists {
  const shared = [...words];
  return {
    allowedGuesses: shared,
    possibleAnswers: shared,
    guesses: shared,
    answers: shared,
    mode: "shared",
    source,
    validatedAt: Date.now(),
    rejectedCount: report?.rejectedCount ?? 0,
    rawCount: report?.rawCount ?? words.length,
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

export function parseDictionaryText(text: string): string[] {
  return validateDictionaryText(text).words;
}

export function createDictionaryFetchUrl(source: string, forceRefresh: boolean, token = Date.now().toString()): string {
  if (!forceRefresh) return source;
  const [urlWithoutHash, hash = ""] = source.split("#", 2);
  const separator = urlWithoutHash.includes("?") ? "&" : "?";
  const refreshed = `${urlWithoutHash}${separator}_slowo_refresh=${encodeURIComponent(token)}`;
  return hash ? `${refreshed}#${hash}` : refreshed;
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
          detail: `${cached.lists.allowedGuesses.length.toLocaleString("pl-PL")} słów z cache`,
          source: cached.source,
          cached: true,
        },
      };
    }
  }

  const configuredUrl = readDictionaryUrl();
  const sources = options.forceRefresh && configuredUrl
    ? [configuredUrl, PUBLIC_DICTIONARY_URL, ...REMOTE_DICTIONARY_URLS]
    : [PUBLIC_DICTIONARY_URL, ...(configuredUrl ? [configuredUrl] : []), ...REMOTE_DICTIONARY_URLS];

  const errors: string[] = [];

  for (const source of sources) {
    try {
      const fetchUrl = createDictionaryFetchUrl(source, Boolean(options.forceRefresh));
      const response = await fetch(fetchUrl, { cache: options.forceRefresh ? "reload" : "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const report = validateDictionaryText(await response.text());
      if (report.words.length < MIN_FULL_DICTIONARY_WORDS) {
        throw new Error(`za mało słów (${report.words.length})`);
      }
      const lists = createSharedDictionaryLists(report.words, source, report);
      await writeCachedDictionary(lists, source);
      return {
        lists,
        status: {
          state: "ready",
          title: "Słownik gotowy",
          detail: `${report.words.length.toLocaleString("pl-PL")} słów, odrzucono ${report.rejectedCount.toLocaleString("pl-PL")}`,
          source,
          cached: source === PUBLIC_DICTIONARY_URL,
        },
      };
    } catch (error) {
      errors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
    }
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
