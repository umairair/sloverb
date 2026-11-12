import { useEngine } from "../ui";
import { LinkImport } from "../imports/LinkImport";
import { youtubeEnabled } from "../imports/youtube";

/**
 * A name and a way in. With a mouse the way in is a place to drop songs,
 * which is also a button. On a phone there is nothing to drag, so it is only
 * the button. The same screen comes back from the player to add more songs,
 * with the song still playing, and then what comes in joins the list.
 */
export function Start({ onAdd, onDone, hidden }: { onAdd: () => void; onDone: () => void; hidden: boolean }) {
  const { status, error, duration } = useEngine();
  // only the very first song makes this screen wait; once one is open, another can always be added
  const opening = status === "opening" && duration === 0;
  const word = duration > 0 ? "add song" : "choose song";
  return (
    <main className="start" hidden={hidden}>
      <h1 className="wordmark">sloverb</h1>
      <button className="zone" onClick={onAdd} disabled={opening} aria-label={word}>
        {opening ? (
          <span className="zone__busy">opening</span>
        ) : (
          <>
            <span className="zone__drop">drop a song</span>
            <span className="btn">{word}</span>
          </>
        )}
      </button>
      {youtubeEnabled && <>
        <span className="start__or">or</span>
        <LinkImport onDone={onDone} />
      </>}
      {error && !hidden && (
        <p className="toast" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
