import { useState } from "react";
import type { DictionaryStatus as DictionaryStatusModel } from "../types/wordle";

interface DictionaryStatusProps {
  status: DictionaryStatusModel;
  url: string;
  onUrlChange: (url: string) => void;
  onReload: () => void;
}

export function DictionaryStatus({ status, url, onUrlChange, onReload }: DictionaryStatusProps) {
  const [draftUrl, setDraftUrl] = useState(url);

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
      <form
        className="dictionary-form"
        onSubmit={(event) => {
          event.preventDefault();
          onUrlChange(draftUrl);
          onReload();
        }}
      >
        <input
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          placeholder="Opcjonalny URL słownika"
          aria-label="URL słownika"
        />
        <button type="submit">Wczytaj</button>
      </form>
    </section>
  );
}
