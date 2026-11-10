import { ROOM_SECONDS } from "../core/impulse";
import type { Settings } from "../core/settings";
import { chain } from "./chain";
import type { Job, Reply } from "./mp3.worker";

/** Finished sound, ready to become a file. */
export interface Sound {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

/**
 * Play the whole song through the chain as fast as the computer can go,
 * without making a sound, and keep what comes out. Once through, no loop,
 * and it runs on past the end for as long as the room takes to go quiet.
 */
export async function render(song: AudioBuffer, settings: Settings, progress: (done: number) => void): Promise<Sound> {
  // an MP3 can't go higher than 48 kHz
  const sampleRate = song.sampleRate === 44100 ? 44100 : 48000;
  const tail = settings.reverb > 0 ? ROOM_SECONDS : 0;
  const seconds = song.duration / settings.speed + tail;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = song;
  source.playbackRate.value = settings.speed;
  source.connect(chain(ctx, settings.reverb).input);
  source.start();

  const watch = setInterval(() => progress(Math.min(1, ctx.currentTime / seconds)), 100);
  let out: AudioBuffer;
  try {
    out = await ctx.startRendering();
  } finally {
    clearInterval(watch);
  }

  // copies, because these are about to be handed to another thread
  const left = out.getChannelData(0).slice();
  const right = out.getChannelData(1).slice();
  // end on silence rather than wherever the room had got to
  const fade = tail ? Math.round(0.4 * sampleRate) : 0;
  for (let i = left.length - fade; i < left.length; i++) {
    const g = (left.length - 1 - i) / fade;
    left[i] *= g;
    right[i] *= g;
  }
  return { left, right, sampleRate };
}

/** Sound into a file, on another thread. */
export function encode(sound: Sound, progress: (done: number) => void): Promise<{ file: Uint8Array<ArrayBuffer>; extension: "mp3" | "wav" }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./mp3.worker.ts", import.meta.url), { type: "module" });
    const finish = (settle: () => void) => {
      worker.terminate();
      settle();
    };
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      if ("done" in reply) progress(reply.done);
      else if ("file" in reply) finish(() => resolve(reply));
      else finish(() => reject(new Error(reply.error)));
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message)));
    const job: Job = sound;
    worker.postMessage(job, [sound.left.buffer, sound.right.buffer]);
  });
}

/** Hand a file to the browser to save. */
export function download(file: Uint8Array<ArrayBuffer>, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([file], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
