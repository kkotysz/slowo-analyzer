import type { ReactNode } from "react";
import { useState } from "react";
import { HelpDialog } from "../components/HelpDialog";
import { ThemeToggle } from "../components/ThemeToggle";

interface AppShellProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
  onLoadExample: () => void;
  onClear: () => void;
  children: ReactNode;
}

export function AppShell({ theme, onThemeToggle, onLoadExample, onClear, children }: AppShellProps) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Słowo Analyzer</h1>
          <p>Polski WordleBot-lite do analizy kandydatów, bucketów i następnych ruchów.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={() => setHelpOpen(true)}>Help</button>
          <button type="button" className="secondary-button" onClick={onLoadExample}>Przykład</button>
          <button type="button" className="secondary-button danger-text" onClick={onClear}>Wyczyść</button>
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        </div>
      </header>
      {children}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}
