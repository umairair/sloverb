import { useEffect } from "react";
import { glowText, THEMES } from "../core/look";
import { looks, useLook } from "../look";
import { Back, Slider } from "../ui";

/**
 * How it looks, on its own page: how much the light moves with the music,
 * down to not at all, and which colours sloverb wears. Nothing here changes
 * the sound. It has no background of its own, so the light behind the page
 * shows through and answers the slider as it moves.
 */
export function Settings({ onBack }: { onBack: () => void }) {
  const { glow, theme } = useLook();
  useEffect(() => {
    looks.showing = true;
    return () => void (looks.showing = false);
  }, []);
  return (
    <div className="settings" role="dialog" aria-modal="true" aria-label="settings">
      <article>
        <Slider
          name="glow"
          text={glowText(glow)}
          at={glow}
          bloom
          onMove={(at) => looks.set({ glow: Math.round(at * 100) / 100 })}
          onStep={(steps) => looks.set({ glow: Math.round(looks.snapshot().glow * 100 + steps) / 100 })}
        />
        {/* each one is painted in its own colours, so what you see is what you get */}
        <div className="themes" role="radiogroup" aria-label="theme">
          {THEMES.map((name) => (
            <button key={name} className="theme" role="radio" aria-label={name} aria-checked={name === theme} onClick={() => looks.set({ theme: name })}>
              <span className="theme__look" data-theme={name} aria-hidden>
                <i />
              </span>
              <span className="theme__name">{name}</span>
            </button>
          ))}
        </div>
        <Back onClick={onBack} />
      </article>
    </div>
  );
}
