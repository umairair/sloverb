import { useRef, useState, type CSSProperties } from "react";
import { engine } from "../audio/engine";
import { percentText, speedText } from "../core/format";
import { describe, matchPreset, PRESET_NAMES, PRESETS, sliderToSpeed, speedToSlider } from "../core/settings";
import { PlayGlyph, Slider, useEngine, Wave } from "../ui";

/**
 * A song is open. Top to bottom, the way a thumb travels: what is playing,
 * where you are in it, the transport, how it should sound, and saving it.
 */
export function Player({ onOpen }: { onOpen: () => void }) {
  const { status, title, playing, speed, reverb, saving, error } = useEngine();
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
      <header className="now">
        <h1 className="title">{status === "opening" ? "opening" : title}</h1>
        {/* where the artist would be: what this version of the song is */}
        <p className="kind">{describe({ speed, reverb }) || "original"}</p>
      </header>

      <Wave glow={reverb} />

      <div className="transport">
        <button className="skip" onClick={() => engine.nudge(-10)} aria-label="back 10 seconds">
          −10
        </button>
        <button className="play" onClick={engine.toggle} aria-label={playing ? "pause" : "play"}>
          <PlayGlyph playing={playing} />
        </button>
        <button className="skip" onClick={() => engine.nudge(10)} aria-label="forward 10 seconds">
          +10
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
        {/* white when there is nothing to wait for; while saving it empties and fills back up */}
        <button className="save" onClick={save} disabled={saving !== null} style={{ "--p": saving ?? 1 } as CSSProperties}>
          <span className="save__fill" />
          <span className="save__text">{saving !== null ? "saving" : saved ? "saved" : "save"}</span>
        </button>
        <button className="link" onClick={onOpen}>
          change song
        </button>
      </div>

      {error && (
        <p className="toast" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
