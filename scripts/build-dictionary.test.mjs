import { describe, expect, it } from "vitest";
import {
  buildAnswerMetadata,
  buildOpeningMoves,
  buildOpeningMovesWithMetadata,
  extractFiveLetterWords,
  parseKwjpFrequencyList,
  parsePolimorfForms,
  selectAnswerWordsFromFrequency,
} from "./build-dictionary.mjs";

describe("dictionary build helpers", () => {
  it("normalizes, deduplicates and keeps only five-letter Polish words", () => {
    expect(extractFiveLetterWords(" ŻÓŁTY\r\nKOTEK\nabc123\nsłowo\nsłowo\n")).toEqual([
      "kotek",
      "słowo",
      "żółty",
    ]);
  });

  it("sorts words with Polish collation", () => {
    expect(extractFiveLetterWords("żółty\nkotek\nąckiś")).toEqual(["ąckiś", "kotek", "żółty"]);
  });

  it("parses KWJP rows and keeps the strongest duplicate entry", () => {
    const entries = parseKwjpFrequencyList([
      ",freq,ipm,ARF,DP,DP_norm,1-DP,total_freq",
      "LAMPA,10,1,20,0,0,0,10",
      "lampa,15,1,19,0,0,0,15",
      "butik,8,1,30,0,0,0,8",
      "abc123,100,1,100,0,0,0,100",
      "taelu,brak,1,4,0,0,0,1",
    ].join("\n"));

    expect(entries).toEqual([
      { word: "lampa", freq: 10, arf: 20 },
      { word: "butik", freq: 8, arf: 30 },
    ]);
  });

  it("selects top KWJP answers from SJP guesses and writes them alphabetically", () => {
    const guesses = ["audio", "butik", "elany", "lampa", "lipka", "taelu"].sort((a, b) => a.localeCompare(b, "pl"));
    const entries = [
      { word: "obcex", freq: 99, arf: 98 },
      { word: "butik", freq: 10, arf: 40 },
      { word: "lipka", freq: 10, arf: 50 },
      { word: "lampa", freq: 10, arf: 60 },
      { word: "elany", freq: 10, arf: 20 },
    ];

    expect(selectAnswerWordsFromFrequency(guesses, entries, 3)).toEqual(["butik", "lampa", "lipka"]);
  });

  it("classifies answer metadata from PoliMorf forms", () => {
    const polimorfText = [
      "afera\tafera\tsubst:sg:nom:f\tpospolita",
      "aferą\tafera\tsubst:sg:inst:f\tpospolita",
      "aktów\takt\tsubst:pl:gen:m3\tpospolita",
    ].join("\n");
    const forms = parsePolimorfForms(polimorfText, ["afera", "aferą", "aktów", "zzzzz"]);
    const metadata = buildAnswerMetadata(["afera", "aferą", "aktów", "zzzzz"], polimorfText, "test-version", "test");

    expect(forms.get("afera")?.hasBaseForm).toBe(true);
    expect(metadata.entries.afera).toEqual({ likelihood: "likely" });
    expect(metadata.entries.aferą).toEqual({ likelihood: "unlikely", reason: "inflection", lemmas: ["afera"] });
    expect(metadata.entries.aktów).toEqual({ likelihood: "unlikely", reason: "inflection", lemmas: ["akt"] });
    expect(metadata.entries.zzzzz).toEqual({ likelihood: "likely" });
  });

  it("builds precomputed opening rankings for all sort modes", () => {
    const guesses = ["kalia", "lipka", "lamka", "laika", "lapka", "lalka", "kolia"];
    const answers = ["kalia", "lipka", "lamka", "laika", "lapka", "lalka"];
    const openingMoves = buildOpeningMoves(guesses, answers, "test-version", 7);

    expect(openingMoves.dictionaryVersion).toBe("test-version");
    expect(openingMoves.guessCount).toBe(guesses.length);
    expect(openingMoves.answerCount).toBe(answers.length);
    expect(openingMoves.rankings.candidateOnly.entropy).toHaveLength(answers.length);
    expect(openingMoves.rankings.candidateOnly.worstBucket).toHaveLength(answers.length);
    expect(openingMoves.rankings.candidateOnly.averageBucket).toHaveLength(answers.length);
    expect(openingMoves.rankings.candidateOnly.hitProbability).toHaveLength(answers.length);
    expect(openingMoves.rankings.candidateOnly.candidateFirst).toHaveLength(answers.length);
    expect(openingMoves.rankings.allMoves.entropy).toHaveLength(guesses.length);
    expect(openingMoves.rankings.candidateOnly.entropy[0].bucketSummaries.length).toBeGreaterThan(0);
    expect(openingMoves.rankings.allMoves.entropy.some((move) => move.word === "kolia")).toBe(true);
  });

  it("builds a separate likely-only opening profile", () => {
    const guesses = ["afera", "aferą", "aktów", "audio"];
    const answers = ["afera", "aferą", "aktów"];
    const metadata = {
      dictionaryVersion: "test-version",
      answerCount: answers.length,
      entries: {
        afera: { likelihood: "likely" },
        aferą: { likelihood: "unlikely", reason: "inflection", lemmas: ["afera"] },
        aktów: { likelihood: "unlikely", reason: "inflection", lemmas: ["akt"] },
      },
    };
    const openingMoves = buildOpeningMovesWithMetadata(guesses, answers, "test-version", metadata, 4);

    expect(openingMoves.answerCount).toBe(3);
    expect(openingMoves.likelyAnswerCount).toBe(1);
    expect(openingMoves.firstLikelyAnswer).toBe("afera");
    expect(openingMoves.lastLikelyAnswer).toBe("afera");
    expect(openingMoves.likelyOnlyRankings.candidateOnly.entropy).toHaveLength(1);
    expect(openingMoves.likelyOnlyRankings.candidateOnly.entropy[0].word).toBe("afera");
  });
});
