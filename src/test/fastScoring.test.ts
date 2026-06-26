import { describe, expect, it } from "vitest";
import { encodeWord, scoreEncodedGuessCode } from "../domain/fastScoring";
import { codeToPatternString, scoreGuessCode } from "../domain/wordle";

describe("fast scoring", () => {
  it("matches regular Wordle scoring for repeated and Polish letters", () => {
    const words = ["trefl", "słowo", "wanna", "żółty", "abbba", "aaccc", "kolia", "lamka"];

    for (const guess of words) {
      for (const answer of words) {
        const fastCode = scoreEncodedGuessCode(encodeWord(guess), encodeWord(answer));
        expect(codeToPatternString(fastCode), `${guess} vs ${answer}`).toBe(codeToPatternString(scoreGuessCode(guess, answer)));
      }
    }
  });
});
