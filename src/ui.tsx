import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { engine } from "./audio/engine";
import { clock } from "./core/format";
import { bars } from "./core/peaks";

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
 * A slider you can't miss: the whole pill is the handle, and it fills from
 * the left. Its name and value sit on top and turn dark where the fill
 * passes under them.
 */
export function Slider(props: { name: string; text: string; at: number; onMove: (at: number) => void; onStep: (steps: number) => void }) {
  const { name, text, at, onMove, onStep } = props;
  const keys = (event: KeyboardEvent) => {
    const step = ARROWS[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    onStep(step * (event.shiftKey ? 10 : 1));
  };
  return (
    <div
      className="slide"
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
      <span className="slide__fill" />
      <span className="slide__name">{name}</span>
      <span className="slide__text">{text}</span>
    </div>
  );
}

const BAR = 3;
const GAP = 2;
const PLAYED = "#f5f5f7";
const AHEAD = "rgb(255 255 255 / 0.2)";

/**
 * The song from start to end, bright up to where you are. Click or drag to
 * move through it. The times underneath are listening time, so they stretch
 * as the song slows. It glows more the more reverb there is.
 */
export function Wave({ glow }: { glow: number }) {
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

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const { duration, speed } = engine.snapshot();
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
      const lit = Math.round(at * count);
      const key = `${width} ${height} ${ratio} ${lit}`;
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
      for (const played of [true, false]) {
        g.fillStyle = played ? PLAYED : AHEAD;
        g.beginPath();
        for (let i = played ? 0 : lit; i < (played ? lit : count); i++) {
          const tall = Math.max(BAR, heights[i] * height);
          const x = left + i * (BAR + GAP);
          const y = (height - tall) / 2;
          // square ends on the few browsers that can't draw round ones
          if (g.roundRect) g.roundRect(x, y, BAR, tall, BAR / 2);
          else g.rect(x, y, BAR, tall);
        }
        g.fill();
      }
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
        <span ref={total}>0:00</span>
      </div>
    </div>
  );
}

/** The one picture in the app: play, or pause. */
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
