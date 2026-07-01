interface ThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button className="theme-toggle" type="button" onClick={onToggle} aria-label="Przełącz motyw" title="Przełącz motyw">
      <span className="desktop-control-label">{theme === "dark" ? "Jasny" : "Ciemny"}</span>
      <span className="mobile-control-label" aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
