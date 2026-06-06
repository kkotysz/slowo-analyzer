import { describe, expect, it } from "vitest";
import { filterCandidates, normalizeWord, patternToString, scoreGuess, stringToPattern } from "../domain/wordle";

describe("wordle scoring", () => {
  it("normalizes Polish words", () => {
    expect(normalizeWord("  SŁOWO ")).toBe("słowo");
  });

  it("scores a solved guess", () => {
    expect(patternToString(scoreGuess("trefl", "trefl"))).toBe("GGGGG");
  });

  it("handles no matches", () => {
    expect(patternToString(scoreGuess("butyl", "serca"))).toBe("BBBBB");
  });

  it("handles repeated letters in the guess without overcounting", () => {
    expect(patternToString(scoreGuess("aaaaa", "abbbb"))).toBe("GBBBB");
    expect(patternToString(scoreGuess("abbba", "aaccc"))).toBe("GBBBY");
  });

  it("handles repeated letters in Polish words", () => {
    expect(patternToString(scoreGuess("słowo", "słowa"))).toBe("GGGGB");
    expect(patternToString(scoreGuess("wanna", "awans"))).toBe("YYBGY");
  });

  it("filters candidates by a guess pattern", () => {
    const words = ["trefl", "trela", "trwać", "stare"];
    expect(filterCandidates(words, { word: "trefl", pattern: stringToPattern("GGGGG") })).toEqual(["trefl"]);
    expect(filterCandidates(words, { word: "słowo", pattern: stringToPattern("BBBBB") })).toEqual(["trefl", "trela"]);
  });
});
