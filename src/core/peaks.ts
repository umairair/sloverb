/**
 * The shape of a song, for drawing. Loudness (not peaks, which are flat on
 * anything mastered loud) over a fixed number of slices, 0 to 1.
 */
export function envelope(channels: readonly Float32Array[], slices = 1600): Float32Array {
  const out = new Float32Array(slices);
  const length = channels[0]?.length ?? 0;
  if (!length) return out;
  const per = length / slices;
  // a long song has tens of millions of samples and every fourth is plenty for a picture
  const stride = Math.max(1, Math.floor(per / 2000));
  let top = 0;
  for (let i = 0; i < slices; i++) {
    const from = Math.floor(i * per);
    const to = Math.min(length, Math.max(from + 1, Math.floor((i + 1) * per)));
    let sum = 0;
    let n = 0;
    for (const ch of channels) {
      for (let j = from; j < to; j += stride) {
        sum += ch[j] * ch[j];
        n++;
      }
    }
    out[i] = Math.sqrt(sum / Math.max(1, n));
    if (out[i] > top) top = out[i];
  }
  if (top > 0) for (let i = 0; i < slices; i++) out[i] = (out[i] / top) ** 0.8;
  return out;
}

/** The envelope cut down to however many bars fit on screen. */
export function bars(env: Float32Array, count: number): Float32Array {
  const out = new Float32Array(Math.max(0, count));
  if (!env.length) return out;
  const per = env.length / count;
  for (let i = 0; i < count; i++) {
    const from = Math.floor(i * per);
    const to = Math.min(env.length, Math.max(from + 1, Math.floor((i + 1) * per)));
    let top = 0;
    for (let j = from; j < to; j++) if (env[j] > top) top = env[j];
    out[i] = top;
  }
  return out;
}
