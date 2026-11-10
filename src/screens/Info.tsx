/** What this is, on its own page. Opens over whatever you were doing; back returns you to it. */
export function Info({ onBack }: { onBack: () => void }) {
  return (
    <div className="info" role="dialog" aria-modal="true" aria-label="info">
      <button className="info__back" onClick={onBack} autoFocus>
        back
      </button>
      <article>
        <h1>sloverb</h1>
        <p className="info__lead">I made this to turn any song into a slowed and reverb or nightcore version, right in the browser.</p>
        <p>Open a song, set the speed and the reverb, then save it as an MP3.</p>
        <p>Your music is safe as there is no backend server, the song never leaves your device.</p>
        <p className="info__sign">- Umair</p>
        <nav>
          <a href="https://www.linkedin.com/in/umairmal/" target="_blank" rel="noreferrer">
            linkedin
          </a>
        </nav>
      </article>
    </div>
  );
}
