import { useEngine } from "../ui";

/**
 * Nothing open yet: a name and a way in. With a mouse the way in is a place
 * to drop a song, which is also a button. On a phone there is nothing to drag,
 * so it is only the button.
 */
export function Start({ onOpen, onDemo }: { onOpen: () => void; onDemo: () => void }) {
  const { status, error } = useEngine();
  const opening = status === "opening";
  return (
    <main className="start">
      <h1 className="wordmark">sloverb</h1>
      <button className="zone" onClick={onOpen} disabled={opening} aria-label="choose song">
        {opening ? (
          <span className="zone__busy">opening</span>
        ) : (
          <>
            <span className="zone__drop">drop a song</span>
            <span className="btn">choose song</span>
          </>
        )}
      </button>
      <button className="link" onClick={onDemo} disabled={opening}>
        demo
      </button>
      {error && (
        <p className="toast" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
