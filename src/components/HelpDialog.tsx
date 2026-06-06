import { useEffect } from "react";
import { HELP_SECTIONS } from "../content/helpContent";

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="help-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="help-header">
          <div>
            <h2 id="help-title">Help</h2>
            <p>Krótki przewodnik po Słowo Analyzer i metrykach rankingu.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Zamknij pomoc">
            ×
          </button>
        </div>
        <div className="help-content">
          {HELP_SECTIONS.map((section) => (
            <article className={`help-section tone-${section.tone}`} key={section.title}>
              <div className="help-section-head">
                <span className="help-tag">{section.tag}</span>
                <span className="help-accent" />
              </div>
              <h3>{section.title}</h3>
              <p className="help-takeaway">{section.takeaway}</p>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
