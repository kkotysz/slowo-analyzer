import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Guess, Pattern, Word } from "../types/wordle";
import {
  createEmptyGuess,
  cycleLetterState,
  formatWord,
  guessIsComplete,
  normalizeWord,
  replacePatternAt,
} from "../domain/wordle";
import { Tile } from "./Tile";

interface WordGridProps {
  guesses: Guess[];
  draft: Guess;
  maxRows?: number;
  onDraftChange: (guess: Guess) => void;
  onSubmitDraft: () => void;
  onUpdateGuess: (index: number, guess: Guess) => void;
  onRemoveGuess: (index: number) => void;
  lockPatterns?: boolean;
  virtualKeyboardActive?: boolean;
}

function lettersFor(word: Word): string[] {
  return formatWord(word).padEnd(5, " ").slice(0, 5).split("").map((letter) => letter.trim());
}

function nextPattern(pattern: Pattern, index: number): Pattern {
  return replacePatternAt(pattern, index, cycleLetterState(pattern[index]));
}

export function WordGrid({
  guesses,
  draft,
  maxRows = 6,
  onDraftChange,
  onSubmitDraft,
  onUpdateGuess,
  onRemoveGuess,
  lockPatterns = false,
  virtualKeyboardActive = false,
}: WordGridProps) {
  const gridRef = useRef<HTMLElement | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const rows = Array.from({ length: maxRows }, (_, index) => {
    if (index < guesses.length) return { kind: "guess" as const, guess: guesses[index] };
    if (index === guesses.length) return { kind: "draft" as const, guess: draft };
    return { kind: "empty" as const, guess: createEmptyGuess() };
  });

  useEffect(() => {
    if (guesses.length >= maxRows) return;
    if (virtualKeyboardActive) gridRef.current?.focus();
    else inputRefs.current[guesses.length]?.focus();
  }, [guesses.length, maxRows, virtualKeyboardActive]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.target instanceof HTMLInputElement && !virtualKeyboardActive) return;
    if (guesses.length >= maxRows) return;

    if (event.key === "Enter") {
      event.preventDefault();
      onSubmitDraft();
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      onDraftChange({ ...draft, word: draft.word.slice(0, -1) });
      return;
    }

    if (/^[a-ząćęłńóśźż]$/iu.test(event.key) && draft.word.length < 5) {
      event.preventDefault();
      onDraftChange({ ...draft, word: normalizeWord(`${draft.word}${event.key}`) });
    }
  }

  return (
    <section
      className={virtualKeyboardActive ? "word-grid virtual-keyboard-active" : "word-grid"}
      onKeyDown={handleKeyDown}
      ref={gridRef}
      tabIndex={0}
      aria-label="Grid gry"
    >
      {rows.map((row, rowIndex) => {
        const letters = lettersFor(row.guess.word);
        const isDraft = row.kind === "draft";
        const isSubmitted = row.kind === "guess";
        const isEmpty = row.kind === "empty";
        const rowLabel = isDraft
          ? virtualKeyboardActive ? "teraz" : "aktywny"
          : isSubmitted ? `${rowIndex + 1}` : "";

        return (
          <div className={`word-row ${isDraft ? "active" : ""} ${isEmpty ? "muted-row" : ""}`} key={rowIndex}>
            <span className="row-index">{rowLabel}</span>
            <div className="tile-strip">
              {letters.map((letter, tileIndex) => (
                <Tile
                  key={`${rowIndex}-${tileIndex}`}
                  letter={letter}
                  state={row.guess.pattern[tileIndex]}
                  disabled={isEmpty || lockPatterns}
                  onCycle={
                    isEmpty || lockPatterns
                      ? undefined
                      : () => {
                          const updated = { ...row.guess, pattern: nextPattern(row.guess.pattern, tileIndex) };
                          if (isDraft) onDraftChange(updated);
                          else onUpdateGuess(rowIndex, updated);
                        }
                  }
                />
              ))}
            </div>
            <input
              className="row-word-input"
              ref={(element) => {
                inputRefs.current[rowIndex] = element;
              }}
              value={formatWord(row.guess.word)}
              maxLength={5}
              disabled={isEmpty}
              inputMode={virtualKeyboardActive ? "none" : "text"}
              readOnly={virtualKeyboardActive}
              tabIndex={virtualKeyboardActive ? -1 : undefined}
              onChange={(event) => {
                const updated = { ...row.guess, word: normalizeWord(event.target.value) };
                if (isDraft) onDraftChange(updated);
                else onUpdateGuess(rowIndex, updated);
              }}
              onKeyDown={(event) => {
                if (isDraft && event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  onSubmitDraft();
                }
              }}
              aria-label={`Słowo w wierszu ${rowIndex + 1}`}
            />
            {isSubmitted ? (
              <button className="icon-button danger" type="button" onClick={() => onRemoveGuess(rowIndex)} aria-label="Usuń ruch">
                ×
              </button>
            ) : (
              <button
                className="commit-button"
                type="button"
                disabled={!isDraft || !guessIsComplete(draft)}
                onClick={onSubmitDraft}
              >
                Enter
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
