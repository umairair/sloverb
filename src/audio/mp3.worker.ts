import { createEncoder } from "wasm-media-encoders";
import wasm from "wasm-media-encoders/wasm/mp3?url";
import { encodeWav } from "../core/wav";

/**
 * Turns finished sound into a file, off the main thread so the page keeps
 * moving. An MP3 at the highest bitrate there is; if the encoder can't load,
 * a WAV instead, so a save always ends in a file.
 */

export interface Job {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

export type Reply = { done: number } | { file: Uint8Array<ArrayBuffer>; extension: "mp3" | "wav" } | { error: string };

const send = (reply: Reply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);

async function mp3({ left, right, sampleRate }: Job): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = await createEncoder("audio/mpeg", wasm);
  encoder.configure({ sampleRate, channels: 2, bitrate: 320 });
  const parts: Uint8Array[] = [];
  const step = sampleRate * 4;
  for (let i = 0; i < left.length; i += step) {
    // what comes back still belongs to the encoder, so copy it out before asking for more
    parts.push(encoder.encode([left.subarray(i, i + step), right.subarray(i, i + step)]).slice());
    send({ done: Math.min(1, (i + step) / left.length) });
  }
  parts.push(encoder.finalize().slice());
  const file = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    file.set(part, at);
    at += part.length;
  }
  return file;
}

self.onmessage = async (event: MessageEvent<Job>) => {
  try {
    let file: Uint8Array<ArrayBuffer>;
    let extension: "mp3" | "wav" = "mp3";
    try {
      file = await mp3(event.data);
    } catch {
      extension = "wav";
      file = encodeWav([event.data.left, event.data.right], event.data.sampleRate);
    }
    send({ file, extension }, [file.buffer]);
  } catch (error) {
    send({ error: String(error) });
  }
};
