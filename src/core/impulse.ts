import { noise, pole } from "./dsp";

/**
 * The room. A reverb is a recording of a space answering one click, and
 * every sound that goes in comes out smeared by that answer. This writes the
 * answer of a big soft hall that doesn't exist:
 *
 *  - a short gap before anything comes back, so the song stays in front
 *  - a quick swell instead of a slap, because the walls are far away
 *  - a long body that takes seconds to die
 *  - air on top that dies much sooner, the way real rooms swallow treble
 *  - no low end, so bass and kick stay tight instead of turning to mud
 *  - a different answer for each ear, which is what makes it wide
 *
 * Same numbers every time (the noise is seeded), so a saved file gets the
 * exact room that was playing.
 */

export interface Impulse {
  left: Float32Array;
  right: Float32Array;
}

export const ROOM_SECONDS = 4.6;

const GAP = 0.018;
const SWELL = 0.014;
const BODY_RT60 = 3.9;
const AIR_RT60 = 1.5;
const SPLIT_HZ = 2600;
const FLOOR_HZ = 230;
const FADE = 0.5;

function ear(sampleRate: number, seed: number): Float32Array {
  const n = Math.round(ROOM_SECONDS * sampleRate);
  const out = new Float32Array(n);
  const rand = noise(seed);
  const start = Math.round(GAP * sampleRate);
  const split = pole(SPLIT_HZ, sampleRate);
  const floor = pole(FLOOR_HZ, sampleRate);
  // -60 dB after RT60 seconds
  const bodyStep = Math.exp(-6.908 / (BODY_RT60 * sampleRate));
  const airStep = Math.exp(-6.908 / (AIR_RT60 * sampleRate));
  const swellStep = Math.exp(-1 / (SWELL * sampleRate));
  const fadeFrom = n - Math.round(FADE * sampleRate);

  let low = 0;
  let body = 1;
  let air = 1;
  let closed = 1;
  let mud1 = 0;
  let mud2 = 0;
  for (let i = start; i < n; i++) {
    const white = rand();
    low += split * (white - low);
    let x = (low * body + (white - low) * air * 0.7) * (1 - closed);
    body *= bodyStep;
    air *= airStep;
    closed *= swellStep;
    // take the lows out, twice over for a steeper cut
    mud1 += floor * (x - mud1);
    x -= mud1;
    mud2 += floor * (x - mud2);
    x -= mud2;
    // and make sure it ends on silence rather than a cut
    if (i >= fadeFrom) x *= 0.5 * (1 + Math.cos((Math.PI * (i - fadeFrom)) / (n - fadeFrom)));
    out[i] = x;
  }
  return out;
}

const energy = (x: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return sum;
};

/**
 * The room at a given sample rate. Scaled so each ear's answer has an energy
 * of one: steady noise comes out as loud as it went in, whatever the rate.
 */
export function impulse(sampleRate: number): Impulse {
  const left = ear(sampleRate, 0x51e0);
  const right = ear(sampleRate, 0xbee5);
  const scale = 1 / Math.sqrt((energy(left) + energy(right)) / 2);
  for (let i = 0; i < left.length; i++) {
    left[i] *= scale;
    right[i] *= scale;
  }
  return { left, right };
}
