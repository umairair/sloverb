import { useEffect } from "react";
import { GLOWS, glowText, THEMES } from "../core/look";
import { looks, useLook } from "../look";
import { Back, Slider } from "../ui";

/**
 * How it looks, on its own page: which glow lights sloverb, how much it moves
 * with the music, down to not at all, and whether the page is dark or light.
 * Nothing here changes the sound. It has no background of its own, so the
 * light behind the page shows through and answers every choice as it is made.
 */
export function Settings({ onBack }: { onBack: () => void }) {
  const { amount, glow, theme } = useLook();
  useEffect(() => {
    looks.showing = true;
    return () => void (looks.showing = false);
  }, []);
  return (
    <div className="settings" role="dialog" aria-modal="true" aria-label="settings">
      <article>
        {/* the slider and the glows it turns up and down are one group */}
        <div className="glows">
          <Slider
            name="glow effect"
            text={glowText(amount)}
            at={amount}
            bloom
            onMove={(at) => looks.set({ amount: Math.round(at * 100) / 100 })}
            onStep={(steps) => looks.set({ amount: Math.round(looks.snapshot().amount * 100 + steps) / 100 })}
          />
          {/* each one is a small still of itself, in its own colours on the page as it is, so what you see is what you get */}
          <div className="picks" role="radiogroup" aria-label="glow effect">
            {GLOWS.map((name) => (
              <button key={name} className="pick" role="radio" aria-label={name} aria-checked={name === glow} onClick={() => looks.set({ glow: name })}>
                <span className="pick__look pick__look--glow" data-theme={theme} data-glow={name} aria-hidden />
                <span className="pick__name">{name}</span>
              </button>
            ))}
          </div>
        </div>
        {/* the page itself, each in the glow that is on */}
        <div className="picks picks--themes" role="radiogroup" aria-label="theme">
          {THEMES.map((name) => (
            <button key={name} className="pick" role="radio" aria-label={name} aria-checked={name === theme} onClick={() => looks.set({ theme: name })}>
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
