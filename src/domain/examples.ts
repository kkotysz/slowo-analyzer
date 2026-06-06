import type { Guess } from "../types/wordle";
import { stringToPattern } from "./wordle";

export const EXAMPLE_GAME: Guess[] = [
  { word: "stare", pattern: stringToPattern("BYBYY") },
  { word: "krety", pattern: stringToPattern("BGGYB") },
  { word: "brent", pattern: stringToPattern("BGGBY") },
  { word: "treli", pattern: stringToPattern("GGGYB") },
  { word: "trefl", pattern: stringToPattern("GGGGG") },
];
