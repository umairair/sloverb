import { Back } from "../ui";

/** What this is, on its own page. Opens over whatever you were doing; back returns you to it. */
export function Info({ onBack }: { onBack: () => void }) {
  return (
    <div className="info" role="dialog" aria-modal="true" aria-label="info">
      <article>
        {/* no heading: the name is in the sentence, drawn the way it is at the bottom of the player */}
        <p className="info__lead">
          I built <span className="wordmark">sloverb</span> to turn any song into a slowed + reverb or nightcore version. All audio processing happens in real time, entirely in the browser, and it's completely free and open source.
        </p>
        {/* dash and name are centred together as one line, the way every line on this page is */}
        <p className="info__sign">
          <span>- </span>Umair
        </p>
        {/* the two links are one line, centred together as one thing */}
        <p className="info__links">
          <a href="https://www.linkedin.com/in/umairmal/" target="_blank" rel="noreferrer">
            linkedin
          </a>
          <a href="https://github.com/umairair/sloverb" target="_blank" rel="noreferrer">
            github
          </a>
        </p>
        {/* in the middle with everything else, under what was just read, never off at an edge of the screen */}
        <Back onClick={onBack} />
      </article>
    </div>
  );
}
