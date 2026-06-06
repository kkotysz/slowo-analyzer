import { useMemo, useState } from "react";
import type { Word } from "../types/wordle";
import { formatWord, normalizeWord } from "../domain/wordle";
import { rankByLetterHeuristic } from "../domain/ranking";

interface CandidatePanelProps {
  candidates: Word[];
  onPickWord: (word: Word) => void;
}

const RENDER_LIMIT = 420;
const RENDER_INCREMENT = 420;
type CandidateSortMode = "relevance" | "alphabetical";

export function CandidatePanel({ candidates, onPickWord }: CandidatePanelProps) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<CandidateSortMode>("relevance");
  const [visibleLimit, setVisibleLimit] = useState(RENDER_LIMIT);
  const normalizedQuery = normalizeWord(query);

  const filtered = useMemo(() => {
    const words = normalizedQuery ? candidates.filter((word) => word.includes(normalizedQuery)) : candidates;
    if (sortMode === "alphabetical") {
      return [...words].sort((a, b) => a.localeCompare(b, "pl"));
    }
    return rankByLetterHeuristic(words, candidates, words.length);
  }, [candidates, normalizedQuery, sortMode]);

  const visibleWords = filtered.slice(0, visibleLimit);

  return (
    <section className="panel candidates-panel">
      <div className="panel-header">
        <div>
          <h2>Pozostałe słowa</h2>
          <p>{filtered.length.toLocaleString("pl-PL")} z {candidates.length.toLocaleString("pl-PL")}</p>
        </div>
        <div className="panel-actions">
          <label className="select-row">
            <span>Sortuj</span>
            <select
              value={sortMode}
              onChange={(event) => {
                setSortMode(event.target.value as CandidateSortMode);
                setVisibleLimit(RENDER_LIMIT);
              }}
              aria-label="Sortowanie kandydatów"
            >
              <option value="relevance">Trafność</option>
              <option value="alphabetical">Alfabet</option>
            </select>
          </label>
          <input
            className="compact-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleLimit(RENDER_LIMIT);
            }}
            placeholder="Filtr"
            aria-label="Filtr kandydatów"
          />
        </div>
      </div>
      <div className="word-chip-list">
        {visibleWords.map((word) => (
          <button type="button" className="word-chip" key={word} onClick={() => onPickWord(word)}>
            {formatWord(word)}
          </button>
        ))}
      </div>
      {visibleWords.length < filtered.length ? (
        <button
          type="button"
          className="secondary-button load-more-button"
          onClick={() => setVisibleLimit((current) => current + RENDER_INCREMENT)}
        >
          Pokaż więcej
        </button>
      ) : null}
    </section>
  );
}
