import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { engine } from "../audio/engine";
import { importProgress, youtubeUrl } from "../core/youtube";
import { importYoutube, type ImportProgress } from "./youtube";

export function LinkImport({ onDone }: { onDone?: () => void }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const box = useRef<HTMLInputElement>(null);
  // where the browser lets a page read what was copied, the button is `paste` until there is something to open
  const [canPaste] = useState(() => typeof navigator.clipboard?.readText === "function");

  // the furthest the bar has been for this import: it only ever goes forward
  const reached = useRef(0);

  const open = async (url: string) => {
    if (request.current) return;
    reached.current = 0;
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void open(url);
  };

  // one press: whatever link was copied goes in the box and starts opening, nothing to type and nothing to press after.
  // The phone may ask first, that is its own doing. Anything else that was copied is left alone
  const paste = async () => {
    engine.wake();
    setError(null);
    let copied: string;
    try {
      copied = (await navigator.clipboard.readText()).trim();
    } catch {
      // not allowed to look: the box is ready for a paste by hand instead
      box.current?.focus();
      return;
    }
    try {
      youtubeUrl(copied);
    } catch {
      setError("no youtube link copied");
      return;
    }
    setUrl(copied);
    void open(copied);
  };
  const pasting = canPaste && !url.trim();
  if (state) reached.current = Math.max(reached.current, importProgress(state.status, state.progress));

  return (
    // the browser's own checking is off (`noValidate`, nothing `required`, an empty `title`): it put "please fill out this
    // field" in a tooltip whenever a mouse rested on the empty box. A bad link gets our own words under the box instead
    <form className="link-import" onSubmit={submit} noValidate aria-label="import from youtube" aria-busy={!!state}>
      {/* while a link is being fetched the box it was typed in becomes the bar that shows it coming: the same pill,
          filling with colour, a light running along it so it is alive even when a step takes a while, and one word
          for what is happening. The word is there twice, like a slider's (see `Slider`) */}
      {state ? (
        <div className="link-import__going" role="progressbar" aria-label="importing" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(reached.current * 100)} aria-valuetext={state.status} style={{ "--p": reached.current } as CSSProperties}>
          <span className="link-import__word" aria-hidden>{state.status}</span>
          <span className="link-import__fill">
            <span className="link-import__sheen" />
            <span className="link-import__word" aria-hidden>{state.status}</span>
          </span>
        </div>
      ) : (
      <div className="link-import__entry">
        <input ref={box} type="url" title="" aria-label="youtube link" placeholder="youtube link" value={url} onChange={(event) => { setUrl(event.target.value); setError(null); }}
          disabled={!!state} maxLength={2048} autoComplete="off" autoCapitalize="none" spellCheck={false} />
        {pasting
          ? <button className="btn" type="button" onClick={paste} disabled={!!state}>paste</button>
          : <button className="btn" type="submit" disabled={!!state || !url.trim()}>open</button>}
      </div>
      )}
      {state && <div className="link-import__status">
        <p className="sr" role="status" aria-live="polite">{state.status}</p>
        <button className="link" type="button" onClick={() => request.current?.abort()}>cancel</button>
      </div>}
      {error && <p className="link-import__error" role="alert">{error}</p>}
    </form>
  );
}
