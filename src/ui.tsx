import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { engine } from "./audio/engine";
import { clock } from "./core/format";
import { bars } from "./core/peaks";
import { looks } from "./look";

export function useEngine() {
  return useSyncExternalStore(engine.subscribe, engine.snapshot);
}

const between = (x: number) => Math.min(1, Math.max(0, x));

/** Which way an arrow key points along a slider. */
const ARROWS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

/** How far across an element a pointer is, 0 to 1. */
function across(event: PointerEvent<HTMLElement>): number {
  const box = event.currentTarget.getBoundingClientRect();
  return between((event.clientX - box.left) / box.width);
}

/**
 * Light behind everything, in the three colours, drifting slowly and
 * swelling gently with the music. Black when the song is paused or quiet. It also hands the loudness, as `--level`,
 * to the few things that move with it (anything with the class `hears`: this light, the play button's halo, the
 * speed slider's glow). Only to those: set on the whole page it made every element restyle sixty times a second.
 * How much of it anyone sees is theirs to choose on `settings` (`glow` in look.ts), down to none, which stills
 * everything that moves with the music.
 */
export function Aura() {
  useEffect(() => {
    // a live list, so whatever comes and goes with the screens is picked up without asking again
    const hearing = document.getElementsByClassName("hears") as HTMLCollectionOf<HTMLElement>;
    let frame = 0;
    let level = 0;
    let shown = -1;
    let told = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      // anything quieter than this counts as silence, so quiet passages and a paused song go fully dark.
      // Above it the loudness is bent so soft parts stay dim and loud ones still glow, for more contrast between them
      const over = Math.max(0, engine.level() - 0.1) / 0.9;
      const { playing } = engine.snapshot();
      // on settings with nothing playing there would be nothing to see the glow slider change, so there the light
      // breathes slowly on its own, as if a quiet song were on
      const heard = looks.showing && !playing ? 0.62 + 0.26 * Math.sin(performance.now() / 950) : Math.min(1, over ** 1.35 * 1.15);
      // eased both ways so it swells and fades with the song instead of flickering on every beat: about two thirds
      // of a second each way, quick enough to follow a quiet bar, slow enough never to flash
      // (and quicker still to go dark once the song is actually paused)
      level += (heard - level) * (heard > level ? 0.025 : playing ? 0.024 : 0.04);
      // the listener's own setting comes after the easing, so the glow slider is answered at once
      const rounded = Math.round(level * looks.snapshot().glow * 200) / 200;
      if (rounded === shown && hearing.length === told) return;
      shown = rounded;
      told = hearing.length;
      for (const element of hearing) element.style.setProperty("--level", String(rounded));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="aura hears" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  );
}

/**
 * A slider you can't miss: the whole pill is the handle. It fills with colour
 * from the left, and the colour at the edge depends on how far along it is,
 * so the far end of each slider looks different from the near end.
 *
 * Each one also shows what it does to the sound. `flow` sends a sheen along
 * the colour while the song plays, at the speed the song is playing, so a
 * slowed song drifts and a sped up one races. `bloom` softens the edge of the
 * colour and lets it glow past the pill the more there is, the way reverb
 * blurs the end of every note. Nothing changes when a finger takes hold of
 * one: Umair didn't want anything lighting up on a press.
 */
export function Slider(props: {
  name: string;
  /** what it is set to, for screen readers, and shown on the slider unless it is `quiet` */
  text: string;
  /** nothing written on it at all: no name, no number, only the colour */
  quiet?: boolean;
  className?: string;
  at: number;
  flow?: boolean;
  bloom?: boolean;
  onMove: (at: number) => void;
  onStep: (steps: number) => void;
}) {
  const { name, text, quiet, className = "", at, flow, bloom, onMove, onStep } = props;
  const slide = useRef<HTMLDivElement>(null);

  // the sheen: one pass every two seconds as recorded, four at half speed, one at double. The browser runs it on its
  // own (no script every frame), this only changes its rate when the speed does and stops it when the song does
  const sheen = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = sheen.current;
    if (!flow || !element?.animate) return;
    const pass = element.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(240%)" }], { duration: 2000, iterations: Infinity });
    const follow = () => {
      const { playing, speed } = engine.snapshot();
      if (pass.playbackRate !== speed) pass.updatePlaybackRate(speed);
      if (playing && pass.playState !== "running") pass.play();
      else if (!playing && pass.playState === "running") pass.pause();
    };
    follow();
    const stop = engine.subscribe(follow);
    return () => {
      stop();
      pass.cancel();
    };
  }, [flow]);

  const keys = (event: KeyboardEvent) => {
    const step = ARROWS[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    onStep(step * (event.shiftKey ? 10 : 1));
  };
  const words = !quiet && (
    <>
      <span className="slide__name">{name}</span>
      <span className="slide__text">{text}</span>
    </>
  );
  return (
    <div
      ref={slide}
      className={`slide ${className} ${bloom ? "slide--bloom" : ""}`}
      role="slider"
      tabIndex={0}
      aria-label={name}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(at * 100)}
      aria-valuetext={text}
      style={{ "--p": at } as CSSProperties}
      onPointerDown={(event) => {
        if (event.button) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onMove(across(event));
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onMove(across(event));
      }}
      onKeyDown={keys}
    >
      {/* the words are there twice, once on the bare slider and once inside the colour, which is cut off where the
          colour ends: each copy can then be a shade that reads on what is behind it, whatever the theme */}
      {words}
      <span className="slide__fill">
        {flow && <span ref={sheen} className="slide__sheen" />}
        {words}
      </span>
      <span className="slide__grip" />
    </div>
  );
}

const BAR = 3;
const GAP = 2;

/**
 * The song from start to end, in colour up to where you are, with one bright
 * bar at the front that jumps with the music. Click or drag to move through
 * it. The times underneath are listening time, so they stretch as the song
 * slows, and between them is which song of how many this is.
 */
export function Wave({ glow, index, count }: { glow: number; index: number; count: number }) {
  const wave = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef<HTMLSpanElement>(null);
  const total = useRef<HTMLSpanElement>(null);
  /** where the finger is while dragging, 0 to 1 */
  const drag = useRef<number | null>(null);

  useEffect(() => {
    const el = canvas.current!;
    const g = el.getContext("2d")!;
    let frame = 0;
    let drawn = "";
    let heights: Float32Array = new Float32Array(0);
    let from: Float32Array | null = null;

    const bar = (x: number, tall: number, height: number) => {
      const y = (height - tall) / 2;
      // square ends on the few browsers that can't draw round ones
      if (g.roundRect) g.roundRect(x, y, BAR, tall, BAR / 2);
      else g.rect(x, y, BAR, tall);
    };

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const { duration, speed, playing } = engine.snapshot();
      const width = el.clientWidth;
      const height = el.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      if (!width || !height || !duration) return;
      const at = drag.current ?? engine.position() / duration;

      const now = clock((at * duration) / speed);
      const all = clock(duration / speed);
      if (elapsed.current!.textContent !== now) {
        elapsed.current!.textContent = now;
        wave.current!.setAttribute("aria-valuenow", String(Math.round(at * 100)));
        wave.current!.setAttribute("aria-valuetext", `${now} of ${all}`);
      }
      if (total.current!.textContent !== all) total.current!.textContent = all;

      const count = Math.max(1, Math.floor((width + GAP) / (BAR + GAP)));
      const lit = Math.min(count - 1, Math.floor(at * count));
      const jump = playing ? Math.round(engine.level() * 8) : 0;
      const { theme } = looks.snapshot();
      const key = `${width} ${height} ${ratio} ${lit} ${jump} ${theme}`;
      if (key === drawn && from === engine.shape) return;
      drawn = key;
      if (from !== engine.shape || heights.length !== count) {
        from = engine.shape;
        heights = bars(from, count);
      }

      if (el.width !== Math.round(width * ratio) || el.height !== Math.round(height * ratio)) {
        el.width = Math.round(width * ratio);
        el.height = Math.round(height * ratio);
      }
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, width, height);
      const left = (width - (count * (BAR + GAP) - GAP)) / 2;
      const x = (i: number) => left + i * (BAR + GAP);
      const tall = (i: number) => Math.max(BAR, heights[i] * height * 0.86);

      // behind you, in the theme's colours
      const paint = looks.paint();
      const colour = g.createLinearGradient(left, 0, width - left, 0);
      paint.colours.forEach((stop, i) => colour.addColorStop(i / 2, stop));
      g.fillStyle = colour;
      g.beginPath();
      for (let i = 0; i < lit; i++) bar(x(i), tall(i), height);
      g.fill();

      // ahead of you, faint
      g.fillStyle = paint.ahead;
      g.beginPath();
      for (let i = lit + 1; i < count; i++) bar(x(i), tall(i), height);
      g.fill();

      // and where you are: one bright bar, taller when the music is louder
      g.fillStyle = paint.head;
      g.beginPath();
      bar(x(lit), Math.min(height, tall(lit) + jump), height);
      g.fill();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const keys = (event: KeyboardEvent) => {
    const way = ARROWS[event.key];
    if (!way) return;
    event.preventDefault();
    event.stopPropagation();
    engine.nudge(way * 10);
  };

  return (
    <div className="timeline">
      <div
        ref={wave}
        className={`wave ${glow > 0 ? "is-glowing" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label="position"
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ "--glow": glow } as CSSProperties}
        onPointerDown={(event) => {
          if (event.button) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = across(event);
        }}
        onPointerMove={(event) => {
          if (drag.current !== null) drag.current = across(event);
        }}
        onPointerUp={() => {
          if (drag.current === null) return;
          // not quite the very end, which would come straight back round to the start
          engine.seek(Math.min(drag.current, 0.999) * engine.snapshot().duration);
          drag.current = null;
        }}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={keys}
      >
        <canvas ref={canvas} />
      </div>
      <div className="times">
        <span ref={elapsed}>0:00</span>
        {count > 1 && (
          <span>
            {index + 1} / {count}
          </span>
        )}
        <span ref={total}>0:00</span>
      </div>
    </div>
  );
}

/**
 * The way out of info and of settings: an arrow and the word, in the middle
 * of the page under everything else on it. Everything in sloverb is in one
 * column down the centre, so the way back is too. The arrow is drawn, not a
 * character, so it is the same thin rounded line everywhere.
 */
export function Back({ onClick }: { onClick: () => void }) {
  return (
    <div className="back">
      <button onClick={onClick}>
        <svg viewBox="0 0 18 12" aria-hidden>
          <path d="M6.5 1 1.5 6l5 5M2 6h15" />
        </svg>
        back
      </button>
    </div>
  );
}

/** Play, or pause. */
export function PlayGlyph({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {playing ? (
        <>
          <rect x="5" y="4" width="5" height="16" rx="1.6" />
          <rect x="14" y="4" width="5" height="16" rx="1.6" />
        </>
      ) : (
        <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
      )}
    </svg>
  );
}

/** The song after, or mirrored, the song before. */
export function SkipGlyph({ back }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden style={back ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M4 6.2v11.6a1 1 0 0 0 1.53.85l9.3-5.8a1 1 0 0 0 0-1.7l-9.3-5.8A1 1 0 0 0 4 6.200z" />
      <rect x="17" y="5" width="3" height="14" rx="1.3" />
    </svg>
  );
}

/**
 * Play and pause, small, beside the playing song at the bottom of the start
 * screen opened from the player, so the music can be stopped from there
 * without going back. The player's own button in miniature: the same glyph,
 * inside a thin ring of the three colours that turns while the song plays.
 */
export function MiniPlay() {
  const { playing } = useEngine();
  return (
    <button className={`mini-play ${playing ? "is-playing" : ""}`} onClick={engine.toggle} aria-label={playing ? "pause" : "play"}>
      <span className="mini-play__ring" aria-hidden />
      <PlayGlyph playing={playing} />
    </button>
  );
}

/** The gap between the end of a sliding name and its start coming round again, and how fast it slides, in pixels a second. */
const SPACE = 44;
const PACE = 32;

/**
 * The song that is playing, on the start screen opened from the player:
 * three bars in the three colours that move with the music, and its name.
 * Press it to go back to the player.
 */
export function NowPlaying({ onClick }: { onClick: () => void }) {
  const { title, playing } = useEngine();
  // a name too long for its place slides through it, round and round, instead of being cut short. How far one
  // trip is, in pixels: the name and the space before it comes round again. 0 when the name fits
  const box = useRef<HTMLSpanElement>(null);
  const [trip, setTrip] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const name = element.querySelector<HTMLElement>(".now-playing__run > span");
      if (name) setTrip(name.offsetWidth > element.clientWidth + 1 ? name.offsetWidth + SPACE : 0);
    };
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    measure();
    return () => watch.disconnect();
  }, [title]);
  return (
    <button className={`now-playing ${playing ? "is-playing" : ""}`} onClick={onClick} aria-label={`back to ${title}`}>
      <span className="now-playing__bars" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span ref={box} className={`now-playing__title ${trip ? "is-sliding" : ""}`}>
        {/* the name twice while it slides, so the second is arriving as the first leaves. The browser moves it, at
            the same pace whatever the length, and only while the song plays */}
        <span className="now-playing__run" style={trip ? ({ "--trip": `${trip}px`, "--time": `${trip / PACE}s` } as CSSProperties) : undefined}>
          <span>{title}</span>
          {trip > 0 && <span aria-hidden>{title}</span>}
        </span>
      </span>
    </button>
  );
}
