import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { analyzeGame, candidatesAfterGuesses, computeLuckScore } from "../domain/analysis";
import {
  annotateMoveWithAnswerMetadata,
  isUnlikelyAnswer,
} from "../domain/answerMetadata";
import { loadWordLists } from "../domain/dictionary";
import { EXAMPLE_GAME } from "../domain/examples";
import { commitWordToGame, pickRandomAnswer, truncateGuesses, updateGuessForMode } from "../domain/game";
import { isOpeningMoveRequest, preloadOpeningMoves, readPrecomputedOpeningMoves } from "../domain/openingMoves";
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
import { SolverPanel } from "../components/SolverPanel";
import { WordGrid } from "../components/WordGrid";
import { readStoredGame, readStoredTheme, writeStoredGame, writeStoredTheme } from "../storage/gamePersistence";
import { createAnalysisWorker, postCancelRequest, postRankRequest, postSolveRequest } from "../workers/analysisClient";
import type {
  AppMode,
  BucketSummary,
  DictionaryStatus as DictionaryStatusModel,
  Guess,
  MoveDetailsStats,
  MoveScore,
  RankingSortKey,
  SolverHistogramResult,
  SolverStrategySnapshot,
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
    answerMetadata: {},
    guesses: [],
    answers: [],
    mode: "shared",
  });
  const [dictionaryStatus, setDictionaryStatus] = useState<DictionaryStatusModel>(INITIAL_STATUS);
  const [mode, setMode] = useState<AppMode>(initialGame.mode);
  const [answer, setAnswer] = useState<Word>(initialGame.answer);
  const [guesses, setGuesses] = useState<Guess[]>(initialGame.guesses);
  const [draft, setDraft] = useState<Guess>(() => createEmptyGuess());
  const [candidateOnly, setCandidateOnly] = useState(true);
  const [exactRanking, setExactRanking] = useState(false);
  const [rankingSortKey, setRankingSortKey] = useState<RankingSortKey>("entropy");
  const [hideUnlikelyAnswers, setHideUnlikelyAnswers] = useState(true);
  const [moves, setMoves] = useState<MoveScore[]>([]);
  const [selectedMove, setSelectedMove] = useState<MoveScore | undefined>();
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("idle");
  const [workerProgress, setWorkerProgress] = useState(0);
  const [solverStartWord, setSolverStartWord] = useState<Word>("");
  const [solverMaxAttempts, setSolverMaxAttempts] = useState(6);
  const [solverStatus, setSolverStatus] = useState<WorkerStatus>("idle");
  const [solverProgress, setSolverProgress] = useState(0);
  const [solverResult, setSolverResult] = useState<SolverHistogramResult | undefined>();
  const [solverMessage, setSolverMessage] = useState("");
  const [message, setMessage] = useState("");
  const requestIdRef = useRef(0);
  const solverRequestIdRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const solverWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    setDictionaryStatus({ state: "loading", title: "Ładowanie słownika", detail: "Sprawdzam cache i źródła danych" });
    loadWordLists().then(({ lists, status }) => {
      setWordLists(lists);
      setDictionaryStatus(status);
      preloadOpeningMoves();
    });
  }, []);

  useEffect(() => {
    writeStoredGame({ mode, answer, guesses, dictionaryMode: wordLists.mode });
  }, [answer, guesses, mode, wordLists.mode]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      solverWorkerRef.current?.terminate();
    };
  }, []);

  const completeGuesses = useMemo(() => guesses.filter(guessIsComplete), [guesses]);
  const answerMetadata = wordLists.answerMetadata;
  const activePossibleAnswers = useMemo(() => (
    hideUnlikelyAnswers
      ? wordLists.possibleAnswers.filter((word) => !isUnlikelyAnswer(answerMetadata, word))
      : wordLists.possibleAnswers
  ), [answerMetadata, hideUnlikelyAnswers, wordLists.possibleAnswers]);
  const activeAllowedGuesses = useMemo(() => (
    hideUnlikelyAnswers
      ? wordLists.allowedGuesses.filter((word) => !isUnlikelyAnswer(answerMetadata, word))
      : wordLists.allowedGuesses
  ), [answerMetadata, hideUnlikelyAnswers, wordLists.allowedGuesses]);
  const effectiveAnswers = useMemo(() => {
    const normalizedAnswer = normalizeWord(answer);
    if (mode !== "simulation" || !isFiveLetterWord(normalizedAnswer) || activePossibleAnswers.includes(normalizedAnswer)) {
      return activePossibleAnswers;
    }
    return [...activePossibleAnswers, normalizedAnswer];
  }, [activePossibleAnswers, answer, mode]);
  const analysisSteps = useMemo(
    () => analyzeGame(completeGuesses, effectiveAnswers),
    [completeGuesses, effectiveAnswers],
  );
  const candidates = useMemo(
    () => candidatesAfterGuesses(completeGuesses, effectiveAnswers),
    [completeGuesses, effectiveAnswers],
  );
  const visibleMoves = useMemo(() => moves
    .map((move) => annotateMoveWithAnswerMetadata(move, answerMetadata))
    .filter((move) => !hideUnlikelyAnswers || !isUnlikelyAnswer(answerMetadata, move.word))
    .slice(0, RANK_LIMIT), [answerMetadata, hideUnlikelyAnswers, moves]);
  const allowedGuessSet = useMemo(() => new Set(wordLists.allowedGuesses), [wordLists.allowedGuesses]);
  const solverStrategy = useMemo((): SolverStrategySnapshot => ({
    candidateOnly,
    exact: exactRanking,
    sortKey: rankingSortKey,
  }), [candidateOnly, exactRanking, rankingSortKey]);
  const normalizedSolverStartWord = normalizeWord(solverStartWord);
  const solverCanStart = (
    dictionaryStatus.state !== "loading" &&
    activePossibleAnswers.length > 0 &&
    isFiveLetterWord(normalizedSolverStartWord) &&
    allowedGuessSet.has(normalizedSolverStartWord) &&
    solverMaxAttempts >= 1
  );
  useEffect(() => {
    if (selectedMove && hideUnlikelyAnswers && isUnlikelyAnswer(answerMetadata, selectedMove.word)) {
      setSelectedMove(undefined);
    }
  }, [answerMetadata, hideUnlikelyAnswers, selectedMove]);
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

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setWorkerStatus("idle");
    setWorkerProgress(0);
    let cancelled = false;

    const handleWorkerMessage = (event: MessageEvent<WorkerAnalyzeResponse>) => {
      const response = event.data;
      if (response.requestId !== requestIdRef.current) return;
      if (
        response.type === "solver-running" ||
        response.type === "solver-done" ||
        response.type === "solver-cancelled" ||
        response.type === "solver-error"
      ) return;

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

    const workerRequest = {
      type: "rank" as const,
      requestId,
      candidates,
      allowedGuesses: activeAllowedGuesses,
      limit: hideUnlikelyAnswers ? RANK_LIMIT * 2 : RANK_LIMIT,
      candidateOnly,
      sortKey: rankingSortKey,
      exact: exactRanking,
      answerProfile: hideUnlikelyAnswers ? "likelyOnly" as const : "all" as const,
      dictionaryVersion: wordLists.dictionaryVersion,
    };
    const openingRequest = {
      ...workerRequest,
      completeGuessCount: completeGuesses.length,
    };

    const startWorker = () => {
      if (cancelled || requestId !== requestIdRef.current) return;
      if (!workerRef.current) {
        workerRef.current = createAnalysisWorker();
      }
      const worker = workerRef.current;
      worker.onmessage = handleWorkerMessage;
      postRankRequest(worker, workerRequest);
    };

    if (isOpeningMoveRequest(openingRequest)) {
      if (moves.length) setWorkerStatus("done");
      readPrecomputedOpeningMoves(openingRequest).then((precomputedMoves) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        if (precomputedMoves) {
          setMoves(precomputedMoves);
          setWorkerStatus("done");
          setWorkerProgress(1);
          return;
        }
        setWorkerStatus(moves.length ? "done" : "idle");
        setWorkerProgress(moves.length ? 1 : 0);
      });
    } else {
      startWorker();
    }

    return () => {
      cancelled = true;
      requestIdRef.current = requestId;
    };
  }, [
    candidateOnly,
    candidates,
    completeGuesses.length,
    exactRanking,
    hideUnlikelyAnswers,
    rankingSortKey,
    activeAllowedGuesses,
    wordLists.dictionaryVersion,
  ]);

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
    const randomAnswer = pickRandomAnswer({ possibleAnswers: activePossibleAnswers });
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

  function updateSolverStartWord(word: Word): void {
    setSolverStartWord(normalizeWord(word));
    if (solverStatus !== "running") setSolverMessage("");
  }

  function updateSolverMaxAttempts(value: number): void {
    setSolverMaxAttempts(Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1);
    if (solverStatus !== "running") setSolverMessage("");
  }

  function handleSolverMessage(event: MessageEvent<WorkerAnalyzeResponse>): void {
    const response = event.data;
    if (response.requestId !== solverRequestIdRef.current) return;

    if (response.type === "solver-running") {
      setSolverStatus("running");
      setSolverProgress(response.progress);
      setSolverResult(response.result);
      setSolverMessage("");
    } else if (response.type === "solver-done") {
      setSolverStatus("done");
      setSolverProgress(1);
      setSolverResult(response.result);
      setSolverMessage("Solver zakończył liczenie.");
    } else if (response.type === "solver-cancelled") {
      setSolverStatus("cancelled");
      setSolverMessage("Przerwano liczenie solvera.");
    } else if (response.type === "solver-error") {
      setSolverStatus("error");
      setSolverMessage(response.message);
    }
  }

  function startSolver(): void {
    const startWord = normalizeWord(solverStartWord);
    if (!isFiveLetterWord(startWord)) {
      setSolverStatus("error");
      setSolverMessage("Wpisz pięcioliterowe słowo.");
      return;
    }
    if (!allowedGuessSet.has(startWord)) {
      setSolverStatus("error");
      setSolverMessage("To nie jest słowo ze słownika prób.");
      return;
    }
    if (!activePossibleAnswers.length) {
      setSolverStatus("error");
      setSolverMessage("Brak haseł do symulacji.");
      return;
    }

    const requestId = solverRequestIdRef.current + 1;
    solverRequestIdRef.current = requestId;
    if (!solverWorkerRef.current) {
      solverWorkerRef.current = createAnalysisWorker();
    }
    const worker = solverWorkerRef.current;
    worker.onmessage = handleSolverMessage;
    setSolverStatus("running");
    setSolverProgress(0);
    setSolverResult(undefined);
    setSolverMessage("Liczenie solvera...");
    postSolveRequest(worker, {
      type: "solve",
      requestId,
      startWord,
      maxAttempts: solverMaxAttempts,
      answers: activePossibleAnswers,
      allowedGuesses: activeAllowedGuesses,
      strategy: solverStrategy,
      dictionaryVersion: wordLists.dictionaryVersion,
    });
  }

  function stopSolver(): void {
    const requestId = solverRequestIdRef.current;
    if (solverWorkerRef.current) {
      postCancelRequest(solverWorkerRef.current, { type: "cancel", requestId });
      solverWorkerRef.current.terminate();
      solverWorkerRef.current = null;
    }
    solverRequestIdRef.current = requestId + 1;
    setSolverStatus("cancelled");
    setSolverProgress(0);
    setSolverMessage("Przerwano liczenie solvera.");
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
                disabled={!activePossibleAnswers.length}
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

          <SolverPanel
            startWord={solverStartWord}
            maxAttempts={solverMaxAttempts}
            answerCount={activePossibleAnswers.length}
            status={solverStatus}
            progress={solverProgress}
            result={solverResult}
            message={solverMessage}
            strategy={solverStrategy}
            canStart={solverCanStart}
            onStartWordChange={updateSolverStartWord}
            onMaxAttemptsChange={updateSolverMaxAttempts}
            onStart={startSolver}
            onStop={stopSolver}
          />

          <CandidatePanel
            candidates={candidates}
            answerMetadata={answerMetadata}
            onPickWord={pickWord}
          />
        </div>

        <aside className="side-column">
          <DictionaryStatus
            status={dictionaryStatus}
            onReload={reloadDictionary}
          />

          <GameSummary
            guesses={completeGuesses}
            steps={analysisSteps}
            candidateCount={candidates.length}
            bestMove={visibleMoves[0]}
            onPickWord={pickWord}
            onSelectStep={selectHistoryStep}
          />

          <BestMovesPanel
            moves={visibleMoves}
            status={workerStatus}
            progress={workerProgress}
            candidateOnly={candidateOnly}
            exactRanking={exactRanking}
            hideUnlikelyAnswers={hideUnlikelyAnswers}
            sortKey={rankingSortKey}
            inspectedWord={selectedMove?.word}
            onCandidateOnlyChange={setCandidateOnly}
            onExactRankingChange={setExactRanking}
            onHideUnlikelyAnswersChange={setHideUnlikelyAnswers}
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
