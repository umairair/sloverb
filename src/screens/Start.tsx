import { useEngine } from "../ui";
import { LinkImport } from "../imports/LinkImport";
import { youtubeEnabled } from "../imports/youtube";

/**
 * Nothing open yet: a name and a way in. With a mouse the way in is a place
 * to drop songs, which is also a button. On a phone there is nothing to drag,
 * so it is only the button.
 */
export function Start({ onAdd }: { onAdd: () => void }) {
  const { status, error } = useEngine();
  const opening = status === "opening";
  return (
    <main className="start">
      <h1 className="wordmark">sloverb</h1>
      <button className="zone" onClick={onAdd} disabled={opening} aria-label="choose song">
        {opening ? (
          <span className="zone__busy">opening</span>
        ) : (
          <>
            <span className="zone__drop">drop a song</span>
            <span className="btn">choose song</span>
          </>
        )}
      </button>
      {youtubeEnabled && <>
        <span className="start__or">or</span>
        <LinkImport />
      </>}
      {error && (
        <p className="toast" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
