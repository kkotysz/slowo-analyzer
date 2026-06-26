import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, inflateRawSync } from "node:zlib";

export const SJP_URL = "https://sjp.pl/sl/growy/sjp-20260601.zip";
export const KWJP_URL = "https://raw.githubusercontent.com/ipipan/kwjp100-varia/main/freqlists/kwjp100-slowa-orth_lc-all.csv.gz";
export const POLIMORF_URL = "https://zil.ipipan.waw.pl/PoliMorf?action=AttachFile&do=get&target=PoliMorf-0.6.7.tab.gz";
export const ANSWER_LIMIT = 6000;
export const MIN_GUESS_COUNT = 20000;
export const MIN_ANSWER_COUNT = 5000;
export const OPENING_MOVE_LIMIT = 24;

const WORD_RE = /^[a-ząćęłńóśźż]{5}$/u;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const PATTERN_COUNT = 243;
const SOLVED_PATTERN_CODE = 242;
const POWERS_OF_THREE = [1, 3, 9, 27, 81];
const RANKING_SORT_KEYS = ["entropy", "worstBucket", "averageBucket", "hitProbability", "candidateFirst"];
const BUCKET_SUMMARY_LIMIT = 8;
const BUCKET_EXAMPLE_LIMIT = 8;

export function normalizeWord(word) {
  return String(word ?? "").trim().toLocaleLowerCase("pl-PL").normalize("NFC");
}

export function extractFiveLetterWords(text) {
  const words = [];
  for (const raw of text.split(/\r?\n|\s+/)) {
    const word = normalizeWord(raw);
    if (WORD_RE.test(word)) words.push(word);
  }
  return [...new Set(words)].sort((a, b) => a.localeCompare(b, "pl"));
}

export function formatWordFile(words) {
  return `${words.join("\n")}\n`;
}

export function parseKwjpFrequencyList(text) {
  const entriesByWord = new Map();
  const lines = text.split(/\r?\n/);

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    const cells = line.split(",");
    const word = normalizeWord(cells[0]);
    const freq = Number(cells[1]);
    const arf = Number(cells[3]);

    if (!WORD_RE.test(word) || !Number.isFinite(freq) || !Number.isFinite(arf)) continue;

    const previous = entriesByWord.get(word);
    if (!previous || arf > previous.arf || (arf === previous.arf && freq > previous.freq)) {
      entriesByWord.set(word, { word, freq, arf });
    }
  }

  return [...entriesByWord.values()];
}

export function selectAnswerWordsFromFrequency(guessWords, kwjpEntries, limit = ANSWER_LIMIT) {
  const allowedSet = new Set(guessWords);
  return kwjpEntries
    .filter((entry) => allowedSet.has(entry.word))
    .sort((a, b) => (
      b.arf - a.arf ||
      b.freq - a.freq ||
      a.word.localeCompare(b.word, "pl")
    ))
    .slice(0, limit)
    .map((entry) => entry.word)
    .sort((a, b) => a.localeCompare(b, "pl"));
}

export function parsePolimorfForms(text, targetWords = undefined) {
  const targetSet = targetWords ? new Set(targetWords) : undefined;
  const forms = new Map();

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const [rawForm, rawLemma] = line.split("\t");
    const form = normalizeWord(rawForm);
    if (!WORD_RE.test(form) || (targetSet && !targetSet.has(form))) continue;

    const lemma = normalizeWord(rawLemma);
    if (!lemma) continue;

    const current = forms.get(form) ?? { hasBaseForm: false, lemmas: new Set() };
    current.lemmas.add(lemma);
    if (form === lemma) current.hasBaseForm = true;
    forms.set(form, current);
  }

  return forms;
}

export function buildAnswerMetadata(answerWords, polimorfText, dictionaryVersion, source = POLIMORF_URL) {
  const forms = parsePolimorfForms(polimorfText, answerWords);
  const entries = {};

  for (const word of answerWords) {
    const form = forms.get(word);
    const lemmas = form
      ? [...form.lemmas]
        .filter((lemma) => lemma !== word)
        .sort((a, b) => a.localeCompare(b, "pl"))
        .slice(0, 4)
      : [];

    entries[word] = form && !form.hasBaseForm && lemmas.length
      ? { likelihood: "unlikely", reason: "inflection", lemmas }
      : { likelihood: "likely" };
  }

  return {
    dictionaryVersion,
    generatedAt: new Date().toISOString(),
    source,
    answerCount: answerWords.length,
    entries,
  };
}

function codeToPatternString(code) {
  const states = [];
  let value = code;
  for (let index = 0; index < 5; index += 1) {
    const digit = value % 3;
    states.push(digit === 2 ? "G" : digit === 1 ? "Y" : "B");
    value = Math.floor(value / 3);
  }
  return states.join("");
}

function encodeWord(word) {
  const encoded = new Uint16Array(5);
  for (let index = 0; index < 5; index += 1) encoded[index] = word.charCodeAt(index);
  return encoded;
}

function addRemaining(char, chars, counts, used) {
  for (let index = 0; index < used; index += 1) {
    if (chars[index] === char) {
      counts[index] += 1;
      return used;
    }
  }
  chars[used] = char;
  counts[used] = 1;
  return used + 1;
}

function takeRemaining(char, chars, counts, used) {
  for (let index = 0; index < used; index += 1) {
    if (chars[index] === char && counts[index] > 0) {
      counts[index] -= 1;
      return true;
    }
  }
  return false;
}

function scoreEncodedGuessCode(guess, answer, remainingChars, remainingCounts) {
  let code = 0;
  let greenMask = 0;
  let usedRemaining = 0;

  for (let index = 0; index < 5; index += 1) {
    if (guess[index] === answer[index]) {
      code += 2 * POWERS_OF_THREE[index];
      greenMask |= 1 << index;
    } else {
      usedRemaining = addRemaining(answer[index], remainingChars, remainingCounts, usedRemaining);
    }
  }

  for (let index = 0; index < 5; index += 1) {
    if (greenMask & (1 << index)) continue;
    if (takeRemaining(guess[index], remainingChars, remainingCounts, usedRemaining)) {
      code += POWERS_OF_THREE[index];
    }
  }

  return code;
}

function fillBucketCounts(encodedWord, encodedAnswers, scratch) {
  scratch.bucketCounts.fill(0);
  for (const answer of encodedAnswers) {
    const code = scoreEncodedGuessCode(encodedWord, answer, scratch.remainingChars, scratch.remainingCounts);
    scratch.bucketCounts[code] += 1;
  }
}

function addAnswerMetadata(score, answerMetadata) {
  const metadata = answerMetadata?.entries?.[score.word] ?? answerMetadata?.[score.word];
  if (!metadata) return score;
  return {
    ...score,
    likelihood: metadata.likelihood,
    likelihoodReason: metadata.reason,
    lemmas: metadata.lemmas,
  };
}

function scoreFromBucketCounts(word, bucketCounts, total, isCandidate, answerMetadata, includeDetails = false) {
  let entropy = 0;
  let weightedBucketSize = 0;
  let worstBucket = 0;
  const buckets = {};
  const rankedBuckets = [];

  for (let code = 0; code < PATTERN_COUNT; code += 1) {
    const count = bucketCounts[code];
    if (!count) continue;
    const probability = count / total;
    entropy -= probability * Math.log2(probability);
    weightedBucketSize += count * count;
    worstBucket = Math.max(worstBucket, count);

    if (includeDetails) {
      const pattern = codeToPatternString(code);
      buckets[pattern] = count;
      rankedBuckets.push({ code, count, pattern });
    }
  }

  const score = {
    word,
    entropy,
    averageBucket: weightedBucketSize / total,
    worstBucket,
    hitProbability: isCandidate ? 1 / total : 0,
    isCandidate,
    buckets,
    bucketSummaries: [],
  };

  if (!includeDetails) return addAnswerMetadata(score, answerMetadata);

  score.bucketSummaries = rankedBuckets
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
    .slice(0, BUCKET_SUMMARY_LIMIT)
    .map((bucket) => ({
      pattern: bucket.pattern,
      count: bucket.count,
      examples: [],
      isCurrentBucket: bucket.code === SOLVED_PATTERN_CODE && isCandidate,
    }));

  return addAnswerMetadata(score, answerMetadata);
}

function compareMoveScores(a, b, sortKey = "entropy") {
  const stableFallback = (
    b.entropy - a.entropy ||
    a.averageBucket - b.averageBucket ||
    a.worstBucket - b.worstBucket ||
    Number(b.isCandidate) - Number(a.isCandidate) ||
    a.word.localeCompare(b.word, "pl")
  );

  if (sortKey === "worstBucket") return a.worstBucket - b.worstBucket || stableFallback;
  if (sortKey === "averageBucket") return a.averageBucket - b.averageBucket || stableFallback;
  if (sortKey === "hitProbability") return b.hitProbability - a.hitProbability || stableFallback;
  if (sortKey === "candidateFirst") return Number(b.isCandidate) - Number(a.isCandidate) || stableFallback;
  return stableFallback;
}

function addBucketExamples(score, encodedWord, words, encodedWords, scratch) {
  const summaryIndexByPattern = new Map(score.bucketSummaries.map((bucket, index) => [bucket.pattern, index]));
  let completeSummaryCount = 0;

  for (let index = 0; index < encodedWords.length && completeSummaryCount < score.bucketSummaries.length; index += 1) {
    const code = scoreEncodedGuessCode(encodedWord, encodedWords[index], scratch.remainingChars, scratch.remainingCounts);
    const summaryIndex = summaryIndexByPattern.get(codeToPatternString(code));
    if (summaryIndex === undefined) continue;

    const examples = score.bucketSummaries[summaryIndex].examples;
    if (examples.length >= BUCKET_EXAMPLE_LIMIT) continue;
    examples.push(words[index]);
    if (examples.length === BUCKET_EXAMPLE_LIMIT) completeSummaryCount += 1;
  }
}

function scoreOpeningMove(
  word,
  encodedWord,
  answerWords,
  encodedAnswers,
  candidateSet,
  scratch,
  answerMetadata,
  includeDetails = false,
) {
  fillBucketCounts(encodedWord, encodedAnswers, scratch);
  const score = scoreFromBucketCounts(
    word,
    scratch.bucketCounts,
    answerWords.length,
    candidateSet.has(word),
    answerMetadata,
    includeDetails,
  );
  if (includeDetails) addBucketExamples(score, encodedWord, answerWords, encodedAnswers, scratch);
  return score;
}

function buildRankingGroup(poolWords, answerWords, encodedAnswers, candidateSet, scratch, limit, answerMetadata) {
  const encodedPoolWords = poolWords.map(encodeWord);
  const scores = [];

  for (let index = 0; index < poolWords.length; index += 1) {
    scores.push(scoreOpeningMove(
      poolWords[index],
      encodedPoolWords[index],
      answerWords,
      encodedAnswers,
      candidateSet,
      scratch,
      answerMetadata,
    ));
  }

  const wordIndex = new Map(poolWords.map((word, index) => [word, index]));
  const detailCache = new Map();
  const detailedScore = (word) => {
    const cached = detailCache.get(word);
    if (cached) return cached;
    const index = wordIndex.get(word);
    const score = scoreOpeningMove(
      word,
      encodedPoolWords[index],
      answerWords,
      encodedAnswers,
      candidateSet,
      scratch,
      answerMetadata,
      true,
    );
    detailCache.set(word, score);
    return score;
  };
  const rankings = {};

  for (const sortKey of RANKING_SORT_KEYS) {
    rankings[sortKey] = [...scores]
      .sort((a, b) => compareMoveScores(a, b, sortKey))
      .slice(0, limit)
      .map((score) => detailedScore(score.word));
  }

  return rankings;
}

export function buildOpeningMoves(guessWords, answerWords, dictionaryVersion, limit = OPENING_MOVE_LIMIT) {
  return buildOpeningMovesWithMetadata(guessWords, answerWords, dictionaryVersion, undefined, limit);
}

export function buildOpeningMovesWithMetadata(
  guessWords,
  answerWords,
  dictionaryVersion,
  answerMetadata,
  limit = OPENING_MOVE_LIMIT,
) {
  const encodedAnswers = answerWords.map(encodeWord);
  const isLikelyWord = (word) => answerMetadata?.entries?.[word]?.likelihood !== "unlikely";
  const likelyGuessWords = guessWords.filter(isLikelyWord);
  const likelyAnswerWords = answerWords.filter(isLikelyWord);
  const encodedLikelyAnswers = likelyAnswerWords.map(encodeWord);
  const candidateSet = new Set(answerWords);
  const likelyCandidateSet = new Set(likelyAnswerWords);
  const scratch = {
    bucketCounts: new Uint32Array(PATTERN_COUNT),
    remainingChars: new Uint16Array(5),
    remainingCounts: new Uint8Array(5),
  };

  return {
    dictionaryVersion,
    generatedAt: new Date().toISOString(),
    guessCount: guessWords.length,
    answerCount: answerWords.length,
    likelyGuessCount: likelyGuessWords.length,
    likelyAnswerCount: likelyAnswerWords.length,
    firstGuess: guessWords[0],
    lastGuess: guessWords.at(-1),
    firstLikelyGuess: likelyGuessWords[0],
    lastLikelyGuess: likelyGuessWords.at(-1),
    firstAnswer: answerWords[0],
    lastAnswer: answerWords.at(-1),
    firstLikelyAnswer: likelyAnswerWords[0],
    lastLikelyAnswer: likelyAnswerWords.at(-1),
    limit,
    rankings: {
      candidateOnly: buildRankingGroup(answerWords, answerWords, encodedAnswers, candidateSet, scratch, limit, answerMetadata),
      allMoves: buildRankingGroup(guessWords, answerWords, encodedAnswers, candidateSet, scratch, limit, answerMetadata),
    },
    likelyOnlyRankings: {
      candidateOnly: buildRankingGroup(
        likelyAnswerWords,
        likelyAnswerWords,
        encodedLikelyAnswers,
        likelyCandidateSet,
        scratch,
        limit,
        answerMetadata,
      ),
      allMoves: buildRankingGroup(
        likelyGuessWords,
        likelyAnswerWords,
        encodedLikelyAnswers,
        likelyCandidateSet,
        scratch,
        limit,
        answerMetadata,
      ),
    },
  };
}

async function readDictionaryVersion() {
  const metadataPath = path.resolve(process.cwd(), "src/domain/dictionaryMetadata.ts");
  const text = await readFile(metadataPath, "utf8");
  const match = text.match(/DICTIONARY_VERSION\s*=\s*"([^"]+)"/);
  if (!match) throw new Error(`Nie znaleziono DICTIONARY_VERSION w ${metadataPath}.`);
  return match[1];
}

function findEndOfCentralDirectory(zipBuffer) {
  for (let offset = zipBuffer.length - 22; offset >= 0; offset -= 1) {
    if (zipBuffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  throw new Error("Nie znaleziono katalogu ZIP.");
}

function findZipEntry(zipBuffer, entryName) {
  const eocdOffset = findEndOfCentralDirectory(zipBuffer);
  const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10);
  let offset = zipBuffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (zipBuffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Nieprawidłowy wpis katalogu ZIP.");
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 10);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);
    const fileName = zipBuffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (fileName === entryName) {
      return { compressionMethod, compressedSize, localHeaderOffset };
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`Nie znaleziono ${entryName} w archiwum ZIP.`);
}

function readZipEntry(zipBuffer, entryName) {
  const entry = findZipEntry(zipBuffer, entryName);
  const offset = entry.localHeaderOffset;
  if (zipBuffer.readUInt32LE(offset) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new Error("Nieprawidłowy lokalny nagłówek ZIP.");
  }

  const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
  const extraLength = zipBuffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = zipBuffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return inflateRawSync(compressed);
  throw new Error(`Nieobsługiwana metoda kompresji ZIP: ${entry.compressionMethod}.`);
}

async function fetchBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function buildDictionary({ outputDir = path.resolve(process.cwd(), "public") } = {}) {
  const dictionaryVersion = await readDictionaryVersion();
  const sjpZip = await fetchBuffer(SJP_URL);
  const sjpText = readZipEntry(sjpZip, "slowa.txt").toString("utf8");
  const guessWords = extractFiveLetterWords(sjpText);
  const kwjpGzip = await fetchBuffer(KWJP_URL);
  const kwjpEntries = parseKwjpFrequencyList(gunzipSync(kwjpGzip).toString("utf8"));
  const answerWords = selectAnswerWordsFromFrequency(guessWords, kwjpEntries);
  const polimorfGzip = await fetchBuffer(POLIMORF_URL);
  const answerMetadata = buildAnswerMetadata(
    answerWords,
    gunzipSync(polimorfGzip).toString("utf8"),
    dictionaryVersion,
  );

  if (guessWords.length < MIN_GUESS_COUNT) {
    throw new Error(`Za mało słów prób: ${guessWords.length}, minimum ${MIN_GUESS_COUNT}.`);
  }
  if (answerWords.length < MIN_ANSWER_COUNT) {
    throw new Error(`Za mało haseł: ${answerWords.length}, minimum ${MIN_ANSWER_COUNT}.`);
  }

  console.log("Licze dokladny ranking startowy...");
  const openingMoves = buildOpeningMovesWithMetadata(guessWords, answerWords, dictionaryVersion, answerMetadata);

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, "slowa.txt"), formatWordFile(guessWords), "utf8"),
    writeFile(path.join(outputDir, "hasla.txt"), formatWordFile(answerWords), "utf8"),
    writeFile(path.join(outputDir, "answer-metadata.json"), `${JSON.stringify(answerMetadata)}\n`, "utf8"),
    writeFile(path.join(outputDir, "opening-moves.json"), `${JSON.stringify(openingMoves)}\n`, "utf8"),
  ]);

  const unlikelyAnswerCount = Object.values(answerMetadata.entries)
    .filter((entry) => entry.likelihood === "unlikely").length;
  const countRankingMoves = (rankings) => Object.values(rankings).reduce(
    (count, group) => count + Object.values(group).reduce((groupCount, moves) => groupCount + moves.length, 0),
    0,
  );

  return {
    guessCount: guessWords.length,
    answerCount: answerWords.length,
    likelyAnswerCount: answerWords.length - unlikelyAnswerCount,
    unlikelyAnswerCount,
    openingMoveCount: countRankingMoves(openingMoves.rankings) + countRankingMoves(openingMoves.likelyOnlyRankings),
    outputDir,
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] === scriptPath) {
  buildDictionary()
    .then((result) => {
      console.log(`Zapisano ${result.guessCount.toLocaleString("pl-PL")} prób, ${result.answerCount.toLocaleString("pl-PL")} haseł (${result.likelyAnswerCount.toLocaleString("pl-PL")} likely, ${result.unlikelyAnswerCount.toLocaleString("pl-PL")} unlikely) i ${result.openingMoveCount.toLocaleString("pl-PL")} preliczonych ruchów do ${result.outputDir}.`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
