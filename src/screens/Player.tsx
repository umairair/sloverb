import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { engine } from "../audio/engine";
import { percentText, speedText } from "../core/format";
import { isDefault, sliderToSpeed, speedToSlider } from "../core/settings";
import { announce, Marquee, PlayGlyph, SkipGlyph, Slider, useEngine, Wave } from "../ui";

/**
 * A song is open. Top to bottom, the way a thumb travels: what is playing,
 * where you are in it, the transport, how it should sound, and saving it.
 */
export function Player() {
  const { title, playing, speed, reverb, saving, error, note, count, index } = useEngine();
  const home = isDefault({ speed, reverb });
  const [saved, setSaved] = useState(false);
  const timer = useRef(0);

  const word = saving !== null ? "saving" : saved ? "saved" : "save";

  // `cancel` is only there while saving. When it goes, whoever was on it from the keyboard is handed to save. Before
  // the page is drawn, while the browser still says the focus is on it
  const busy = saving !== null;
  const cancel = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!busy && document.activeElement === cancel.current) document.querySelector<HTMLElement>(".save")?.focus();
  }, [busy]);

  const save = async () => {
    // still a button that can be reached while it works, so the keyboard's focus isn't thrown off it (see below)
    if (saving !== null) return;
    announce("saving");
    if (!(await engine.save())) return;
    announce("saved");
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <main className={`player ${playing ? "is-playing" : ""}`}>
      {/* a name too long for the screen slides through it while the song plays */}
      {/* where the focus lands when a song opens, so a screen reader starts at its name */}
      <h1 className="title" tabIndex={-1}>
        <Marquee text={title} moving={playing} />
      </h1>

      {/* where you are in the song and the buttons that move you through it belong together */}
      <div className="deck">
        <Wave index={index} count={count} />

        <div className="transport">
          <button className="skip" onClick={engine.previous} aria-label="previous song">
            <SkipGlyph back />
          </button>
          <button className="play" onClick={engine.toggle} aria-label={playing ? "pause" : "play"}>
            <PlayGlyph playing={playing} />
          </button>
          <button className="skip" onClick={engine.next} disabled={count < 2} aria-label="next song">
            <SkipGlyph />
          </button>
        </div>
      </div>

      {/* the only way to change the sound: two sliders, and a way back to where they started.
          Speed says nothing about itself and wears its own colours: you find out what it does by moving it */}
      <div className="dials">
        <Slider
          name="speed"
          text={speedText(speed)}
          at={speedToSlider(speed)}
          quiet
          className="slide--speed"
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
        <button
          className="link reset"
          onClick={(event) => {
            // it goes away once pressed, so the keyboard's focus moves to the sliders it put back
            if (document.activeElement === event.currentTarget) document.querySelector<HTMLElement>(".slide--speed")?.focus();
            engine.reset();
          }}
          disabled={home || busy}
          aria-hidden={home || busy}
          tabIndex={home || busy ? -1 : 0}
        >
          reset
        </button>
        {/* while a save is being made, reset gives its place to the way to stop it. Under save, where the link box has
            its cancel, there is too little room on a short screen before the words at the bottom */}
        <button
          ref={cancel}
          className="link reset"
          onClick={(event) => {
            if (document.activeElement === event.currentTarget) document.querySelector<HTMLElement>(".save")?.focus();
            engine.cancelSave();
            announce("cancelled");
          }}
          disabled={!busy}
          aria-hidden={!busy}
          tabIndex={busy ? 0 : -1}
        >
          cancel
        </button>
      </div>

      {/* filled when there is nothing to wait for; while saving it empties and fills back up */}
      {/* not `disabled` while saving: a disabled button drops the keyboard's focus, so it says it is busy instead */}
      <button className="save" onClick={save} aria-disabled={busy} style={{ "--p": saving ?? 1 } as CSSProperties}>
        {/* the word twice, like the sliders' (see `Slider`): on the bare button, and inside the fill as it comes back */}
        <span className="save__text" aria-hidden>
          {word}
        </span>
        <span className="save__fill">
          <span className="save__text">{word}</span>
        </span>
      </button>

      {/* with no light behind the page the colours are too strong for the dark, so the player steps back with it */}
      <div className="rest hears" aria-hidden />

      {error ? (
        <p className="toast" role="alert">
          {error}
        </p>
      ) : (
        note && (
          // read out by the page's one live region (`Announcer`), so it isn't said twice
          <p className="toast" aria-hidden>
            {note}
          </p>
        )
      )}
    </main>
  );
}
