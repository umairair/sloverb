/** What this is, on its own page. Opens over whatever you were doing; back returns you to it. */
export function Info({ onBack }: { onBack: () => void }) {
  return (
    <div className="info" role="dialog" aria-modal="true" aria-label="info">
      <article>
        <h1>sloverb</h1>
        <p className="info__lead">I built this to turn any song into a slowed + reverb or nightcore version, with real-time audio manipulation happening locally in your browser.</p>
        <p className="info__sign">- Umair</p>
        <nav>
          <a href="https://www.linkedin.com/in/umairmal/" target="_blank" rel="noreferrer">
            linkedin
          </a>
        </nav>
      </article>
      {/* where the word info was, so the way out is under the same thumb as the way in */}
      <button className="link foot" onClick={onBack}>
        back
      </button>
    </div>
  );
}
