import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { engine } from "./audio/engine";
import { dance, demo, Echo, STILL } from "./core/dance";
import { clock } from "./core/format";
import { bars } from "./core/peaks";
import { looks } from "./look";

export function useEngine() {
  return useSyncExternalStore(engine.subscribe, engine.snapshot);
}

const between = (x: number) => Math.min(1, Math.max(0, x));

/** Which way an arrow key points along a slider. */
const ARROWS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
/** The bigger steps every slider also takes from the keyboard, as screen readers and the ARIA slider pattern expect. */
const PAGES: Record<string, number> = { PageUp: 1, PageDown: -1 };

/** Anyone who has asked their device for less motion. */
export const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * What a screen reader is told, in one polite live region that is always on the page (`Announcer`, in App). A region
 * that appears with its words already in it is often not read at all, so everything that changes without the focus
 * moving says so here: a song added, saving and saved, how an import is going, the next song's name. It is emptied
 * first, so saying the same thing twice is still heard twice.
 */
let said = "";
let saying = 0;
const hearers = new Set<() => void>();
const tell = (text: string) => {
  said = text;
  for (const hearer of hearers) hearer();
};
export function announce(text: string) {
  clearTimeout(saying);
  tell("");
  saying = window.setTimeout(() => tell(text), 80);
}
export function Announcer() {
  const text = useSyncExternalStore(
    (hearer) => {
      hearers.add(hearer);
      return () => void hearers.delete(hearer);
    },
    () => said,
  );
  const { note, title, status } = useEngine();
  const was = useRef({ title, status });
  useEffect(() => {
    if (note) announce(note);
  }, [note]);
  useEffect(() => {
    const before = was.current;
    was.current = { title, status };
    // the first song is read out where the focus lands, its name at the top of the player. Later ones change under it
    if (status === "opening" && before.status === "empty") announce("opening");
    else if (title && before.title && title !== before.title) announce(title);
  }, [title, status]);
  return (
    <p className="unseen" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </p>
  );
}

/**
 * Arrow keys move the choice through a group of radio buttons, the way the group is used everywhere else: one stop
 * for Tab on the one that is chosen, and the arrows, Home and End choose the next one and take the focus to it.
 */
export function radioKeys(event: KeyboardEvent<HTMLElement>) {
  const all = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const at = all.indexOf(event.target as HTMLButtonElement);
  if (at < 0) return;
  const way = ARROWS[event.key];
  const to = event.key === "Home" ? 0 : event.key === "End" ? all.length - 1 : way ? (at + way + all.length) % all.length : -1;
  if (to < 0) return;
  event.preventDefault();
  event.stopPropagation();
  all[to].focus();
  all[to].click();
}

/**
 * How far across an element a pointer is, 0 to 1. With `inset`, the ends are reached that many pixels in from the
 * edges: a finger can't comfortably get to the very edge of a phone, least of all in a case, so a slider is at
 * nothing or at everything a little before the finger runs out of screen.
 */
function across(event: PointerEvent<HTMLElement>, inset = 0): number {
  const box = event.currentTarget.getBoundingClientRect();
  const room = Math.min(inset, box.width / 4);
  return between((event.clientX - box.left - room) / (box.width - room * 2));
}

/**
 * Takes hold of a pointer that has just pressed on something you drag, and says whether it should count: the main
 * button of a mouse, or any finger or pen. Capture keeps the drag going when the finger slides off the control, but
 * some touch screens (a Windows laptop's, 2026-11-16) refuse it, and a refusal throws. That must never stop the press
 * from counting, so the caller tracks the pointer itself and capture is only a help.
 */
function hold(event: PointerEvent<HTMLElement>): boolean {
  if (event.pointerType === "mouse" && event.button !== 0) return false;
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // dragging still works while the finger stays on the control
  }
  return true;
}

/** How far in from each end of a slider its ends are reached. */
const REACH = 26;

/**
 * Light behind everything: the glow, in its three colours. It swells with how loud the music is and dances to it:
 * every light moves on the beat, the low end, and each also has a part of its own, the first the low end again, the
 * second the middle, the third the highs (the sums are in core/dance.ts, the shapes and how far each jumps in
 * styles.css). Black when the song is
 * paused or quiet. It also hands the loudness, as `--level`, to the few things that move with it (anything with the
 * class `hears`: this light, the veil over the player on a dark page, the play button's halo and the speed
 * slider's glow). Only to those: set on the whole page
 * it made every element restyle sixty times a second. The three hits go to this light alone.
 * How much of it anyone sees is theirs to choose on `themes` (`amount` in look.ts), down to none, which stills
 * everything that moves with the music.
 */
/** About how long a frame takes to get from here to the screen, in seconds. */
const DRAW = 0.04;

export function Aura() {
  const lights = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // a live list, so whatever comes and goes with the screens is picked up without asking again
    const hearing = document.getElementsByClassName("hears") as HTMLCollectionOf<HTMLElement>;
    // and the few things that glow as far as the glow effect is up (`--much`): told when it changes and when they
    // arrive with a screen, not every frame
    const glowing = document.getElementsByClassName("shines") as HTMLCollectionOf<HTMLElement>;
    const lit = new WeakMap<HTMLElement, number>();
    // anyone who asked for less motion gets the swell and not the dancing
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let moves = STILL;
    const echo = new Echo();
    let last = performance.now();
    let shown = -1;
    let told = 0;
    let hits = "";
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // a tab left in the background comes back with one very long frame: don't let it throw the lights across the page
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const { playing } = engine.snapshot();
      // on themes with nothing playing there would be nothing to see the slider or the glows change, so there the
      // light dances on its own, as if a quiet song were on
      // what the engine is playing is heard a moment later, longer on wireless headphones, so the light dances to
      // what is reaching the ear now. Getting a frame to the screen takes about DRAW of that by itself
      echo.add(now / 1000, engine.hear());
      const heard = echo.take(now / 1000, Math.max(0, engine.lag() - DRAW));
      moves = dance(moves, looks.showing && !playing ? demo(now / 1000) : heard, dt, playing);
      // the listener's own setting comes after the easing, so the slider is answered at once
      const { amount } = looks.snapshot();
      const hit = (much: number) => (less.matches ? 0 : Math.round(much * amount * 100) / 100);
      const next = `${hit(moves.kick)} ${hit(moves.mid)} ${hit(moves.high)}`;
      if (next !== hits && lights.current) {
        hits = next;
        const [kick, mid, high] = next.split(" ");
        lights.current.style.setProperty("--kick", kick);
        lights.current.style.setProperty("--mid", mid);
        lights.current.style.setProperty("--high", high);
      }
      for (const element of glowing) {
        if (lit.get(element) === amount) continue;
        lit.set(element, amount);
        element.style.setProperty("--much", String(amount));
      }
      const rounded = Math.round(moves.level * amount * 200) / 200;
      if (rounded === shown && hearing.length === told) return;
      shown = rounded;
      told = hearing.length;
      for (const element of hearing) element.style.setProperty("--level", String(rounded));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="aura hears" ref={lights} aria-hidden>
      <i />
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
 * colour the more there is, the way reverb blurs the end of every note, and
 * with the glow effect up on `themes` lets it glow past the pill. Nothing changes when a finger takes hold of
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
  /** the finger, pen or mouse dragging it, if any */
  const held = useRef<number | null>(null);
  const letGo = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerId === held.current) held.current = null;
  };

  // the sheen: one pass every two seconds as recorded, four at half speed, one at double. The browser runs it on its
  // own (no script every frame), this only changes its rate when the speed does and stops it when the song does
  const sheen = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = sheen.current;
    // a Web Animation is not stopped by the stylesheet's rule for less motion, so it is not started at all
    if (!flow || !element?.animate || calm()) return;
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
    const page = PAGES[event.key];
    const end = event.key === "Home" ? 0 : event.key === "End" ? 1 : null;
    if (!step && !page && end === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (end !== null) onMove(end);
    else onStep(page ? page * 10 : step * (event.shiftKey ? 10 : 1));
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
      className={`slide shines ${className} ${bloom ? "slide--bloom" : ""}`}
      role="slider"
      tabIndex={0}
      aria-label={name}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(at * 100)}
      aria-valuetext={text}
      style={{ "--p": at } as CSSProperties}
      onPointerDown={(event) => {
        if (!hold(event)) return;
        held.current = event.pointerId;
        onMove(across(event, REACH));
      }}
      onPointerMove={(event) => {
        // `buttons` as well, so a mouse whose release was missed doesn't drag the slider by hovering over it
        if (event.pointerId === held.current && event.buttons) onMove(across(event, REACH));
      }}
      onPointerUp={letGo}
      onPointerCancel={letGo}
      onLostPointerCapture={letGo}
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
      const { theme, glow } = looks.snapshot();
      const key = `${width} ${height} ${ratio} ${lit} ${jump} ${theme} ${glow}`;
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

      // behind you, in the glow's colours
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
    const page = PAGES[event.key];
    const { duration } = engine.snapshot();
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      // not quite the very end, as with a drag
      engine.seek(event.key === "Home" ? 0 : duration * 0.999);
      return;
    }
    if (!way && !page) return;
    event.preventDefault();
    event.stopPropagation();
    engine.nudge(page ? page * 30 : way * 10);
  };

  return (
    <div className="timeline">
      <div
        ref={wave}
        className={`wave shines ${glow > 0 ? "is-glowing" : ""}`}
        style={{ "--glow": glow } as CSSProperties}
        role="slider"
        tabIndex={0}
        aria-label="position"
        aria-valuemin={0}
        aria-valuemax={100}
        // filled in as the song plays, by the drawing loop above
        aria-valuenow={0}
        aria-valuetext="0:00"
        onPointerDown={(event) => {
          if (hold(event)) drag.current = across(event);
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
        <canvas ref={canvas} aria-hidden />
      </div>
      <div className="times">
        <span ref={elapsed}>0:00</span>
        {count > 1 && (
          <span>
            <span aria-hidden>
              {index + 1} / {count}
            </span>
            <span className="unseen">
              song {index + 1} of {count}
            </span>
          </span>
        )}
        <span ref={total}>0:00</span>
      </div>
    </div>
  );
}

/**
 * The way out of info and of themes: the word, in the middle of the page under
 * everything else on it. Everything in sloverb is in one column down the
 * centre, so the way back is too.
 */
export function Back({ onClick }: { onClick: () => void }) {
  return (
    <div className="back">
      <button onClick={onClick}>back</button>
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
 * inside a thin ring.
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

/** How fast a name slides, in its own letter heights a second, so a big name and a small one feel the same. */
const PACE = 1.9;

/**
 * A line of text that slides when it is too long for its place: a song's name,
 * in the player and beside the bars at the bottom of the start screen. A name
 * that fits is left alone. One that doesn't is drawn twice, so the second is
 * arriving as the first leaves, and goes round and round, fading at both ends.
 * It sets off half a second after it appears and then never stops to rest. The browser moves it (only a
 * transform, no script per frame), and only while `moving`, which is while the
 * song plays. It is measured again whenever its place changes size, and anyone
 * who asks for less motion gets it cut short with an ellipsis instead.
 */
export function Marquee({ text, moving, className = "" }: { text: string; moving: boolean; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  /** one trip: how far in pixels (the name and the space before it comes round again) and how long. Null when the name fits */
  const [trip, setTrip] = useState<{ far: number; time: number } | null>(null);
  useEffect(() => {
    const element = box.current;
    const name = element?.querySelector<HTMLElement>(".marquee__run > span");
    if (!element || !name || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const run = getComputedStyle(name.parentElement!);
      const far = name.offsetWidth + (parseFloat(run.columnGap) || 0);
      const fits = name.offsetWidth <= element.clientWidth + 1;
      const time = far / ((parseFloat(run.fontSize) || 16) * PACE);
      setTrip((was) => (fits ? null : was?.far === far && was.time === time ? was : { far, time }));
    };
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    watch.observe(name);
    measure();
    return () => watch.disconnect();
  }, [text]);
  return (
    <span ref={box} className={`marquee ${className} ${trip ? "is-sliding" : ""} ${moving ? "is-moving" : ""}`}>
      {/* a new name starts its trip from the beginning */}
      <span key={text} className="marquee__run" style={trip ? ({ "--trip": `${trip.far}px`, "--time": `${trip.time}s` } as CSSProperties) : undefined}>
        <span dir="auto">{text}</span>
        {trip && (
          <span dir="auto" aria-hidden>
            {text}
          </span>
        )}
      </span>
    </span>
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
      <Marquee text={title} moving={playing} className="now-playing__title" />
    </button>
  );
}
