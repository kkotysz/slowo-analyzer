import type { LetterState } from "../types/wordle";

interface TileProps {
  letter: string;
  state: LetterState;
  disabled?: boolean;
  onCycle?: () => void;
}

export function Tile({ letter, state, disabled = false, onCycle }: TileProps) {
  return (
    <button
      className={`tile tile-${state}`}
      type="button"
      disabled={disabled}
      onClick={onCycle}
      aria-label={`${letter || "puste"} ${state}`}
    >
      {letter || ""}
    </button>
  );
}
