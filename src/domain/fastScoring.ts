import type { Word } from "../types/wordle";

const POWERS_OF_THREE = [1, 3, 9, 27, 81] as const;

export const PATTERN_COUNT = 243;
export const SOLVED_PATTERN_CODE = 242;
export type EncodedWord = Uint16Array<ArrayBufferLike>;
type LetterCounts = Uint8Array<ArrayBufferLike>;

export function encodeWord(word: Word): EncodedWord {
  const encoded = new Uint16Array(5);
  for (let index = 0; index < 5; index += 1) {
    encoded[index] = word.charCodeAt(index);
  }
  return encoded;
}

function addRemaining(
  char: number,
  chars: EncodedWord,
  counts: Uint8Array,
  used: number,
): number {
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

function takeRemaining(
  char: number,
  chars: EncodedWord,
  counts: Uint8Array,
  used: number,
): boolean {
  for (let index = 0; index < used; index += 1) {
    if (chars[index] === char && counts[index] > 0) {
      counts[index] -= 1;
      return true;
    }
  }
  return false;
}

export function scoreEncodedGuessCode(
  guess: EncodedWord,
  answer: EncodedWord,
  remainingChars: EncodedWord = new Uint16Array(5),
  remainingCounts: LetterCounts = new Uint8Array(5),
): number {
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
