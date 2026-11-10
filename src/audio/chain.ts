import { impulse } from "../core/impulse";
import { dryGain, hold, KNEE, wetGain } from "../core/settings";

/**
 * Everything between the song and your ears:
 *
 *   song ─┬─ dry ────────────┬─ ceiling ─ out
 *         └─ room ─ wet ─────┘
 *
 * Built the same way for the live player and for a save, so the file is what
 * you were hearing.
 */
export interface Chain {
  /** plug the song in here */
  input: AudioNode;
  /** what comes out the far end, for anything that wants to listen in */
  output: AudioNode;
  /** set how much reverb; `glide` eases there instead of jumping, for a slider being dragged */
  reverb(amount: number, glide?: boolean): void;
}

/** The loudest the mix is allowed to get before the ceiling, as a multiple of full scale: 12 dB over. */
const REACH = 4;

const CURVE = new Float32Array(8193);
for (let i = 0; i < CURVE.length; i++) CURVE[i] = hold(((i / (CURVE.length - 1)) * 2 - 1) * REACH);

export function chain(ctx: BaseAudioContext, reverb: number): Chain {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();

  const answer = impulse(ctx.sampleRate);
  const buffer = ctx.createBuffer(2, answer.left.length, ctx.sampleRate);
  buffer.getChannelData(0).set(answer.left);
  buffer.getChannelData(1).set(answer.right);
  const room = ctx.createConvolver();
  // the room is already scaled; left alone it is the same in every browser
  room.normalize = false;
  room.buffer = buffer;

  // A loud song plus its own reverb is louder than a file can hold. The
  // song goes in a touch quieter, and whatever still pokes over is bent
  // under the ceiling. A shaper only looks at samples from -1 to 1, so the
  // mix is squeezed into that range on the way in and the curve undoes it.
  input.gain.value = KNEE;
  const squeeze = ctx.createGain();
  squeeze.gain.value = 1 / REACH;
  const ceiling = ctx.createWaveShaper();
  ceiling.curve = CURVE;

  input.connect(dry).connect(squeeze);
  input.connect(room).connect(wet).connect(squeeze);
  squeeze.connect(ceiling).connect(ctx.destination);

  const set = (amount: number, glide = false) => {
    const now = ctx.currentTime;
    for (const [param, value] of [[dry.gain, dryGain(amount)], [wet.gain, wetGain(amount)]] as const) {
      if (glide) param.setTargetAtTime(value, now, 0.03);
      else param.setValueAtTime(value, now);
    }
  };
  set(reverb);

  return { input, output: ceiling, reverb: set };
}
