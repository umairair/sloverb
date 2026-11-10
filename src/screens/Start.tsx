import { useEngine } from "../ui";

/** Nothing open yet: a name and a way in. Dropping a file anywhere works too. */
export function Start({ onOpen, onDemo, onAbout }: { onOpen: () => void; onDemo: () => void; onAbout: () => void }) {
  const { status, error } = useEngine();
  return (
    <main className="page">
      <h1 className="wordmark">sloverb</h1>
      {status === "opening" ? (
        <p className="note">opening</p>
      ) : (
        <>
          <button className="btn" onClick={onOpen} autoFocus>
            open song
          </button>
          <nav className="links">
            <button className="link" onClick={onDemo}>
              demo
            </button>
            <button className="link" onClick={onAbout}>
              about
            </button>
          </nav>
        </>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
