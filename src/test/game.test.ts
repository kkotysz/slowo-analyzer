import { describe, expect, it } from "vitest";
import { commitWordToGame, pickRandomAnswer, truncateGuesses } from "../domain/game";
import { stringToPattern } from "../domain/wordle";
import type { DictionaryLists } from "../types/wordle";

const dictionary: DictionaryLists = {
  allowedGuesses: ["stare", "trefl"],
  possibleAnswers: ["trefl"],
  guesses: ["stare", "trefl"],
  answers: ["trefl"],
  mode: "shared",
};

describe("game domain", () => {
  it("commits a simulation word with automatic scoring", () => {
    const result = commitWordToGame({
      mode: "simulation",
      answer: "trefl",
      guesses: [],
      word: "stare",
      manualPattern: stringToPattern("BBBBB"),
      dictionary,
    });

    expect(result.status).toBe("ok");
    expect(result.nextGuesses[0].pattern.join("")).toBe("BYBYY");
  });

  it("rejects words outside the dictionary", () => {
    const result = commitWordToGame({
      mode: "simulation",
      answer: "trefl",
      guesses: [],
      word: "abcde",
      manualPattern: stringToPattern("BBBBB"),
      dictionary,
    });

    expect(result.status).toBe("error");
    expect(result.nextGuesses).toEqual([]);
    expect(result.message).toBe("To nie jest słowo ze słownika.");
  });

  it("truncates history and picks random answers", () => {
    const guesses = [
      { word: "stare", pattern: stringToPattern("BYBYY") },
      { word: "trefl", pattern: stringToPattern("GGGGG") },
    ];

    expect(truncateGuesses(guesses, 0)).toHaveLength(1);
    expect(pickRandomAnswer(dictionary, () => 0)).toBe("trefl");
  });
});
