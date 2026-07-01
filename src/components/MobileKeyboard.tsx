import { useMemo, useState } from "react";
import type { Guess, LetterState, Word } from "../types/wordle";
import { formatWord, guessIsComplete, normalizeWord } from "../domain/wordle";

interface MobileKeyboardProps {
  draft: Guess;
  guesses: Guess[];
  maxRows?: number;
  onDraftChange: (guess: Guess) => void;
  onSubmitDraft: () => void;
}

const LETTER_ROWS = [
  [..."QWERTYUIOP"],
  [..."ASDFGHJKL"],
  [..."ZXCVBNM"],
];
const POLISH_LETTERS = [..."ĄĆĘŁŃÓŚŹŻ"];
const STATE_PRIORITY: Record<LetterState, number> = { B: 1, Y: 2, G: 3 };

function keyboardStates(guesses: readonly Guess[]): ReadonlyMap<string, LetterState> {
  const states = new Map<string, LetterState>();
  for (const guess of guesses) {
    [...formatWord(guess.word)].forEach((letter, index) => {
      const nextState = guess.pattern[index];
      const currentState = states.get(letter);
      if (!currentState || STATE_PRIORITY[nextState] > STATE_PRIORITY[currentState]) {
        states.set(letter, nextState);
      }
    });
  }
  return states;
}

export function MobileKeyboard({
  draft,
  guesses,
  maxRows = 6,
  onDraftChange,
  onSubmitDraft,
}: MobileKeyboardProps) {
  const [polishOpen, setPolishOpen] = useState(false);
  const states = useMemo(() => keyboardStates(guesses), [guesses]);
  const disabled = guesses.length >= maxRows;
  const draftLetters = [...draft.word];

  function addLetter(letter: string): void {
    if (disabled || draftLetters.length >= 5) return;
    onDraftChange({ ...draft, word: normalizeWord(`${draft.word}${letter}`) });
  }

  function removeLetter(): void {
    if (disabled || draftLetters.length === 0) return;
    onDraftChange({ ...draft, word: draftLetters.slice(0, -1).join("") });
  }

  function letterKey(letter: string, extraClass = "") {
    const state = states.get(letter);
    return (
      <button
        type="button"
        className={`keyboard-key keyboard-letter ${state ? `key-${state}` : ""} ${extraClass}`.trim()}
        key={letter}
        aria-label={`Litera ${letter}`}
        disabled={disabled || draftLetters.length >= 5}
        onClick={() => {
          addLetter(letter);
          if (POLISH_LETTERS.includes(letter)) setPolishOpen(false);
        }}
      >
        {letter}
      </button>
    );
  }

  return (
    <section className="mobile-keyboard" aria-label="Klawiatura ekranowa">
      {polishOpen ? (
        <div className="keyboard-row polish-row" id="polish-key-row" aria-label="Polskie znaki">
          {POLISH_LETTERS.map((letter) => letterKey(letter, "polish-key"))}
        </div>
      ) : null}
      <div className="keyboard-row">{LETTER_ROWS[0].map((letter) => letterKey(letter))}</div>
      <div className="keyboard-row middle-row">{LETTER_ROWS[1].map((letter) => letterKey(letter))}</div>
      <div className="keyboard-row action-row">
        <button
          type="button"
          className="keyboard-key keyboard-action enter-key"
          disabled={disabled || !guessIsComplete(draft)}
          onClick={onSubmitDraft}
        >
          Enter
        </button>
        {LETTER_ROWS[2].map((letter) => letterKey(letter))}
        <button
          type="button"
          className={polishOpen ? "keyboard-key keyboard-action pl-key active" : "keyboard-key keyboard-action pl-key"}
          aria-expanded={polishOpen}
          aria-controls="polish-key-row"
          disabled={disabled}
          onClick={() => setPolishOpen((current) => !current)}
        >
          PL
        </button>
        <button
          type="button"
          className="keyboard-key keyboard-action backspace-key"
          aria-label="Usuń literę"
          disabled={disabled || draftLetters.length === 0}
          onClick={removeLetter}
        >
          ⌫
        </button>
      </div>
    </section>
  );
}
