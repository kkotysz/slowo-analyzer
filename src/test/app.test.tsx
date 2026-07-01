import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/App";
import { loadWordLists } from "../domain/dictionary";
import { readPrecomputedOpeningMoves } from "../domain/openingMoves";
import {
  postCancelRequest,
  postEvaluateTurnsRequest,
  postRankRequest,
  postSolveRequest,
} from "../workers/analysisClient";
import type { MoveScore, SolverHistogramResult } from "../types/wordle";

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => store.delete(key)),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  };
}

vi.mock("../domain/dictionary", () => ({
  loadWordLists: vi.fn(async () => ({
    lists: {
      allowedGuesses: ["stare", "trefl", "trela", "trier"],
      possibleAnswers: ["stare", "trefl", "trela"],
      answerMetadata: {
        stare: { likelihood: "likely" },
        trefl: { likelihood: "likely" },
        trela: { likelihood: "unlikely", reason: "inflection", lemmas: ["trel"] },
      },
      guesses: ["stare", "trefl", "trela", "trier"],
      answers: ["stare", "trefl", "trela"],
      mode: "separate",
      dictionaryVersion: "test",
    },
    status: {
      state: "ready",
      title: "Słownik gotowy",
      detail: "2 słowa testowe",
    },
  })),
}));

vi.mock("../workers/analysisClient", () => ({
  createAnalysisWorker: vi.fn(() => ({
    onmessage: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  })),
  postCancelRequest: vi.fn(),
  postEvaluateTurnsRequest: vi.fn(),
  postRankRequest: vi.fn(),
  postSolveRequest: vi.fn(),
}));

vi.mock("../domain/openingMoves", () => ({
  isOpeningMoveRequest: vi.fn((request: { exact: boolean; completeGuessCount: number }) => (
    request.exact && request.completeGuessCount === 0
  )),
  preloadOpeningMoves: vi.fn(),
  readPrecomputedOpeningMoves: vi.fn(async () => null),
}));

function makeMove(word: string, entropy: number): MoveScore {
  return {
    word,
    entropy,
    averageBucket: 1,
    worstBucket: 1,
    hitProbability: 0.5,
    isCandidate: true,
    buckets: { GGGGG: 1 },
    bucketSummaries: [{ pattern: "GGGGG", count: 1, examples: [word], isCurrentBucket: true }],
  };
}

function makeSolverResult(requestId: number): { requestId: number; result: SolverHistogramResult } {
  return {
    requestId,
    result: {
      startWord: "stare",
      maxAttempts: 3,
      totalAnswers: 2,
      processedAnswers: 1,
      solvedAnswers: 1,
      unsolvedAnswers: 0,
      averageAttempts: 1,
      strategy: {
        candidateOnly: true,
        exact: false,
        sortKey: "worstBucket",
      },
      histogram: [
        { attempts: 1, label: "1", count: 1, percentage: 50 },
        { attempts: 2, label: "2", count: 0, percentage: 0 },
        { attempts: 3, label: "3", count: 0, percentage: 0 },
        { attempts: "unsolved", label: ">3", count: 0, percentage: 0 },
      ],
    },
  };
}

describe("App interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  it("commits a clicked candidate immediately and focuses the next input", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Hasło końcowe"), { target: { value: "trefl" } });
    fireEvent.click(await screen.findByRole("button", { name: "STARE" }));

    await waitFor(() => {
      expect((screen.getByLabelText("Słowo w wierszu 1") as HTMLInputElement).value).toBe("STARE");
    });
    expect(document.activeElement).toBe(screen.getByLabelText("Słowo w wierszu 2"));
  });

  it("rejects a submitted word when it is not in the dictionary", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");
    fireEvent.change(screen.getByLabelText("Hasło końcowe"), { target: { value: "trefl" } });
    fireEvent.change(screen.getByLabelText("Słowo w wierszu 1"), { target: { value: "abcde" } });
    fireEvent.keyDown(screen.getByLabelText("Słowo w wierszu 1"), { key: "Enter" });

    await screen.findByText("To nie jest słowo ze słownika.");
    expect((screen.getByLabelText("Słowo w wierszu 1") as HTMLInputElement).value).toBe("ABCDE");
    expect(screen.getByText(/0 \/ 6 ruchów · dodaj pierwszy ruch/i)).toBeTruthy();
  });

  it("uses candidate-only and entropy ranking by default, then sorts by clicked headers", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");

    expect(screen.queryByLabelText("Sortowanie rankingu")).toBeNull();
    expect(screen.getByLabelText("Tylko kandydaci")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Ukryj unlikely")).toHaveProperty("checked", true);
    expect(screen.getByRole("button", { name: "Sortuj po: Entropia" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Sortuj po: Max bucket" }));

    expect(screen.getByRole("button", { name: "Sortuj po: Max bucket" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Sortuj po: Entropia" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Sortuj po: Średnia liczba ruchów" }));
    expect(screen.getByRole("button", { name: "Sortuj po: Średnia liczba ruchów" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the dictionary source local and reloads without a custom URL field", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");
    expect(screen.queryByLabelText("URL słownika")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Wczytaj" }));

    await waitFor(() => {
      expect(vi.mocked(loadWordLists)).toHaveBeenCalledWith({ forceRefresh: true });
    });
  });

  it("uses allowed guesses for ranking and possible answers for random training", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    render(<App />);

    await screen.findByText("Słownik gotowy");

    await waitFor(() => {
      expect(vi.mocked(postRankRequest)).toHaveBeenCalled();
    });
    const request = vi.mocked(postRankRequest).mock.calls.at(-1)?.[1];
    expect(request?.allowedGuesses).toContain("trier");
    expect(request?.allowedGuesses).not.toContain("trela");
    expect(request?.candidates).toEqual(["stare", "trefl"]);
    expect(request?.answerProfile).toBe("likelyOnly");

    fireEvent.click(screen.getByRole("button", { name: "Losowe hasło" }));

    expect((screen.getByLabelText("Hasło końcowe") as HTMLInputElement).value).toBe("TREFL");
    randomSpy.mockRestore();
  });

  it("uses precomputed opening moves as the worker seed for exact ranking", async () => {
    vi.mocked(readPrecomputedOpeningMoves).mockResolvedValueOnce([makeMove("trefl", 9)]);
    render(<App />);

    await screen.findByText("Słownik gotowy");
    await waitFor(() => {
      expect(vi.mocked(postRankRequest)).toHaveBeenCalled();
    });
    const callsBeforeExact = vi.mocked(postRankRequest).mock.calls.length;

    fireEvent.click(screen.getByLabelText("Dokładnie"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /TREFL kandydat 9,000 1 1,0 50,0%/ })).toBeTruthy();
    });
    expect(vi.mocked(postRankRequest).mock.calls.length).toBeGreaterThan(callsBeforeExact);
    expect(vi.mocked(postRankRequest).mock.calls.at(-1)?.[1].precomputedMoves?.[0].word).toBe("trefl");
  });

  it("does not start exact opening calculation when precomputed moves are unavailable", async () => {
    vi.mocked(readPrecomputedOpeningMoves).mockResolvedValueOnce(null);
    render(<App />);

    await screen.findByText("Słownik gotowy");
    await waitFor(() => {
      expect(vi.mocked(postRankRequest)).toHaveBeenCalled();
    });
    const callsBeforeExact = vi.mocked(postRankRequest).mock.calls.length;

    fireEvent.click(screen.getByLabelText("Dokładnie"));

    await waitFor(() => {
      expect(vi.mocked(readPrecomputedOpeningMoves)).toHaveBeenCalled();
    });
    expect(screen.queryByText("Nie udało się wczytać gotowego rankingu startowego.")).toBeNull();
    expect(screen.queryByText(/^Liczenie/)).toBeNull();
    expect(vi.mocked(postRankRequest)).toHaveBeenCalledTimes(callsBeforeExact);
  });

  it("keeps solver start disabled until a valid dictionary word is entered", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");
    expect(screen.getByRole("button", { name: "Start" })).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Słowo startowe"), { target: { value: "abcde" } });

    expect(screen.getByRole("button", { name: "Start" })).toHaveProperty("disabled", true);
    expect(vi.mocked(postSolveRequest)).not.toHaveBeenCalled();
  });

  it("evaluates the last committed word in the game summary", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");
    fireEvent.change(screen.getByLabelText("Hasło końcowe"), { target: { value: "trefl" } });
    fireEvent.click(screen.getByRole("button", { name: "STARE" }));

    await waitFor(() => {
      expect(vi.mocked(postEvaluateTurnsRequest)).toHaveBeenCalled();
    });
    expect(screen.getByText(/ocena STARE/i)).toBeTruthy();
    expect(screen.queryByText("Najlepszy ruch")).toBeNull();

    const evaluationCall = vi.mocked(postEvaluateTurnsRequest).mock.calls.at(-1);
    expect(evaluationCall).toBeTruthy();
    const [worker, request] = evaluationCall!;
    worker.onmessage?.({
      data: {
        type: "turns-done",
        requestId: request.requestId,
        metric: {
          averageAttempts: 1.5,
          solveRate: 1,
          solvedAnswers: 2,
          totalAnswers: 2,
          status: "simulated",
        },
      },
    } as MessageEvent);

    expect(await screen.findByText("1,50")).toBeTruthy();
    expect(screen.getByText("100% w ≤6")).toBeTruthy();
  });

  it("updates ranking turns from an estimate to a simulated result", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");
    await waitFor(() => {
      expect(vi.mocked(postRankRequest)).toHaveBeenCalled();
    });
    const rankCall = vi.mocked(postRankRequest).mock.calls.at(-1);
    expect(rankCall).toBeTruthy();
    const [worker, request] = rankCall!;
    const estimatedMove = {
      ...makeMove("stare", 3),
      turnsMetric: {
        averageAttempts: 4.5,
        solveRate: null,
        solvedAnswers: 0,
        totalAnswers: 2,
        status: "estimated" as const,
      },
    };
    worker.onmessage?.({
      data: {
        type: "running",
        requestId: request.requestId,
        progress: 0.5,
        phase: "turns",
        moves: [estimatedMove],
      },
    } as MessageEvent);

    expect(await screen.findByText("~4,50")).toBeTruthy();

    worker.onmessage?.({
      data: {
        type: "done",
        requestId: request.requestId,
        moves: [{
          ...estimatedMove,
          turnsMetric: {
            averageAttempts: 3.75,
            solveRate: 1,
            solvedAnswers: 2,
            totalAnswers: 2,
            status: "simulated",
          },
        }],
      },
    } as MessageEvent);

    expect(await screen.findByText("3,75")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("re-evaluates the previous word after truncating history", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");
    fireEvent.change(screen.getByLabelText("Hasło końcowe"), { target: { value: "trefl" } });
    fireEvent.change(screen.getByLabelText("Słowo w wierszu 1"), { target: { value: "stare" } });
    fireEvent.keyDown(screen.getByLabelText("Słowo w wierszu 1"), { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Słowo w wierszu 2"), { target: { value: "trefl" } });
    fireEvent.keyDown(screen.getByLabelText("Słowo w wierszu 2"), { key: "Enter" });

    expect(await screen.findByText(/2 \/ 6 ruchów · ocena TREFL/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /1\. STARE/i }));

    expect(await screen.findByText(/1 \/ 6 ruchów · ocena STARE/i)).toBeTruthy();
    expect((screen.getByLabelText("Słowo w wierszu 2") as HTMLInputElement).value).toBe("");
  });

  it("starts solver with active answer list and current ranking settings", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");
    fireEvent.click(screen.getByRole("button", { name: "Sortuj po: Max bucket" }));
    fireEvent.change(screen.getByLabelText("Słowo startowe"), { target: { value: "stare" } });
    fireEvent.change(screen.getByLabelText("Limit prób"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(vi.mocked(postSolveRequest)).toHaveBeenCalled();
    });
    const request = vi.mocked(postSolveRequest).mock.calls.at(-1)?.[1];
    expect(request?.answers).toEqual(["stare", "trefl"]);
    expect(request?.allowedGuesses).toContain("trier");
    expect(request?.allowedGuesses).not.toContain("trela");
    expect(request?.maxAttempts).toBe(3);
    expect(request?.strategy).toEqual({
      candidateOnly: true,
      exact: false,
      sortKey: "worstBucket",
    });
  });

  it("hides unlikely candidates by default and marks them after toggling the filter", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");

    expect(screen.queryByRole("button", { name: /TRELA/i })).toBeNull();

    fireEvent.click(screen.getByLabelText("Ukryj unlikely"));

    const unlikelyCandidate = await screen.findByRole("button", { name: /TRELA odmiana/i });
    expect(unlikelyCandidate.getAttribute("title")).toBe("Odmiana: trel");
  });

  it("updates the solver histogram from worker progress", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");
    fireEvent.change(screen.getByLabelText("Słowo startowe"), { target: { value: "stare" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(vi.mocked(postSolveRequest)).toHaveBeenCalled();
    });
    const solveCall = vi.mocked(postSolveRequest).mock.calls.at(-1);
    expect(solveCall).toBeTruthy();
    const [worker, request] = solveCall!;
    const progress = makeSolverResult(request.requestId);
    worker.onmessage?.({
      data: {
        type: "solver-running",
        requestId: progress.requestId,
        progress: 0.5,
        result: progress.result,
      },
    } as MessageEvent);

    expect(await screen.findByText("Liczenie 50%")).toBeTruthy();
    expect(screen.getByLabelText("1: 1 haseł")).toBeTruthy();
  });

  it("cancels the active solver worker", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");
    fireEvent.change(screen.getByLabelText("Słowo startowe"), { target: { value: "stare" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(vi.mocked(postSolveRequest)).toHaveBeenCalled();
    });
    const solveCall = vi.mocked(postSolveRequest).mock.calls.at(-1);
    expect(solveCall).toBeTruthy();
    const [worker, request] = solveCall!;
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(vi.mocked(postCancelRequest)).toHaveBeenCalledWith(worker, {
      type: "cancel",
      requestId: request.requestId,
    });
    expect(worker.terminate).toHaveBeenCalled();
    expect(screen.getByText("Przerwano liczenie solvera.")).toBeTruthy();
  });
});
