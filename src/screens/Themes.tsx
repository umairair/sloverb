import { useEffect } from "react";
import { GLOWS, glowText, THEMES } from "../core/look";
import { looks, useLook } from "../look";
import { Back, radioKeys, Slider } from "../ui";

/**
 * How it looks, on its own page: which glow lights sloverb, how much it moves
 * with the music, down to not at all, and whether the page is dark or light.
 * Nothing here changes the sound. It has no background of its own, so the
 * light behind the page shows through and answers every choice as it is made.
 */
export function Themes({ onBack }: { onBack: () => void }) {
  const { amount, glow, theme } = useLook();
  useEffect(() => {
    looks.showing = true;
    return () => void (looks.showing = false);
  }, []);
  return (
    <div className="themes" role="dialog" aria-modal="true" aria-label="themes" tabIndex={-1}>
      <article>
        {/* the slider and the glows it turns up and down are one group */}
        <div className="glows">
          <Slider
            name="glow effect"
            text={glowText(amount)}
            at={amount}
            className="slide--flat"
            onMove={(at) => looks.set({ amount: Math.round(at * 100) / 100 })}
            onStep={(steps) => looks.set({ amount: Math.round(looks.snapshot().amount * 100 + steps) / 100 })}
          />
          {/* each one is a small still of itself, in its own colours on the page as it is, and nothing written under it:
              its name is only for a screen reader (Umair had the names taken off on 2026-11-27, D36) */}
          {/* one stop for Tab, on the one being worn, and the arrows choose among them (radioKeys) */}
          <div className="picks" role="radiogroup" aria-label="glow" onKeyDown={radioKeys}>
            {GLOWS.map((name) => (
              <button key={name} className="pick" role="radio" aria-label={name} aria-checked={name === glow} tabIndex={name === glow ? 0 : -1} onClick={() => looks.set({ glow: name })}>
                <span className="pick__look pick__look--glow" data-theme={theme} data-glow={name} aria-hidden />
              </button>
            ))}
          </div>
        </div>
        {/* the page itself, each in the glow that is on, with its name under it */}
        <div className="picks picks--themes" role="radiogroup" aria-label="theme" onKeyDown={radioKeys}>
          {THEMES.map((name) => (
            <button key={name} className="pick" role="radio" aria-checked={name === theme} tabIndex={name === theme ? 0 : -1} onClick={() => looks.set({ theme: name })}>
              <span className="pick__look" data-theme={name} data-glow={glow} aria-hidden>
                <i />
              </span>
              <span className="pick__name">{name}</span>
            </button>
          ))}
        </div>
        <Back onClick={onBack} />
      </article>
    </div>
  );
}
