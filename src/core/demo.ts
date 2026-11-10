import { noise, peak, pole } from "./dsp";

/**
 * The demo song. There is no file: it is written out here note by note and
 * turned into sound when you ask for it, so there is something to play with
 * before you have a song of your own, and nothing to download.
 *
 * Four chords going round (F major 7, G6, E minor 7, A minor 7) on soft
 * keys, then bass and drums, then a tune on top, then it thins out again so
 * the end meets the beginning when it loops.
 */

export interface Song {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

const BPM = 92;
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;
const BARS = 24;
/** time for the last chord to die away */
const RING = 2.6;
/** how late the off-beats land, in beats: a little lazy */
const SWING = 0.09;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const when = (bar: number, beat: number) => bar * BAR + (beat + (beat % 1 === 0.5 ? SWING : 0)) * BEAT;

/** One overtone of a note: how many times the pitch, how loud, how many seconds it takes to fade. */
type Overtone = readonly [times: number, level: number, seconds: number];

const KEYS: Overtone[] = [[1, 1, 1.2], [2, 0.26, 0.55], [3, 0.07, 0.35], [4, 0.05, 0.16]];
const BASS: Overtone[] = [[1, 1, 0.9], [2, 0.3, 0.5], [3, 0.1, 0.3]];
const BELL: Overtone[] = [[1, 1, 0.55], [2, 0.35, 0.28], [3, 0.12, 0.14]];

const CHORDS = [
  { keys: [53, 57, 60, 64], bass: 41 },
  { keys: [55, 59, 62, 64], bass: 43 },
  { keys: [52, 55, 59, 62], bass: 40 },
  { keys: [55, 57, 60, 64], bass: 45 },
];

/** The tune, eight bars: bar, beat, beats long, note. */
const TUNE: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 1.5, 76], [0, 1.5, 0.5, 72], [0, 2, 2, 69],
  [1, 0, 1.5, 74], [1, 1.5, 0.5, 71], [1, 2, 1.5, 67], [1, 3.5, 0.5, 69],
  [2, 0, 1.5, 71], [2, 1.5, 0.5, 67], [2, 2, 2, 64],
  [3, 0, 1, 72], [3, 1, 1, 69], [3, 2, 1, 72], [3, 3, 1, 74],
  [4, 0, 1.5, 76], [4, 1.5, 0.5, 79], [4, 2, 2, 76],
  [5, 0, 1.5, 74], [5, 1.5, 0.5, 76], [5, 2, 2, 74],
  [6, 0, 1.5, 71], [6, 1.5, 0.5, 74], [6, 2, 2, 71],
  [7, 0, 1.5, 72], [7, 1.5, 0.5, 71], [7, 2, 2, 69],
];

/** Where a sound sits between the ears, -1 left to 1 right, as a level for each. */
const place = (pan: number): [number, number] => [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];

/** A struck note: every overtone starts together and fades at its own pace, faster once the note is let go. */
function ring(song: Song, at: number, freq: number, level: number, pan: number, overtones: Overtone[], held: number) {
  const { left, right, sampleRate } = song;
  const start = Math.round(at * sampleRate);
  const [gl, gr] = place(pan);
  const attack = Math.round(0.005 * sampleRate);
  const off = Math.round(held * sampleRate);
  const letGo = Math.exp(-1 / (0.09 * sampleRate));
  for (const [times, amount, seconds] of overtones) {
    // a sine wave by turning a point round a circle: two multiplies a sample instead of a sin()
    const turn = (2 * Math.PI * freq * times) / sampleRate;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const fade = Math.exp(-1 / (seconds * sampleRate));
    let x = 1;
    let y = 0;
    let loud = amount * level;
    for (let i = 0, j = start; j < left.length && loud > 2e-5; i++, j++) {
      const v = y * loud * (i < attack ? i / attack : 1);
      left[j] += v * gl;
      right[j] += v * gr;
      const nx = x * cos - y * sin;
      y = y * cos + x * sin;
      x = nx;
      loud *= i < off ? fade : fade * letGo;
    }
  }
}

/** Drop a ready-made hit into the song. */
function stamp(song: Song, at: number, hit: Float32Array, level: number, pan: number) {
  const start = Math.round(at * song.sampleRate);
  const [gl, gr] = place(pan);
  const n = Math.min(hit.length, song.left.length - start);
  for (let i = 0; i < n; i++) {
    song.left[start + i] += hit[i] * level * gl;
    song.right[start + i] += hit[i] * level * gr;
  }
}

/** A kick: a low thud whose pitch drops as it lands. */
function kick(sampleRate: number): Float32Array {
  const out = new Float32Array(Math.round(0.45 * sampleRate));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    phase += (2 * Math.PI * (46 + 95 * Math.exp(-t / 0.032))) / sampleRate;
    out[i] = Math.tanh(1.6 * Math.sin(phase) * Math.exp(-t / 0.15)) * Math.min(1, t / 0.002);
  }
  return out;
}

/** A snare: a short burst of mid noise over a quick knock. */
function snare(sampleRate: number): Float32Array {
  const out = new Float32Array(Math.round(0.3 * sampleRate));
  const rand = noise(11);
  const top = pole(5200, sampleRate);
  const bottom = pole(900, sampleRate);
  let a = 0;
  let b = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    a += top * (rand() - a);
    b += bottom * (a - b);
    out[i] = (a - b) * Math.exp(-t / 0.075) * 1.6 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t / 0.045) * 0.5;
  }
  return out;
}

/** A hi-hat: only the top of the noise, gone almost at once (or not quite, for an open one). */
function hat(sampleRate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * 7 * sampleRate));
  const rand = noise(23);
  const corner = pole(7000, sampleRate);
  let low = 0;
  for (let i = 0; i < out.length; i++) {
    const white = rand();
    low += corner * (white - low);
    out[i] = (white - low) * Math.exp(-i / sampleRate / seconds);
  }
  return out;
}

export function demo(sampleRate = 44100): Song {
  const n = Math.round((BARS * BAR + RING) * sampleRate);
  const song: Song = { left: new Float32Array(n), right: new Float32Array(n), sampleRate };
  const thud = kick(sampleRate);
  const crack = snare(sampleRate);
  const tick = hat(sampleRate, 0.022);
  const open = hat(sampleRate, 0.1);

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORDS[bar % 4];
    const last = bar === BARS - 1;
    const band = bar >= 4 && bar < 20;

    chord.keys.forEach((note, i) => {
      const pan = (i - 1.5) * 0.28;
      ring(song, when(bar, 0), hz(note), 0.1, pan, KEYS, last ? 4 * BEAT + RING : 2.45 * BEAT);
      if (!last) ring(song, when(bar, 2.5), hz(note), 0.07, pan, KEYS, 1.4 * BEAT);
    });

    if (bar >= 4) {
      ring(song, when(bar, 0), hz(chord.bass), 0.3, 0, BASS, 1.4 * BEAT);
      if (!last) ring(song, when(bar, 2.5), hz(chord.bass), 0.24, 0, BASS, 0.9 * BEAT);
      if (band && bar % 2 === 1) ring(song, when(bar, 3.5), hz(chord.bass + 12), 0.16, 0, BASS, 0.4 * BEAT);
    }

    if (band) {
      stamp(song, when(bar, 0), thud, 0.6, 0);
      stamp(song, when(bar, 2.5), thud, 0.5, 0);
      if (bar % 4 === 3) stamp(song, when(bar, 1.5), thud, 0.38, 0);
      stamp(song, when(bar, 1), crack, 0.3, 0.05);
      stamp(song, when(bar, 3), crack, 0.32, -0.05);
      for (let eighth = 0; eighth < 8; eighth++) {
        const lift = bar % 4 === 3 && eighth === 7;
        stamp(song, when(bar, eighth / 2), lift ? open : tick, eighth % 2 ? 0.05 : 0.085, 0.25);
      }
    }

    if (bar >= 12 && bar < 20) {
      for (const [inBar, beat, beats, note] of TUNE) {
        if (inBar !== bar - 12) continue;
        const at = when(bar, beat);
        ring(song, at, hz(note), 0.13, -0.2, BELL, beats * BEAT);
        // and once more, quieter, from the other side
        ring(song, at + 0.75 * BEAT, hz(note), 0.042, 0.45, BELL, beats * BEAT * 0.6);
      }
    }
  }

  // round off anything too loud, let the ending fade to nothing, and set the level
  const fadeFrom = n - Math.round(RING * sampleRate);
  for (let i = 0; i < n; i++) {
    const out = i < fadeFrom ? 1 : 0.5 * (1 + Math.cos((Math.PI * (i - fadeFrom)) / (n - fadeFrom)));
    song.left[i] = Math.tanh(song.left[i] * 1.1) * out;
    song.right[i] = Math.tanh(song.right[i] * 1.1) * out;
  }
  const scale = 0.9 / peak(song.left, song.right);
  for (let i = 0; i < n; i++) {
    song.left[i] *= scale;
    song.right[i] *= scale;
  }
  return song;
}
