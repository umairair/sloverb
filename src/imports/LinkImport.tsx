import { useEffect, useRef, useState, type FormEvent } from "react";
import { engine } from "../audio/engine";
import { importYoutube, type ImportProgress } from "./youtube";

export function LinkImport({ onDone }: { onDone?: () => void }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (request.current) return;
    engine.wake();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    try {
      const song = await importYoutube(url, controller.signal, setState);
      controller.signal.throwIfAborted();
      setState({ status: "opening", progress: null });
      await engine.add([song]);
      if (!controller.signal.aborted) { setUrl(""); onDone?.(); }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "couldn't import that video");
    } finally {
      if (request.current === controller) { request.current = null; setState(null); }
    }
  };

  return (
    <form className="link-import" onSubmit={submit} aria-label="import from youtube" aria-busy={!!state}>
      <div className="link-import__entry">
        <input type="url" aria-label="youtube link" placeholder="youtube link" value={url} onChange={(event) => { setUrl(event.target.value); setError(null); }}
          disabled={!!state} required maxLength={2048} autoComplete="off" autoCapitalize="none" spellCheck={false} />
        <button className="btn" type="submit" disabled={!!state || !url.trim()}>open</button>
      </div>
      {state && <div className="link-import__status">
        <p role="status" aria-live="polite">{state.status}{state.progress !== null ? ` ${Math.floor(state.progress * 100)}%` : ""}</p>
        <button className="link" type="button" onClick={() => request.current?.abort()}>cancel</button>
      </div>}
      {error && <p className="link-import__error" role="alert">{error}</p>}
    </form>
  );
}
