import type { DictionaryStatus as DictionaryStatusModel } from "../types/wordle";

interface DictionaryStatusProps {
  status: DictionaryStatusModel;
  onReload: () => void;
}

export function DictionaryStatus({ status, onReload }: DictionaryStatusProps) {
  return (
    <section className="panel dictionary-panel">
      <div className="dictionary-status">
        <span className={`status-dot ${status.state}`} />
        <div>
          <h2>{status.title}</h2>
          <p>{status.detail}</p>
          {status.source ? <small>{status.cached ? "cache" : status.offline ? "offline" : "źródło"}: {status.source}</small> : null}
        </div>
      </div>
      <button type="button" className="dictionary-reload-button" onClick={onReload}>
        Wczytaj
      </button>
    </section>
  );
}
