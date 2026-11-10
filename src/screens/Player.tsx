import { engine } from "../audio/engine";
import { percentText, speedText } from "../core/format";
import { matchPreset, PRESET_NAMES, PRESETS, sliderToSpeed, speedToSlider } from "../core/settings";
import { Slider, useEngine, Wave } from "../ui";

/** A song is open: where you are in it, how it should sound, and the two things to do with it. */
export function Player({ onOpen, onAbout }: { onOpen: () => void; onAbout: () => void }) {
  const { status, title, playing, speed, reverb, saving, error } = useEngine();
  const preset = matchPreset({ speed, reverb });

  return (
    <main className="player">
      <h1 className="title">{status === "opening" ? "opening" : title}</h1>
      <Wave glow={reverb} />

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

      <div className="row">
        <button className="btn" onClick={engine.toggle}>
          {playing ? "pause" : "play"}
        </button>
        <button className="btn btn--line" onClick={engine.save} disabled={saving !== null}>
          {saving === null ? "save" : `saving ${Math.round(saving * 100)}%`}
        </button>
      </div>

      {error && (
        <p className="toast" role="alert">
          {error}
        </p>
      )}

      <nav className="bar">
        <button onClick={onOpen}>open</button>
        <button onClick={onAbout}>about</button>
      </nav>
    </main>
  );
}
