import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { analyzeGame, candidatesAfterGuesses, computeLuckScore } from "../domain/analysis";
import { loadWordLists } from "../domain/dictionary";
import { EXAMPLE_GAME } from "../domain/examples";
import { commitWordToGame, pickRandomAnswer, truncateGuesses, updateGuessForMode } from "../domain/game";
import {
  createEmptyGuess,
  guessIsComplete,
  isFiveLetterWord,
  normalizeWord,
  patternToString,
  scoreGuess,
} from "../domain/wordle";
import { BestMovesPanel } from "../components/BestMovesPanel";
import { CandidatePanel } from "../components/CandidatePanel";
import { DictionaryStatus } from "../components/DictionaryStatus";
import { GameSummary } from "../components/GameSummary";
import { MoveDetailsPanel } from "../components/MoveDetailsPanel";
import { WordGrid } from "../components/WordGrid";
import { readDictionaryUrl, saveDictionaryUrl } from "../storage/dictionaryCache";
import { readStoredGame, readStoredTheme, writeStoredGame, writeStoredTheme } from "../storage/gamePersistence";
import { createAnalysisWorker, postRankRequest } from "../workers/analysisClient";
import type {
  AppMode,
  BucketSummary,
  DictionaryStatus as DictionaryStatusModel,
  Guess,
  MoveDetailsStats,
  MoveScore,
  RankingSortKey,
  Word,
  WordLists,
  WorkerAnalyzeResponse,
  WorkerStatus,
} from "../types/wordle";

const RANK_LIMIT = 24;

const INITIAL_STATUS: DictionaryStatusModel = {
  state: "idle",
  title: "Słownik",
  detail: "Oczekuje na wczytanie",
};

function messageTone(message: string): "info" | "success" | "error" {
  if (!message) return "info";
  if (/nie|brak|poczekaj|wpisz|plansza/i.test(message)) return "error";
  return "success";
}

function bucketSummariesWithCurrent(move: MoveScore, currentPattern: string): BucketSummary[] {
  let currentIsVisible = false;
  const summaries = move.bucketSummaries.map((bucket) => {
    const isCurrentBucket = bucket.pattern === currentPattern;
    if (isCurrentBucket) currentIsVisible = true;
    return { ...bucket, isCurrentBucket };
  });

  if (currentIsVisible) return summaries;

  return [
    {
      pattern: currentPattern,
      count: move.buckets[currentPattern] ?? 0,
      examples: [],
      isCurrentBucket: true,
    },
    ...summaries.map((bucket) => ({ ...bucket, isCurrentBucket: false })),
  ];
}

export function App() {
  const [initialGame] = useState(() => readStoredGame());
  const [theme, setTheme] = useState<"light" | "dark">(() => readStoredTheme() ?? "light");
  const [wordLists, setWordLists] = useState<WordLists>({
    allowedGuesses: [],
    possibleAnswers: [],
    guesses: [],
    answers: [],
    mode: "shared",
  });
  const [dictionaryStatus, setDictionaryStatus] = useState<DictionaryStatusModel>(INITIAL_STATUS);
  const [dictionaryUrl, setDictionaryUrl] = useState(() => readDictionaryUrl());
  const [mode, setMode] = useState<AppMode>(initialGame.mode);
  const [answer, setAnswer] = useState<Word>(initialGame.answer);
  const [guesses, setGuesses] = useState<Guess[]>(initialGame.guesses);
  const [draft, setDraft] = useState<Guess>(() => createEmptyGuess());
  const [candidateOnly, setCandidateOnly] = useState(true);
  const [exactRanking, setExactRanking] = useState(false);
  const [rankingSortKey, setRankingSortKey] = useState<RankingSortKey>("entropy");
  const [moves, setMoves] = useState<MoveScore[]>([]);
  const [selectedMove, setSelectedMove] = useState<MoveScore | undefined>();
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("idle");
  const [workerProgress, setWorkerProgress] = useState(0);
  const [message, setMessage] = useState("");
  const requestIdRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    setDictionaryStatus({ state: "loading", title: "Ładowanie słownika", detail: "Sprawdzam cache i źródła danych" });
    loadWordLists().then(({ lists, status }) => {
      setWordLists(lists);
      setDictionaryStatus(status);
    });
  }, []);

  useEffect(() => {
    writeStoredGame({ mode, answer, guesses, dictionaryMode: wordLists.mode });
  }, [answer, guesses, mode, wordLists.mode]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const completeGuesses = useMemo(() => guesses.filter(guessIsComplete), [guesses]);
  const effectiveAnswers = useMemo(() => {
    const normalizedAnswer = normalizeWord(answer);
    if (mode !== "simulation" || !isFiveLetterWord(normalizedAnswer) || wordLists.possibleAnswers.includes(normalizedAnswer)) {
      return wordLists.possibleAnswers;
    }
    return [...wordLists.possibleAnswers, normalizedAnswer];
  }, [answer, mode, wordLists.possibleAnswers]);
  const analysisSteps = useMemo(
    () => analyzeGame(completeGuesses, effectiveAnswers),
    [completeGuesses, effectiveAnswers],
  );
  const candidates = useMemo(
    () => candidatesAfterGuesses(completeGuesses, effectiveAnswers),
    [completeGuesses, effectiveAnswers],
  );
  const selectedMoveDetails = useMemo((): { stats?: MoveDetailsStats; buckets?: BucketSummary[] } => {
    if (!selectedMove) return {};

    const normalizedAnswer = normalizeWord(answer);
    if (mode === "simulation" && isFiveLetterWord(normalizedAnswer)) {
      const currentPattern = patternToString(scoreGuess(selectedMove.word, normalizedAnswer));
      const bucketSize = selectedMove.buckets[currentPattern] ?? 0;
      return {
        stats: {
          countBefore: candidates.length,
          countAfter: bucketSize,
          bucketLabel: currentPattern,
          luckScore: computeLuckScore(bucketSize, selectedMove.worstBucket),
          kind: "actual",
        },
        buckets: bucketSummariesWithCurrent(selectedMove, currentPattern),
      };
    }

    return {
      stats: {
        countBefore: candidates.length,
        countAfter: selectedMove.averageBucket,
        bucketLabel: selectedMove.worstBucket.toLocaleString("pl-PL"),
        luckScore: selectedMove.hitProbability * 100,
        kind: "expected",
      },
      buckets: selectedMove.bucketSummaries,
    };
  }, [answer, candidates.length, mode, selectedMove]);
  const gameMessage = message || (mode === "simulation"
    ? "Wpisz hasło końcowe; kolory będą liczone automatycznie."
    : "Wpisz słowo w aktywnym wierszu i ustaw kolory kafelków.");
  const gameMessageTone = messageTone(message);

  useEffect(() => {
    if (!wordLists.allowedGuesses.length || !candidates.length) {
      setMoves([]);
      setWorkerStatus("idle");
      return;
    }

    if (!workerRef.current) {
      workerRef.current = createAnalysisWorker();
    }

    const worker = workerRef.current;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setWorkerStatus("running");
    setWorkerProgress(0);

    worker.onmessage = (event: MessageEvent<WorkerAnalyzeResponse>) => {
      const response = event.data;
      if (response.requestId !== requestIdRef.current) return;

      if (response.type === "running") {
        setWorkerStatus("running");
        setWorkerProgress(response.progress);
      } else if (response.type === "done") {
        setMoves(response.moves);
        setWorkerStatus("done");
        setWorkerProgress(1);
      } else if (response.type === "cancelled") {
        setWorkerStatus("cancelled");
      } else {
        setMoves([]);
        setWorkerStatus("error");
        setMessage(response.message);
      }
    };

    postRankRequest(worker, {
      type: "rank",
      requestId,
      candidates,
      allowedGuesses: wordLists.allowedGuesses,
      limit: RANK_LIMIT,
      candidateOnly,
      sortKey: rankingSortKey,
      exact: exactRanking,
    });

    return () => {
      requestIdRef.current = requestId;
    };
  }, [candidateOnly, candidates, exactRanking, rankingSortKey, wordLists.allowedGuesses]);

  function applyGameCommand(result: ReturnType<typeof commitWordToGame>): void {
    setGuesses(result.nextGuesses);
    setDraft(result.nextDraft);
    setMessage(result.message);
    if (result.status === "ok") setSelectedMove(undefined);
  }

  function commitWord(rawWord: Word): void {
    applyGameCommand(commitWordToGame({
      mode,
      answer,
      guesses,
      word: rawWord,
      manualPattern: draft.pattern,
      dictionary: wordLists,
    }));
  }

  function submitDraft(): void {
    commitWord(draft.word);
  }

  function updateGuess(index: number, guess: Guess): void {
    setGuesses((current) => current.map((item, idx) => (
      idx === index ? updateGuessForMode(guess, mode, answer) : item
    )));
  }

  function removeGuess(index: number): void {
    setGuesses((current) => current.slice(0, index));
  }

  function pickWord(word: Word): void {
    commitWord(word);
  }

  function loadExample(): void {
    setMode("simulation");
    setAnswer("trefl");
    setGuesses(EXAMPLE_GAME);
    setDraft(createEmptyGuess());
    setMessage("Wczytano przykład gry.");
  }

  function loadRandomAnswer(): void {
    const randomAnswer = pickRandomAnswer(wordLists);
    if (!randomAnswer) {
      setMessage("Brak słów w słowniku odpowiedzi.");
      return;
    }
    setMode("simulation");
    setAnswer(randomAnswer);
    setGuesses([]);
    setDraft(createEmptyGuess());
    setSelectedMove(undefined);
    setMessage("Wylosowano hasło treningowe.");
  }

  function clearGame(): void {
    setGuesses([]);
    setAnswer("");
    setDraft(createEmptyGuess());
    setMoves([]);
    setSelectedMove(undefined);
    setMessage("");
  }

  function selectHistoryStep(index: number): void {
    setGuesses((current) => truncateGuesses(current, index));
    setDraft(createEmptyGuess());
    setSelectedMove(undefined);
    setMessage(`Cofnięto do etapu ${index + 1}.`);
  }

  function reloadDictionary(): void {
    setDictionaryStatus({ state: "loading", title: "Ładowanie słownika", detail: "Odświeżam źródła danych" });
    loadWordLists({ forceRefresh: true }).then(({ lists, status }) => {
      setWordLists(lists);
      setDictionaryStatus(status);
    });
  }

  return (
    <AppShell
      theme={theme}
      onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      onLoadExample={loadExample}
      onClear={clearGame}
    >
      <div className="workspace">
        <div className="main-column">
          <section className="panel board-panel">
            <div className="panel-header">
              <div>
                <h2>Gra</h2>
                <p className={`game-message ${gameMessageTone}`} aria-live="polite">{gameMessage}</p>
              </div>
              <button type="button" className="primary-button" onClick={submitDraft} disabled={!guessIsComplete(draft)}>
                Dodaj ruch
              </button>
            </div>
            <div className="mode-controls" aria-label="Tryb analizy">
              <button
                type="button"
                className={mode === "simulation" ? "mode-button active" : "mode-button"}
                onClick={() => setMode("simulation")}
              >
                Symulacja z hasłem
              </button>
              <button
                type="button"
                className={mode === "manual" ? "mode-button active" : "mode-button"}
                onClick={() => setMode("manual")}
              >
                Analiza ręczna
              </button>
              <button
                type="button"
                className="mode-button"
                onClick={loadRandomAnswer}
                disabled={!wordLists.possibleAnswers.length}
              >
                Losowe hasło
              </button>
              <label className="answer-control">
                <span>Hasło końcowe</span>
                <input
                  value={answer.toLocaleUpperCase("pl-PL")}
                  maxLength={5}
                  disabled={mode !== "simulation"}
                  onChange={(event) => {
                    const nextAnswer = normalizeWord(event.target.value);
                    setAnswer(nextAnswer);
                    setGuesses((current) => current.map((guess) => ({
                      ...guess,
                      pattern: isFiveLetterWord(guess.word) && isFiveLetterWord(nextAnswer)
                        ? scoreGuess(guess.word, nextAnswer)
                        : guess.pattern,
                    })));
                  }}
                  placeholder="np. TREFL"
                />
              </label>
            </div>
            <WordGrid
              guesses={guesses}
              draft={draft}
              onDraftChange={(nextDraft) => setDraft({ ...nextDraft, word: normalizeWord(nextDraft.word) })}
              onSubmitDraft={submitDraft}
              onUpdateGuess={updateGuess}
              onRemoveGuess={removeGuess}
              lockPatterns={mode === "simulation"}
            />
          </section>

          <CandidatePanel candidates={candidates} onPickWord={pickWord} />
        </div>

        <aside className="side-column">
          <DictionaryStatus
            status={dictionaryStatus}
            url={dictionaryUrl}
            onUrlChange={(url) => {
              saveDictionaryUrl(url);
              setDictionaryUrl(url);
            }}
            onReload={reloadDictionary}
          />

          <GameSummary
            guesses={completeGuesses}
            steps={analysisSteps}
            candidateCount={candidates.length}
            bestMove={moves[0]}
            onPickWord={pickWord}
            onSelectStep={selectHistoryStep}
          />

          <BestMovesPanel
            moves={moves}
            status={workerStatus}
            progress={workerProgress}
            candidateOnly={candidateOnly}
            exactRanking={exactRanking}
            sortKey={rankingSortKey}
            inspectedWord={selectedMove?.word}
            onCandidateOnlyChange={setCandidateOnly}
            onExactRankingChange={setExactRanking}
            onSortKeyChange={setRankingSortKey}
            onPickWord={pickWord}
            onInspectMove={setSelectedMove}
          />

          <MoveDetailsPanel
            move={selectedMove}
            moveBuckets={selectedMoveDetails.buckets}
            moveStats={selectedMoveDetails.stats}
            latestStep={analysisSteps.at(-1)}
          />
        </aside>
      </div>
    </AppShell>
  );
}
