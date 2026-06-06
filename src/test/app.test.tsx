import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/App";

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
      allowedGuesses: ["stare", "trefl", "trier"],
      possibleAnswers: ["stare", "trefl"],
      guesses: ["stare", "trefl", "trier"],
      answers: ["stare", "trefl"],
      mode: "shared",
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
  postRankRequest: vi.fn(),
}));

describe("App interactions", () => {
  beforeEach(() => {
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
    expect(screen.getByText("0 / 6 ruchów")).toBeTruthy();
  });

  it("uses candidate-only and entropy ranking by default, then sorts by clicked headers", async () => {
    render(<App />);

    await screen.findByText("Słownik gotowy");

    expect(screen.queryByLabelText("Sortowanie rankingu")).toBeNull();
    expect(screen.getByLabelText("Tylko kandydaci")).toHaveProperty("checked", true);
    expect(screen.getByRole("button", { name: "Sortuj po: Entropia" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Sortuj po: Max bucket" }));

    expect(screen.getByRole("button", { name: "Sortuj po: Max bucket" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Sortuj po: Entropia" }).getAttribute("aria-pressed")).toBe("false");
  });
});
