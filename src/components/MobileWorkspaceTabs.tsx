import { useRef, type KeyboardEvent } from "react";
import type { MobileWorkspaceView, WorkerStatus } from "../types/wordle";

interface MobileWorkspaceTabsProps {
  activeView: MobileWorkspaceView;
  candidateCount: number;
  guessCount: number;
  solverStatus: WorkerStatus;
  solverProgress: number;
  onViewChange: (view: MobileWorkspaceView) => void;
}

const TABS: Array<{ view: MobileWorkspaceView; label: string }> = [
  { view: "game", label: "Gra" },
  { view: "analysis", label: "Analiza" },
  { view: "solver", label: "Solver" },
];

export function MobileWorkspaceTabs({
  activeView,
  candidateCount,
  guessCount,
  solverStatus,
  solverProgress,
  onViewChange,
}: MobileWorkspaceTabsProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectView(view: MobileWorkspaceView, focus = false): void {
    onViewChange(view);
    if (focus) {
      const index = TABS.findIndex((tab) => tab.view === view);
      buttonRefs.current[index]?.focus();
    }
    const schedule = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
    schedule(() => {
      document.getElementById("mobile-workspace-panel")?.scrollIntoView?.({ block: "start" });
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectView(TABS[nextIndex].view, true);
  }

  function tabMeta(view: MobileWorkspaceView): string | undefined {
    if (view === "game" && guessCount > 0) return `${guessCount}/6`;
    if (view === "analysis") return candidateCount.toLocaleString("pl-PL");
    if (view === "solver" && solverStatus === "running") return `${Math.round(solverProgress * 100)}%`;
    if (view === "solver" && solverStatus === "done") return "gotowy";
    return undefined;
  }

  return (
    <nav className="mobile-workspace-tabs" aria-label="Widok aplikacji">
      <div role="tablist" aria-label="Główne sekcje">
        {TABS.map((tab, index) => {
          const active = tab.view === activeView;
          const meta = tabMeta(tab.view);
          return (
            <button
              type="button"
              role="tab"
              id={`mobile-tab-${tab.view}`}
              aria-controls="mobile-workspace-panel"
              aria-selected={active}
              className={active ? "mobile-workspace-tab active" : "mobile-workspace-tab"}
              key={tab.view}
              ref={(element) => {
                buttonRefs.current[index] = element;
              }}
              tabIndex={active ? 0 : -1}
              onClick={() => selectView(tab.view)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span>{tab.label}</span>
              {meta ? <small>{meta}</small> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
