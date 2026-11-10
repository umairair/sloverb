import { noise } from "./dsp";

/**
 * A 16 bit WAV file. Only used when the MP3 encoder can't load, so a save
 * always ends in a file. Dithered, so quiet reverb tails fade into hiss
 * instead of crunching.
 */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array<ArrayBuffer> {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytes = frames * count * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, bytes, true);

  const rand = noise(7);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const dither = (rand() + rand()) * 0.5;
      const v = Math.round(channels[c][i] * 32767 + dither);
      view.setInt16(at, Math.max(-32768, Math.min(32767, v)), true);
      at += 2;
    }
  }
  return new Uint8Array(buffer);
}
