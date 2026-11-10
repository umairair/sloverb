import { demo } from "../core/demo";
import { titleFrom } from "../core/format";
import { ROOM_SECONDS } from "../core/impulse";
import { envelope } from "../core/peaks";
import { cleanSettings, fileName, PRESETS, type Settings } from "../core/settings";
import { positionAt, wrap, type Anchor } from "../core/transport";
import { chain, type Chain } from "./chain";
import { download, encode, render } from "./save";

/**
 * The player. One song at a time, looping, through the chain. Everything the
 * screen needs to know is in `State`; where the song is right now changes
 * sixty times a second, so that is asked for with `position()` instead.
 *
 * Songs come in through `open` as a file's bytes and a name. Anything that
 * can get hold of a song (a link, a recording) only has to call that.
 */
export interface State extends Settings {
  status: "empty" | "opening" | "ready";
  /** what went wrong, said plainly, for a few seconds */
  error: string | null;
  title: string;
  /** seconds, as recorded */
  duration: number;
  playing: boolean;
  /** how far along a save is, 0 to 1, or null when there isn't one */
  saving: number | null;
}

/** Long enough that starting and stopping never click, short enough not to notice. */
const FADE = 0.02;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

class Engine {
  private state: State = { status: "empty", error: null, title: "", duration: 0, playing: false, saving: null, ...PRESETS.slowed };
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private chain: Chain | null = null;
  private song: AudioBuffer | null = null;
  private voice: { source: AudioBufferSourceNode; fade: GainNode } | null = null;
  private anchor: Anchor = { position: 0, at: 0 };
  /** the newest `open` wins if two overlap */
  private ticket = 0;
  private rest = 0;
  private forget = 0;

  /** the song's loudness from start to end, for drawing */
  shape: Float32Array = new Float32Array(0);

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  snapshot = () => this.state;

  private set(change: Partial<State>) {
    this.state = { ...this.state, ...change };
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = this.state.status !== "ready" ? "none" : this.state.playing ? "playing" : "paused";
    for (const listener of this.listeners) listener();
  }

  private context(): AudioContext {
    if (!this.ctx) {
      // on an iPhone this is what lets it play with the ringer switched off
      const session = (navigator as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = "playback";
      const ctx = new AudioContext();
      // a phone call or the system can stop the sound from outside; show that as paused
      ctx.onstatechange = () => {
        if (ctx.state !== "running" && this.state.playing) this.pause();
      };
      this.ctx = ctx;
      this.chain = chain(ctx, this.state.reverb);
    }
    return this.ctx;
  }

  /** Browsers only let sound start from a click or a key press. Call this from one, before anything slow. */
  wake = () => {
    const ctx = this.context();
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
  };

  /** Open a song from a file's bytes. Anything the browser can decode: mp3, m4a, wav, flac, ogg, the sound of a video. */
  open = async (file: Blob, name: string) => {
    const ticket = ++this.ticket;
    this.set({ status: "opening", error: null });
    try {
      const song = await this.context().decodeAudioData(await file.arrayBuffer());
      if (ticket !== this.ticket) return;
      // whatever was playing carries on until the new song is ready to take over
      this.halt();
      this.use(song, titleFrom(name));
    } catch {
      if (ticket === this.ticket) this.fail("can't read that file");
    }
  };

  /** The song that comes with it. */
  demo = () => {
    this.ticket++;
    this.halt();
    const ctx = this.context();
    const written = demo(ctx.sampleRate);
    const song = ctx.createBuffer(2, written.left.length, ctx.sampleRate);
    song.getChannelData(0).set(written.left);
    song.getChannelData(1).set(written.right);
    this.use(song, "demo");
  };

  private use(song: AudioBuffer, title: string) {
    this.song = song;
    this.shape = envelope(Array.from({ length: song.numberOfChannels }, (_, channel) => song.getChannelData(channel)));
    this.anchor = { position: 0, at: 0 };
    this.set({ status: "ready", error: null, title, duration: song.duration });
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "sloverb" });
      navigator.mediaSession.setActionHandler("play", () => void this.play());
      navigator.mediaSession.setActionHandler("pause", this.pause);
      navigator.mediaSession.setActionHandler("seekbackward", () => this.nudge(-10));
      navigator.mediaSession.setActionHandler("seekforward", () => this.nudge(10));
    }
    void this.play();
  }

  /** Say what went wrong for a few seconds, and go back to whatever was there before. */
  private fail(error: string) {
    this.set({ status: this.song ? "ready" : "empty", error });
    clearTimeout(this.forget);
    this.forget = window.setTimeout(() => this.set({ error: null }), 4000);
  }

  play = async () => {
    if (!this.song || this.state.playing || this.state.status !== "ready") return;
    const ctx = this.context();
    clearTimeout(this.rest);
    const running = () => ctx.state === "running";
    if (!running()) {
      // if the browser won't allow sound yet this never settles, so don't wait on it for long
      await Promise.race([ctx.resume().catch(() => {}), wait(250)]);
      if (!running() || this.state.playing || this.state.status !== "ready") return;
    }
    this.start(this.anchor.position);
    this.set({ playing: true });
  };

  pause = () => {
    if (!this.state.playing) return;
    const position = this.position();
    this.stop();
    this.anchor = { position, at: 0 };
    this.set({ playing: false });
    // the room rings out on its own, and once it has the sound hardware can sleep
    this.rest = window.setTimeout(() => {
      if (!this.state.playing) void this.ctx?.suspend();
    }, (ROOM_SECONDS + 1) * 1000);
  };

  toggle = () => (this.state.playing ? this.pause() : void this.play());

  /** Seconds into the song as recorded, right now. */
  position = (): number => {
    if (!this.state.playing || !this.ctx) return this.anchor.position;
    return positionAt(this.anchor, this.ctx.currentTime, this.state.speed, this.state.duration);
  };

  seek = (position: number) => {
    if (!this.song || this.state.status !== "ready") return;
    const to = wrap(position, this.state.duration);
    if (this.state.playing) {
      this.stop();
      this.start(to);
    } else {
      this.anchor = { position: to, at: 0 };
    }
  };

  /** Jump by some seconds of listening time, so a nudge feels the same at any speed. */
  nudge = (seconds: number) => this.seek(this.position() + seconds * this.state.speed);

  /** Change the speed, the reverb, or both. */
  tune = (change: Partial<Settings>) => {
    const next = cleanSettings({ speed: change.speed ?? this.state.speed, reverb: change.reverb ?? this.state.reverb });
    if (next.speed !== this.state.speed && this.state.playing && this.voice && this.ctx) {
      // note where we are at the old speed, then carry on from there at the new one
      const now = this.ctx.currentTime;
      this.anchor = { position: positionAt(this.anchor, now, this.state.speed, this.state.duration), at: now };
      this.voice.source.playbackRate.setValueAtTime(next.speed, now);
    }
    if (next.reverb !== this.state.reverb) this.chain?.reverb(next.reverb, true);
    if (next.speed !== this.state.speed || next.reverb !== this.state.reverb) this.set(next);
  };

  /** Make the file: the whole song as it sounds now, saved as an MP3. Says whether it worked. */
  save = async (): Promise<boolean> => {
    if (!this.song || this.state.saving !== null || this.state.status !== "ready") return false;
    const { title, speed, reverb } = this.state;
    const settings = { speed, reverb };
    this.set({ saving: 0 });
    try {
      const sound = await render(this.song, settings, (done) => this.set({ saving: done * 0.35 }));
      const { file, extension } = await encode(sound, (done) => this.set({ saving: 0.35 + done * 0.65 }));
      download(file, fileName(title, settings, extension), extension === "mp3" ? "audio/mpeg" : "audio/wav");
      this.set({ saving: null });
      return true;
    } catch {
      this.set({ saving: null });
      this.fail("couldn't save that");
      return false;
    }
  };

  private start(position: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.song;
    source.loop = true;
    source.playbackRate.value = this.state.speed;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE);
    source.connect(fade).connect(this.chain!.input);
    source.start(now, position);
    this.voice = { source, fade };
    this.anchor = { position, at: now };
  }

  private stop() {
    const voice = this.voice;
    if (!voice || !this.ctx) return;
    this.voice = null;
    const now = this.ctx.currentTime;
    voice.fade.gain.cancelScheduledValues(now);
    voice.fade.gain.setValueAtTime(voice.fade.gain.value, now);
    voice.fade.gain.linearRampToValueAtTime(0, now + FADE);
    voice.source.stop(now + FADE + 0.005);
    voice.source.onended = () => voice.fade.disconnect();
  }

  /** Stop for good, ahead of a new song. */
  private halt() {
    this.stop();
    this.anchor = { position: 0, at: 0 };
    if (this.state.playing) this.set({ playing: false });
  }
}

export const engine = new Engine();

// in development the engine is on the window, so it can be driven and measured from the console
if (import.meta.env.DEV) Object.assign(window, { sloverb: engine });
