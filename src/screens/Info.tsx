import { Back } from "../ui";

/** What this is, on its own page. Opens over whatever you were doing; back returns you to it. */
export function Info({ onBack }: { onBack: () => void }) {
  return (
    // the focus is put on the page itself when it opens, so a screen reader starts at the top of it
    <div className="info" role="dialog" aria-modal="true" aria-label="info" tabIndex={-1}>
      <article>
        {/* no heading: the name is in the sentence, drawn the way it is at the bottom of the player */}
        <p className="info__lead">
          I built <span className="wordmark">sloverb</span> to turn any song into a slowed + reverb or nightcore version. All audio processing happens in real time, entirely in the browser, and it's completely free and open source.
        </p>
        {/* dash and name are centred together as one line, the way every line on this page is */}
        <p className="info__sign">
          <span>- </span>Umair
        </p>
        {/* the two links either side of a thin rule, centred together as one thing, and `back` under them standing
            on the rule rather than on the middle of the screen: linkedin is the wider word, so the rule is a few
            pixels right of the middle, and the eye lines `back` up with the rule straight above it */}
        <div className="info__links">
          <a href="https://www.linkedin.com/in/umairmal/" target="_blank" rel="noreferrer">
            linkedin<span className="unseen">, opens in a new tab</span>
          </a>
          <span className="rule" aria-hidden />
          <a href="https://github.com/umairair/sloverb" target="_blank" rel="noreferrer">
            github<span className="unseen">, opens in a new tab</span>
          </a>
          <Back onClick={onBack} />
        </div>
      </article>
    </div>
  );
}
