import { useRef, useState, type CSSProperties } from "react";
import { engine } from "../audio/engine";
import { percentText, speedText } from "../core/format";
import { isDefault, sliderToSpeed, speedToSlider } from "../core/settings";
import { PlayGlyph, SkipGlyph, Slider, useEngine, Wave } from "../ui";

/**
 * A song is open. Top to bottom, the way a thumb travels: what is playing,
 * where you are in it, the transport, how it should sound, and saving it.
 */
export function Player() {
  const { title, playing, speed, reverb, saving, error, note, count, index } = useEngine();
  const home = isDefault({ speed, reverb });
  const [saved, setSaved] = useState(false);
  const timer = useRef(0);

  const save = async () => {
    if (!(await engine.save())) return;
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <main className={`player ${playing ? "is-playing" : ""}`}>
      <h1 className="title">{title}</h1>

      {/* where you are in the song and the buttons that move you through it belong together */}
      <div className="deck">
        <Wave glow={reverb} index={index} count={count} />

        <div className="transport">
          <button className="skip" onClick={engine.previous} aria-label="previous song">
            <SkipGlyph back />
          </button>
          <button className={`play ${playing ? "is-playing" : ""}`} onClick={engine.toggle} aria-label={playing ? "pause" : "play"}>
            <PlayGlyph playing={playing} />
          </button>
          <button className="skip" onClick={engine.next} disabled={count < 2} aria-label="next song">
            <SkipGlyph />
          </button>
        </div>
      </div>

      {/* the only way to change the sound: two sliders, and a way back to where they started */}
      <div className="dials">
        <Slider
          name="speed"
          text={speedText(speed)}
          at={speedToSlider(speed)}
          middle
          flow
          onMove={(at) => engine.tune({ speed: sliderToSpeed(at) })}
          onStep={(steps) => engine.tune({ speed: Math.round(engine.snapshot().speed * 100 + steps) / 100 })}
        />
        <Slider
          name="reverb"
          text={percentText(reverb)}
          at={reverb}
          bloom
          onMove={(at) => engine.tune({ reverb: Math.round(at * 100) / 100 })}
          onStep={(steps) => engine.tune({ reverb: Math.round(engine.snapshot().reverb * 100 + steps) / 100 })}
        />
        {/* only there once something has moved; its room is kept so nothing jumps when it comes and goes */}
        <button className="link reset" onClick={engine.reset} disabled={home} aria-hidden={home} tabIndex={home ? -1 : 0}>
          reset
        </button>
      </div>

      {/* full of colour when there is nothing to wait for; while saving it empties and fills back up */}
      <button className="save" onClick={save} disabled={saving !== null} style={{ "--p": saving ?? 1 } as CSSProperties}>
        <span className="save__fill" />
        <span className="save__text">{saving !== null ? "saving" : saved ? "saved" : "save"}</span>
      </button>

      {error ? (
        <p className="toast" role="alert">
          {error}
        </p>
      ) : (
        note && (
          <p className="toast" role="status">
            {note}
          </p>
        )
      )}
    </main>
  );
}
