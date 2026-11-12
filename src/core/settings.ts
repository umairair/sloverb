/**
 * The two things you can change, and everything that follows from them.
 * No browser in here, so all of it is tested in node.
 */

export interface Settings {
  /** How fast it plays, 1 = as recorded. Pitch follows, like a record on a turntable. */
  speed: number;
  /** 0 = dry, 1 = drenched. */
  reverb: number;
}

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;

/** Where both sliders start, and where reset takes them back to: slowed, with some reverb. */
export const DEFAULTS: Settings = { speed: 0.8, reverb: 0.4 };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const OCTAVES = Math.log2(MAX_SPEED / MIN_SPEED);

/**
 * Where the speed slider sits, 0 to 1. Equal distances are equal changes in
 * pitch, so as recorded is dead centre and half speed is as far left as
 * double speed is right.
 */
export function speedToSlider(speed: number): number {
  return clamp(Math.log2(speed / MIN_SPEED) / OCTAVES, 0, 1);
}

/** The speed for a slider position. Lands on whole hundredths, and holds on to 1 when you pass close by. */
export function sliderToSpeed(position: number): number {
  const speed = MIN_SPEED * 2 ** (clamp(position, 0, 1) * OCTAVES);
  if (Math.abs(Math.log2(speed)) < 0.025) return 1;
  return Math.round(speed * 100) / 100;
}

export function cleanSettings(s: Settings): Settings {
  return {
    speed: clamp(Number.isFinite(s.speed) ? s.speed : 1, MIN_SPEED, MAX_SPEED),
    reverb: clamp(Number.isFinite(s.reverb) ? s.reverb : 0, 0, 1),
  };
}

/**
 * Reverb piles up into peaks far taller than the song's own, and the more
 * of it the taller: on a loud modern master, 2 dB over at 40% and 8 dB over
 * at the top. Past halfway the whole mix comes down a little to leave them
 * room, up to 4.2 dB, and the ceiling below takes care of the rest.
 */
const headroom = (reverb: number) => 10 ** ((-4.2 * reverb ** 3) / 20);

/**
 * How loud the reverb is for a slider position. Gentle at first, so the low
 * end of the slider is a hint of a room, and louder than the song by the top.
 */
export function wetGain(reverb: number): number {
  const r = clamp(reverb, 0, 1);
  return 1.4 * r ** 1.5 * headroom(r);
}

/** The song itself steps back as the reverb comes up, so the two together stay about as loud. */
export function dryGain(reverb: number): number {
  const r = clamp(reverb, 0, 1);
  return (1 - 0.3 * r) * headroom(r);
}

/** The level a full-scale song sits at going in: 1 dB down, right where the ceiling starts to bend. */
export const KNEE = 0.89;
/** Nothing comes out louder than this, which leaves an MP3 a little room to overshoot. */
export const CEILING = 0.97;

/**
 * The ceiling. Up to the knee a sample passes through untouched, so a song
 * on its own is never altered. Above it the sample is bent smoothly toward
 * the ceiling and never reaches it. Unlike a limiter this has no memory, so
 * it can't pump, and it is the same sum in every browser and in a save.
 */
export function hold(sample: number): number {
  const size = Math.abs(sample);
  if (size <= KNEE) return sample;
  return Math.sign(sample) * (KNEE + (CEILING - KNEE) * Math.tanh((size - KNEE) / (CEILING - KNEE)));
}

/** Whether both sliders are where they started, to the hundredth. */
export function isDefault(s: Settings): boolean {
  return Math.abs(s.speed - DEFAULTS.speed) < 0.005 && Math.abs(s.reverb - DEFAULTS.reverb) < 0.005;
}

/** What to call the result: "slowed + reverb", "nightcore", "sped up", or nothing when nothing changed. */
export function describe(s: Settings): string {
  const reverb = s.reverb >= 0.02;
  const pace = s.speed < 0.985 ? "slowed" : s.speed > 1.015 ? (reverb || s.speed < 1.15 ? "sped up" : "nightcore") : "";
  return [pace, reverb && "reverb"].filter(Boolean).join(" + ");
}

/** The name of the saved file: the song, then what was done to it. */
export function fileName(title: string, s: Settings, extension: string): string {
  const safe = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() || "sloverb";
  const what = describe(s);
  return `${safe}${what ? ` (${what})` : ""}.${extension}`;
}
