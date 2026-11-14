/**
 * How the light behind the page dances. The page hears four things each
 * frame: how loud the music is, and how much of it is low (the kick and the
 * bass), in the middle (voices, chords) and high (hats, snares, air). From
 * those come a slow swell that everything lit follows, and three quick ones,
 * one for each of the lights, that jump when their part of the music hits
 * and settle again. No browser in here, so it is tested in node.
 */

/** What is heard in one frame, each 0 to 1. */
export interface Heard {
  level: number;
  low: number;
  mid: number;
  high: number;
}

export interface Dance {
  /** the swell: how bright everything lit is */
  level: number;
  /** the three hits, 0 to 1: low, middle and high */
  kick: number;
  mid: number;
  high: number;
  /** what each part of the music has been doing lately, which a hit has to rise above */
  usual: [number, number, number];
  /** and how far each has been straying from that, which is what a hit is measured against */
  stray: [number, number, number];
}

export const STILL: Dance = { level: 0, kick: 0, mid: 0, high: 0, usual: [0, 0, 0], stray: [0, 0, 0] };

const within = (n: number) => Math.min(1, Math.max(0, n));

/** A step towards something that covers `each` of the way in a sixtieth of a second, whatever the screen's own rate. */
const toward = (from: number, to: number, each: number, dt: number) => from + (to - from) * (1 - Math.pow(1 - each, dt * 60));

/** Anything quieter than this counts as silence. Above it the loudness is bent, so soft parts stay dim and loud ones glow. */
const QUIET = 0.1;
const bend = (level: number) => Math.min(1, (Math.max(0, level - QUIET) / (1 - QUIET)) ** 1.35 * 1.15);
const unbend = (shown: number) => QUIET + (1 - QUIET) * (within(shown) / 1.15) ** (1 / 1.35);

/** How far over its usual a part has to be before it counts, how many times its usual straying makes a full hit, and how long one takes to settle, in seconds. */
const OVER = [0.006, 0.01, 0.01];
const FULL = [2.2, 2.8, 2.8];
const SETTLE = [0.26, 0.3, 0.16];
/** The least straying a hit is measured against, so the hiss in a quiet passage isn't taken for a beat. */
const FLOOR = 0.016;

/**
 * One frame on. `dt` is the seconds since the last one.
 * The swell is eased both ways, about two thirds of a second each, so the
 * brightness of the page rises and falls with the song and never flashes.
 * A hit is quicker, a twentieth of a second up and a quarter down, but it
 * moves the lights far more than it brightens them (see `.aura` in
 * styles.css), which is what makes them dance without flickering.
 */
export function dance(was: Dance, heard: Heard, dt: number, playing: boolean): Dance {
  const loud = bend(heard.level);
  const level = toward(was.level, loud, loud > was.level ? 0.025 : playing ? 0.024 : 0.04, dt);
  const parts = [heard.low, heard.mid, heard.high];
  const before = [was.kick, was.mid, was.high];
  const usual = [0, 0, 0] as [number, number, number];
  const stray = [0, 0, 0] as [number, number, number];
  const hits = parts.map((now, i) => {
    const over = now - was.usual[i];
    // what is usual follows a rise slowly and a fall quickly, so a steady loud part stops counting as a hit
    // and the first beat after a quiet one lands in full
    usual[i] = toward(was.usual[i], now, over > 0 ? 0.03 : 0.12, dt);
    stray[i] = toward(was.stray[i], Math.abs(over), 0.02, dt);
    // a hit is measured against how much this part of this song moves at all, so a dense, loud mix whose
    // kick barely clears its bass dances as hard as a sparse one where it stands alone
    const hit = within((over - OVER[i]) / (was.stray[i] * FULL[i] + FLOOR));
    return hit > before[i] ? toward(before[i], hit, 0.5, dt) : before[i] * Math.exp(-dt / SETTLE[i]);
  });
  return { level, kick: hits[0], mid: hits[1], high: hits[2], usual, stray };
}

/**
 * Something to dance to when nothing is playing, for `settings`, so the
 * glows there show what they do: a quiet song at 96 beats a minute, with a
 * kick on the beat, something in the middle off it and hats twice as often.
 */
export function demo(seconds: number): Heard {
  const beat = seconds * 1.6;
  const after = (phase: number, fade: number) => Math.exp(-(((phase % 1) + 1) % 1) * fade);
  return {
    level: unbend(0.62 + 0.26 * Math.sin(seconds * 1.05)),
    low: 0.5 + 0.3 * after(beat, 7),
    mid: 0.45 + 0.22 * after(beat + 0.5, 6),
    high: 0.35 + 0.22 * after(beat * 2 + 0.25, 9),
  };
}

/** How much of the music lies between two pitches, 0 to 1, from an analyser's byte spectrum whose bins are `binHz` apart. */
export function part(spectrum: Uint8Array, fromHz: number, toHz: number, binHz: number): number {
  const first = Math.max(1, Math.round(fromHz / binHz));
  const last = Math.min(spectrum.length - 1, Math.max(first, Math.round(toHz / binHz)));
  let sum = 0;
  for (let i = first; i <= last; i++) sum += spectrum[i];
  return sum / (last - first + 1) / 255;
}
