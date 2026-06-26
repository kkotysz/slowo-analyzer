import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../app/AppShell";
import { BestMovesPanel } from "../components/BestMovesPanel";
import { CandidatePanel } from "../components/CandidatePanel";
import { GameSummary } from "../components/GameSummary";
import { MoveDetailsPanel } from "../components/MoveDetailsPanel";
import { WordGrid } from "../components/WordGrid";
import { stringToPattern } from "../domain/wordle";
import type { MoveScore } from "../types/wordle";

describe("component interactions", () => {
  function makeMove(word: string, entropy: number): MoveScore {
    return {
      word,
      entropy,
      averageBucket: 3,
      worstBucket: 6,
      hitProbability: 0.1,
      isCandidate: true,
      buckets: { BYBYY: 4 },
      bucketSummaries: [
        { pattern: "BYBYY", count: 4, examples: ["trefl"] },
      ],
    };
  }

  it("inspects a ranking move on pointer hover", () => {
    const onInspectMove = vi.fn();
    const trier = makeMove("trier", 4.073);

    render(
      <BestMovesPanel
        moves={[trier, makeMove("tenor", 4.055)]}
        status="done"
        progress={1}
        candidateOnly
        exactRanking={false}
        hideUnlikelyAnswers
        sortKey="entropy"
        inspectedWord="trier"
        onCandidateOnlyChange={vi.fn()}
        onExactRankingChange={vi.fn()}
        onHideUnlikelyAnswersChange={vi.fn()}
        onSortKeyChange={vi.fn()}
        onPickWord={vi.fn()}
        onInspectMove={onInspectMove}
      />,
    );

    const trierButton = screen.getByRole("button", { name: /trier/i });
    expect(trierButton.classList.contains("inspected")).toBe(true);

    fireEvent.pointerEnter(trierButton);

    expect(onInspectMove).toHaveBeenCalledWith(trier);
  });

  it("marks unlikely ranking moves as inflections", () => {
    render(
      <BestMovesPanel
        moves={[{ ...makeMove("aferą", 2.2), likelihood: "unlikely", lemmas: ["afera"] }]}
        status="done"
        progress={1}
        candidateOnly={false}
        exactRanking={false}
        hideUnlikelyAnswers={false}
        sortKey="entropy"
        onCandidateOnlyChange={vi.fn()}
        onExactRankingChange={vi.fn()}
        onHideUnlikelyAnswersChange={vi.fn()}
        onSortKeyChange={vi.fn()}
        onPickWord={vi.fn()}
        onInspectMove={vi.fn()}
      />,
    );

    const move = screen.getByRole("button", { name: /AFERĄ odmiana/i });
    expect(move.getAttribute("title")).toBe("Odmiana: afera");
  });

  it("updates the move details strip for the inspected move", () => {
    const move: MoveScore = {
      word: "stare",
      entropy: 2.5,
      averageBucket: 3,
      worstBucket: 6,
      hitProbability: 0.1,
      isCandidate: true,
      buckets: { BYBYY: 4, BGGGG: 1 },
      bucketSummaries: [
        { pattern: "BYBYY", count: 4, examples: ["trefl"], isCurrentBucket: true },
      ],
    };

    const { container, rerender } = render(
      <MoveDetailsPanel
        move={move}
        moveStats={{
          countBefore: 10,
          countAfter: 4,
          bucketLabel: "BYBYY",
          luckScore: 40,
          kind: "actual",
        }}
      />,
    );

    expect(container.querySelector(".detail-strip")?.textContent).toContain("Po 4");
    expect(container.querySelector(".detail-strip")?.textContent).toContain("Bucket BYBYY");
    expect(container.querySelector(".detail-strip")?.textContent).toContain("Luck 40");

    rerender(
      <MoveDetailsPanel
        move={move}
        moveStats={{
          countBefore: 10,
          countAfter: 1,
          bucketLabel: "BGGGG",
          luckScore: 100,
          kind: "actual",
        }}
      />,
    );

    expect(container.querySelector(".detail-strip")?.textContent).toContain("Po 1");
    expect(container.querySelector(".detail-strip")?.textContent).toContain("Bucket BGGGG");
    expect(container.querySelector(".detail-strip")?.textContent).toContain("Luck 100");
  });

  it("sorts remaining candidates by relevance from the select and can switch to alphabet", () => {
    render(
      <CandidatePanel
        candidates={["aaaaa", "abcde", "zzzzz"]}
        onPickWord={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "ABCDE",
      "AAAAA",
      "ZZZZZ",
    ]);

    fireEvent.change(screen.getByLabelText("Sortowanie kandydatów"), {
      target: { value: "alphabetical" },
    });

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "AAAAA",
      "ABCDE",
      "ZZZZZ",
    ]);
  });

  it("marks unlikely candidates as inflections", () => {
    render(
      <CandidatePanel
        candidates={["afera", "aferą"]}
        answerMetadata={{
          afera: { likelihood: "likely" },
          aferą: { likelihood: "unlikely", reason: "inflection", lemmas: ["afera"] },
        }}
        onPickWord={vi.fn()}
      />,
    );

    const candidate = screen.getByRole("button", { name: /AFERĄ odmiana/i });
    expect(candidate.getAttribute("title")).toBe("Odmiana: afera");
  });

  it("submits the active word row when Enter is pressed in the input", () => {
    const onSubmitDraft = vi.fn();

    render(
      <WordGrid
        guesses={[]}
        draft={{ word: "stare", pattern: stringToPattern("BYBYY") }}
        onDraftChange={vi.fn()}
        onSubmitDraft={onSubmitDraft}
        onUpdateGuess={vi.fn()}
        onRemoveGuess={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText("Słowo w wierszu 1"), { key: "Enter" });

    expect(onSubmitDraft).toHaveBeenCalledTimes(1);
  });

  it("focuses the next active word input after a guess is submitted", () => {
    const props = {
      draft: { word: "", pattern: stringToPattern("BBBBB") },
      onDraftChange: vi.fn(),
      onSubmitDraft: vi.fn(),
      onUpdateGuess: vi.fn(),
      onRemoveGuess: vi.fn(),
    };
    const { rerender } = render(<WordGrid guesses={[]} {...props} />);

    rerender(
      <WordGrid
        guesses={[{ word: "stare", pattern: stringToPattern("BYBYY") }]}
        {...props}
      />,
    );

    expect(document.activeElement).toBe(screen.getByLabelText("Słowo w wierszu 2"));
  });

  it("lets the best move in the summary be picked", () => {
    const onPickWord = vi.fn();
    const bestMove: MoveScore = {
      word: "trier",
      entropy: 4.073,
      averageBucket: 8,
      worstBucket: 13,
      hitProbability: 0,
      isCandidate: false,
      buckets: {},
      bucketSummaries: [],
    };

    render(
      <GameSummary
        guesses={[{ word: "stare", pattern: stringToPattern("BYBYY") }]}
        steps={[]}
        candidateCount={70}
        bestMove={bestMove}
        onPickWord={onPickWord}
        onSelectStep={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /najlepszy ruch/i }));

    expect(onPickWord).toHaveBeenCalledWith("trier");
  });

  it("keeps the best move disabled when there is no move", () => {
    render(
      <GameSummary
        guesses={[]}
        steps={[]}
        candidateCount={0}
        bestMove={undefined}
        onPickWord={vi.fn()}
        onSelectStep={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /najlepszy ruch/i })).toHaveProperty("disabled", true);
  });

  it("opens and closes the help dialog from the app shell", () => {
    render(
      <AppShell
        theme="light"
        onThemeToggle={vi.fn()}
        onLoadExample={vi.fn()}
        onClear={vi.fn()}
      >
        <div>content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Help" }));

    expect(screen.getByRole("dialog", { name: "Help" })).toBeTruthy();
    expect(screen.getByText("Entropia")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Zamknij pomoc" }));

    expect(screen.queryByRole("dialog", { name: "Help" })).toBeNull();
  });
});
