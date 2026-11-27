/**
 * How the light behind the page dances. The page hears four things each
 * frame: how loud the music is, and how much of it is low (the kick and the
 * bass), in the middle (snares, voices, chords) and high (hats, air). From
 * those come a slow swell that everything lit follows, and three quick hits
 * that land the moment their part of the music does and settle again. The
 * low one is the beat, and every light moves on it. No browser in here, so
 * it is tested in node.
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
  /** each part as it was a frame ago, to see it rise */
  last: [number, number, number];
  /** and where each has been sitting over the last fifth of a second or so, which a rise has to clear to be a beat */
  usual: [number, number, number];
  /** the fastest each part has risen lately, per second: the size of a real beat in this song, which the others are measured against */
  big: [number, number, number];
  /** where each hit is heading, which the three numbers above ease towards rather than jump to */
  aim: [number, number, number];
  /** seconds since each part last hit */
  since: [number, number, number];
}

export const STILL: Dance = { level: 0, kick: 0, mid: 0, high: 0, last: [0, 0, 0], usual: [0, 0, 0], big: [0, 0, 0], aim: [0, 0, 0], since: [9, 9, 9] };

const within = (n: number) => Math.min(1, Math.max(0, n));

/** A step towards something that covers `each` of the way in a sixtieth of a second, whatever the screen's own rate. */
const toward = (from: number, to: number, each: number, dt: number) => from + (to - from) * (1 - Math.pow(1 - each, dt * 60));

/** Anything quieter than this counts as silence. Above it the loudness is bent, so soft parts stay dim and loud ones glow. */
const QUIET = 0.1;
const bend = (level: number) => Math.min(1, (Math.max(0, level - QUIET) / (1 - QUIET)) ** 1.35 * 1.15);
const unbend = (shown: number) => QUIET + (1 - QUIET) * (within(shown) / 1.15) ** (1 / 1.35);

/** How long a hit takes to settle, in seconds: low, middle, high. Slow enough to read as a sway, not a twitch. */
const SETTLE = [0.42, 0.46, 0.4];
/**
 * The least time between two hits of the same part, in seconds. This is a safety rule, not a matter of taste: a
 * screen that pulses more than three times a second can set off a seizure in someone with photosensitive epilepsy,
 * and is unpleasant for everyone else. So hats and fast kicks are thinned to under three a second, whatever the song.
 */
const APART = 0.36;
/** How much of the way to a hit a light goes in a sixtieth of a second: there in about a tenth of a second, never in one frame. */
const EASE = 0.3;
/** How long the biggest rise is remembered, in seconds, so a quiet verse after a loud chorus finds its own beat. */
const REMEMBER = 3;
/** The least and the most a rise can count as the biggest, per second: hiss is never a beat, and one freak jump can't dwarf the next ten. */
const LEAST = 1.2;
const MOST = 12;
/** A rise this share of the biggest lately starts to count, and at this share it is a full hit. Anything smaller, the notes between the beats, is let go. */
const COUNTS = 0.3;
const FULL = 0.85;

/**
 * One frame on. `dt` is the seconds since the last one.
 *
 * The swell is eased both ways, about two thirds of a second each, so the
 * brightness of the page rises and falls with the song and never flashes.
 *
 * A hit is found by how fast its part of the music is rising, not by how
 * loud it is: a kick is the low end jumping, whatever bass is already
 * sounding under it. Each rise is measured against the biggest rise lately,
 * so only the real beats of this song count and the notes between them are
 * let go, in a dense, loud mix as much as in a sparse one.
 *
 * A hit is found in the frame the beat arrives, but nothing on the page
 * jumps: the lights ease towards it over about a tenth of a second and
 * settle over nearly half a second, no part can hit more than about three
 * times a second (`APART`), and a hit never changes how bright the page is,
 * only where the lights are (see `.aura` in styles.css). The first version
 * of this moved in a single frame on every beat and hat, and Umair's words
 * for it on 2026-11-14 were that it was giving epilepsy. Don't make it
 * sudden again.
 */
export function dance(was: Dance, heard: Heard, dt: number, playing: boolean): Dance {
  const loud = bend(heard.level);
  const level = toward(was.level, loud, loud > was.level ? 0.025 : playing ? 0.024 : 0.04, dt);
  const last = [heard.low, heard.mid, heard.high] as [number, number, number];
  const before = [was.kick, was.mid, was.high];
  const usual = [0, 0, 0] as [number, number, number];
  const big = [0, 0, 0] as [number, number, number];
  const aim = [0, 0, 0] as [number, number, number];
  const since = [0, 0, 0] as [number, number, number];
  const hits = last.map((now, i) => {
    usual[i] = toward(was.usual[i], now, 0.08, dt);
    // only the part of a rise that goes above where this part of the music has been sitting counts. A loud master
    // ducks its bass under every snare and hat and lets it back up after, and that way back up is not a beat.
    // And the first frame after silence is the song starting, not a beat either
    const rise = dt > 0 && was.last[i] > 0 ? Math.min(MOST, Math.max(0, now - Math.max(was.last[i], was.usual[i])) / dt) : 0;
    big[i] = Math.max(rise, was.big[i] * Math.exp(-dt / REMEMBER), LEAST);
    const hit = within((rise / big[i] - COUNTS) / (FULL - COUNTS));
    const settled = was.aim[i] * Math.exp(-dt / SETTLE[i]);
    // a new hit only counts once the last one is far enough behind, or while that one is still arriving
    const counts = hit > 0 && (was.since[i] >= APART || was.since[i] < 0.05);
    aim[i] = counts ? Math.max(hit, settled) : settled;
    since[i] = counts && was.since[i] >= APART ? 0 : was.since[i] + dt;
    return toward(before[i], aim[i], EASE, dt);
  });
  return { level, kick: hits[0], mid: hits[1], high: hits[2], last, usual, big, aim, since };
}

/**
 * The light is drawn from what the engine is playing, but that isn't heard
 * until it has left the speaker, which is a moment later on a phone and a
 * fifth of a second on wireless headphones. So what was heard is kept for a
 * while with its time, and the light dances to what is reaching the ear now.
 * `add` a frame, then `take` the one from `ago` seconds back.
 */
export class Echo {
  private kept: { at: number; heard: Heard }[] = [];
  add(at: number, heard: Heard) {
    this.kept.push({ at, heard });
  }
  take(at: number, ago: number): Heard {
    // the newest frame that is old enough, and nothing older than it is needed again
    let found = 0;
    while (found + 1 < this.kept.length && this.kept[found + 1].at <= at - ago) found++;
    if (found > 0) this.kept.splice(0, found);
    return this.kept[0].heard;
  }
}

/**
 * Something to dance to when nothing is playing, for `theme`, so the
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
