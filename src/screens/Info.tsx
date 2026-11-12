import { Back } from "../ui";

/** What this is, on its own page. Opens over whatever you were doing; back returns you to it. */
export function Info({ onBack }: { onBack: () => void }) {
  return (
    <div className="info" role="dialog" aria-modal="true" aria-label="info">
      <article>
        <h1>sloverb</h1>
        <p className="info__lead">I built this to turn any song into a slowed + reverb or nightcore version, with real-time audio manipulation happening locally in your browser.</p>
        {/* the dash hangs to the left of the name, so the name itself is on the centre line with everything else */}
        <p className="info__sign">
          <span>- </span>Umair
        </p>
        <a href="https://www.linkedin.com/in/umairmal/" target="_blank" rel="noreferrer">
          linkedin
        </a>
        {/* in the middle with everything else, under what was just read, never off at an edge of the screen */}
        <Back onClick={onBack} />
      </article>
    </div>
  );
}
