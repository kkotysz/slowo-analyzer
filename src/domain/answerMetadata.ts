import type { AnswerMetadata, AnswerMetadataEntry, AnswerMetadataFile, MoveScore, Word } from "../types/wordle";
import { normalizeWord } from "./wordle";

export function createLikelyAnswerMetadata(words: readonly Word[]): AnswerMetadata {
  return Object.fromEntries(words.map((word) => [word, { likelihood: "likely" }]));
}

function normalizeLemmaList(raw: unknown): Word[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const lemmas = [...new Set(
    raw
      .map((lemma) => normalizeWord(lemma))
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "pl"));
  return lemmas.length ? lemmas : undefined;
}

function normalizeEntry(raw: unknown): AnswerMetadataEntry {
  if (!raw || typeof raw !== "object") return { likelihood: "likely" };
  const entry = raw as Partial<AnswerMetadataEntry>;
  if (entry.likelihood !== "unlikely") return { likelihood: "likely" };

  return {
    likelihood: "unlikely",
    reason: entry.reason === "inflection" ? "inflection" : undefined,
    lemmas: normalizeLemmaList(entry.lemmas),
  };
}

export function normalizeAnswerMetadata(raw: unknown, answerWords: readonly Word[]): AnswerMetadata {
  const source = raw && typeof raw === "object" && "entries" in raw
    ? (raw as Partial<AnswerMetadataFile>).entries
    : raw;
  const entries = source && typeof source === "object" ? source as Record<string, unknown> : {};

  return Object.fromEntries(answerWords.map((word) => [
    word,
    normalizeEntry(entries[word]),
  ]));
}

export function parseAnswerMetadataText(
  text: string,
  answerWords: readonly Word[],
  dictionaryVersion: string,
): AnswerMetadata {
  if (!text.trim()) return createLikelyAnswerMetadata(answerWords);

  try {
    const parsed = JSON.parse(text) as Partial<AnswerMetadataFile>;
    if (parsed.dictionaryVersion && parsed.dictionaryVersion !== dictionaryVersion) {
      return createLikelyAnswerMetadata(answerWords);
    }
    return normalizeAnswerMetadata(parsed, answerWords);
  } catch {
    return createLikelyAnswerMetadata(answerWords);
  }
}

export function answerMetadataEntry(metadata: AnswerMetadata | undefined, word: Word): AnswerMetadataEntry {
  return metadata?.[word] ?? { likelihood: "likely" };
}

export function isUnlikelyAnswer(metadata: AnswerMetadata | undefined, word: Word): boolean {
  return answerMetadataEntry(metadata, word).likelihood === "unlikely";
}

export function countUnlikelyAnswers(metadata: AnswerMetadata | undefined, words: readonly Word[]): number {
  if (!metadata) return 0;
  return words.reduce((count, word) => count + (isUnlikelyAnswer(metadata, word) ? 1 : 0), 0);
}

export function describeAnswerMetadata(metadata: AnswerMetadata | undefined, word: Word): string | undefined {
  const entry = answerMetadataEntry(metadata, word);
  if (entry.likelihood !== "unlikely") return undefined;
  const lemmas = entry.lemmas?.length ? `: ${entry.lemmas.join(", ")}` : "";
  return `Odmiana${lemmas}`;
}

export function annotateMoveWithAnswerMetadata(move: MoveScore, metadata: AnswerMetadata | undefined): MoveScore {
  const entry = metadata?.[move.word];
  if (!entry) return move;
  return {
    ...move,
    likelihood: entry.likelihood,
    likelihoodReason: entry.reason,
    lemmas: entry.lemmas,
  };
}
