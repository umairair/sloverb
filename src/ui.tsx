import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { engine } from "./audio/engine";
import { clock } from "./core/format";
import { bars } from "./core/peaks";

export function useEngine() {
  return useSyncExternalStore(engine.subscribe, engine.snapshot);
}

/** The colours, left to right: the blue, purple and pink of the first sloverb. The same three are in `styles.css`. */
const BLUE = "#4f8cff";
const PURPLE = "#a855f7";
const PINK = "#ff4d8d";

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
 * swelling gently with the music. Black when the song is paused or quiet. It also hands the loudness to the rest of the page
 * as `--level`, which is what makes the play button's halo breathe.
 */
export function Aura() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let level = 0;
    let shown = -1;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      // anything quieter than this counts as silence, so quiet passages and a paused song go fully dark
      const heard = Math.max(0, engine.level() - 0.06);
      // eased both ways, slowly, so it swells and fades with the song instead of flickering on every beat
      // (and a little quicker to go dark once the song is actually paused)
      level += (heard - level) * (heard > level ? 0.02 : engine.snapshot().playing ? 0.012 : 0.04);
      const rounded = Math.round(level * 200) / 200;
      if (rounded === shown) return;
      shown = rounded;
      root.style.setProperty("--level", String(rounded));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="aura" aria-hidden>
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
 * blurs the end of every note. Holding either one lifts the light behind the
 * page a little, so shaping the song feels like it reaches the whole room.
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
  const [held, setHeld] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("shaping", held);
  }, [held]);
  useEffect(() => () => document.documentElement.classList.remove("shaping"), []);

  // the sheen: where it is, 0 to 1 across the pill, moving at the speed of the song
  useEffect(() => {
    if (!flow) return;
    let frame = 0;
    let phase = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const { playing, speed } = engine.snapshot();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!playing) return;
      // one pass every two seconds as recorded, four when half speed, one when double
      phase = (phase + dt * 0.5 * speed) % 1;
      slide.current?.style.setProperty("--phase", phase.toFixed(4));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [flow]);

  const keys = (event: KeyboardEvent) => {
    const step = ARROWS[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    onStep(step * (event.shiftKey ? 10 : 1));
  };
  return (
    <div
      ref={slide}
      className={`slide ${className} ${held ? "is-held" : ""} ${bloom ? "slide--bloom" : ""}`}
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
        setHeld(true);
        onMove(across(event));
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onMove(across(event));
      }}
      onPointerUp={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onLostPointerCapture={() => setHeld(false)}
      onKeyDown={keys}
    >
      <span className="slide__fill">{flow && <span className="slide__sheen" />}</span>
      <span className="slide__grip" />
      {!quiet && (
        <>
          <span className="slide__name">{name}</span>
          <span className="slide__text">{text}</span>
        </>
      )}
    </div>
  );
}

const BAR = 3;
const GAP = 2;
const AHEAD = "rgb(255 255 255 / 0.2)";

/**
 * The song from start to end, in colour up to where you are, with one white
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
      const key = `${width} ${height} ${ratio} ${lit} ${jump}`;
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

      // behind you, in colour
      const colour = g.createLinearGradient(left, 0, width - left, 0);
      colour.addColorStop(0, BLUE);
      colour.addColorStop(0.5, PURPLE);
      colour.addColorStop(1, PINK);
      g.fillStyle = colour;
      g.beginPath();
      for (let i = 0; i < lit; i++) bar(x(i), tall(i), height);
      g.fill();

      // ahead of you, faint
      g.fillStyle = AHEAD;
      g.beginPath();
      for (let i = lit + 1; i < count; i++) bar(x(i), tall(i), height);
      g.fill();

      // and where you are: one white bar, taller when the music is louder
      g.fillStyle = "#fff";
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
        className="wave"
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
 * The song that is playing, on the start screen opened from the player:
 * three bars in the three colours that move with the music, and its name.
 * Press it to go back to the player.
 */
export function NowPlaying({ onClick }: { onClick: () => void }) {
  const { title, playing } = useEngine();
  return (
    <button className={`now-playing ${playing ? "is-playing" : ""}`} onClick={onClick} aria-label={`back to ${title}`}>
      <span className="now-playing__bars" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className="now-playing__title">{title}</span>
    </button>
  );
}
