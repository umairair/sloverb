import { useRef, useState, type CSSProperties } from "react";
import { engine } from "../audio/engine";
import { percentText, speedText } from "../core/format";
import { describe, matchPreset, PRESET_NAMES, PRESETS, sliderToSpeed, speedToSlider } from "../core/settings";
import { PlayGlyph, SkipGlyph, Slider, useEngine, Wave } from "../ui";
import { youtubeEnabled } from "../imports/youtube";

/**
 * A song is open. Top to bottom, the way a thumb travels: what is playing,
 * where you are in it, the transport, how it should sound, and saving it.
 */
export function Player({ onAdd, onLink }: { onAdd: () => void; onLink: () => void }) {
  const { status, title, playing, speed, reverb, saving, error, count, index } = useEngine();
  const preset = matchPreset({ speed, reverb });
  const [saved, setSaved] = useState(false);
  const timer = useRef(0);

  const save = async () => {
    if (!(await engine.save())) return;
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <main className="player">
      {/* the name on the door, and the way back out to the start */}
      <button className="wordmark home" onClick={engine.clear} aria-label="sloverb, back to the start">
        sloverb
      </button>
      <header className="now">
        <h1 className="title">{title}</h1>
        {/* where the artist would be: what this version of the song is */}
        <p className="kind">{status === "opening" ? "opening" : describe({ speed, reverb }) || "original"}</p>
      </header>

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

      <div className="dials">
        <div className="seg" role="group" aria-label="presets">
          {PRESET_NAMES.map((name) => (
            <button key={name} aria-pressed={preset === name} onClick={() => engine.tune(PRESETS[name])}>
              {name}
            </button>
          ))}
        </div>
        <Slider
          name="speed"
          text={speedText(speed)}
          at={speedToSlider(speed)}
          middle
          onMove={(at) => engine.tune({ speed: sliderToSpeed(at) })}
          onStep={(steps) => engine.tune({ speed: Math.round(engine.snapshot().speed * 100 + steps) / 100 })}
        />
        <Slider
          name="reverb"
          text={percentText(reverb)}
          at={reverb}
          onMove={(at) => engine.tune({ reverb: Math.round(at * 100) / 100 })}
          onStep={(steps) => engine.tune({ reverb: Math.round(engine.snapshot().reverb * 100 + steps) / 100 })}
        />
      </div>

      <div className="out">
        {/* full of colour when there is nothing to wait for; while saving it empties and fills back up */}
        <button className="save" onClick={save} disabled={saving !== null} style={{ "--p": saving ?? 1 } as CSSProperties}>
          <span className="save__fill" />
          <span className="save__text">{saving !== null ? "saving" : saved ? "saved" : "save"}</span>
        </button>
        <div className="out__sources">
          <button className="link" onClick={onAdd}>add song</button>
          {youtubeEnabled && <button className="link" onClick={onLink}>youtube link</button>}
        </div>
      </div>

      {error && (
        <p className="toast" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
