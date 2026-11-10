import { titleFrom } from "../core/format";
import { ROOM_SECONDS } from "../core/impulse";
import { envelope } from "../core/peaks";
import { cleanSettings, fileName, PRESETS, type Settings } from "../core/settings";
import { positionAt, wrap, type Anchor } from "../core/transport";
import { chain, type Chain } from "./chain";
import { download, encode, render } from "./save";

/**
 * The player. A list of songs, one of them playing through the chain.
 * Everything the screen needs to know is in `State`; where the song is right
 * now changes sixty times a second, so that is asked for with `position()`.
 *
 * Songs come in through `add` as files. Anything that can get hold of a song
 * (a link, a recording) only has to call that.
 *
 * Only the song that is playing is held decoded, which is tens of megabytes.
 * The rest wait as the files they came in as, and are decoded when their turn
 * comes, so a long list costs a phone nothing.
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
  /** how many songs are loaded, and which of them this is, counting from 0 */
  count: number;
  index: number;
}

interface Track {
  file: Blob;
  title: string;
}

/** Long enough that starting and stopping never click, short enough not to notice. */
const FADE = 0.02;
/** Further in than this, going back means the start of this song; before it, the song before. */
const RESTART_AFTER = 3;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

class Engine {
  private state: State = { status: "empty", error: null, title: "", duration: 0, playing: false, saving: null, count: 0, index: 0, ...PRESETS.slowed };
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private chain: Chain | null = null;
  private meter: AnalyserNode | null = null;
  private heard = new Float32Array(1024);
  private tracks: Track[] = [];
  private track: Track | null = null;
  /** the song being opened, if one is: where next and previous count from, so pressing twice goes two along */
  private aim: Track | null = null;
  private song: AudioBuffer | null = null;
  private voice: { source: AudioBufferSourceNode; fade: GainNode } | null = null;
  private anchor: Anchor = { position: 0, at: 0 };
  /** the newest load wins if two overlap */
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
      this.meter = ctx.createAnalyser();
      this.meter.fftSize = this.heard.length;
      this.chain.output.connect(this.meter);
    }
    return this.ctx;
  }

  /** Browsers only let sound start from a click or a key press. Call this from one, before anything slow. */
  wake = () => {
    const ctx = this.context();
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
  };

  /**
   * Add songs to the list and play the first of them. Anything the browser
   * can decode: mp3, m4a, wav, flac, ogg, the sound of a video.
   */
  add = async (files: readonly { file: Blob; name: string }[]) => {
    const fresh = files.map(({ file, name }) => ({ file, title: titleFrom(name) }));
    if (!fresh.length) return;
    this.tracks.push(...fresh);
    this.list();
    // the first of them that turns out to be a song; the ones that aren't drop out as they are found
    for (const track of fresh) if (await this.load(track)) break;
  };

  /** Stop, forget every song, and go back to having nothing open. */
  clear = () => {
    this.ticket++;
    this.halt();
    clearTimeout(this.rest);
    this.rest = window.setTimeout(() => void (this.state.playing || this.ctx?.suspend()), (ROOM_SECONDS + 1) * 1000);
    this.tracks = [];
    this.track = this.aim = this.song = null;
    this.shape = new Float32Array(0);
    this.set({ status: "empty", error: null, title: "", duration: 0, count: 0, index: 0, saving: null });
  };

  /** On to the next song, round to the first after the last. */
  next = () => {
    if (this.tracks.length) void this.load(this.tracks[(this.state.index + 1) % this.tracks.length]);
  };

  /** Back to the start of this song, or to the song before if we are already at the start. */
  previous = () => {
    if (!this.tracks.length) return;
    if (this.tracks.length === 1 || (!this.aim && this.position() / this.state.speed > RESTART_AFTER)) return this.seek(0);
    void this.load(this.tracks[(this.state.index - 1 + this.tracks.length) % this.tracks.length]);
  };

  /** Keep what the screen knows about the list in step with it, and loop the song only when it is the only one. */
  private list() {
    const shown = this.aim ?? this.track;
    const index = shown ? this.tracks.indexOf(shown) : -1;
    this.set({ count: this.tracks.length, index: Math.max(0, index), title: shown?.title ?? "" });
    if (this.voice) this.voice.source.loop = this.tracks.length < 2;
  }

  /** Decode a song and put it on. False if it couldn't be read, in which case it leaves the list. */
  private async load(track: Track): Promise<boolean> {
    const ticket = ++this.ticket;
    // its name goes up at once; the song underneath carries on until this one is ready to take over
    this.aim = track;
    this.set({ status: "opening" });
    this.list();
    try {
      const song = await this.context().decodeAudioData(await track.file.arrayBuffer());
      if (ticket !== this.ticket) return true;
      this.halt();
      this.aim = null;
      this.track = track;
      this.song = song;
      this.shape = envelope(Array.from({ length: song.numberOfChannels }, (_, channel) => song.getChannelData(channel)));
      this.set({ status: "ready", duration: song.duration });
      this.list();
      this.announce();
      void this.play();
      return true;
    } catch {
      this.tracks = this.tracks.filter((other) => other !== track);
      if (ticket !== this.ticket) return true;
      this.aim = null;
      this.list();
      this.fail("can't read that file");
      return false;
    }
  }

  /** Tell the phone's lock screen and the keyboard's media keys what is playing and what they can do. */
  private announce() {
    if (!("mediaSession" in navigator)) return;
    const media = navigator.mediaSession;
    media.metadata = new MediaMetadata({ title: this.state.title, artist: "sloverb" });
    media.setActionHandler("play", () => void this.play());
    media.setActionHandler("pause", this.pause);
    media.setActionHandler("seekbackward", () => this.nudge(-10));
    media.setActionHandler("seekforward", () => this.nudge(10));
    media.setActionHandler("previoustrack", this.previous);
    media.setActionHandler("nexttrack", this.tracks.length > 1 ? this.next : null);
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

  /** How loud it is right now, 0 to 1 or so, for anything on screen that moves with the music. */
  level = (): number => {
    if (!this.meter || !this.state.playing) return 0;
    this.meter.getFloatTimeDomainData(this.heard);
    let sum = 0;
    for (let i = 0; i < this.heard.length; i++) sum += this.heard[i] * this.heard[i];
    return Math.min(1, Math.sqrt(sum / this.heard.length) * 2.4);
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
    // one song goes round and round; with more loaded it runs out and hands over to the next
    source.loop = this.tracks.length < 2;
    source.playbackRate.value = this.state.speed;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE);
    source.connect(fade).connect(this.chain!.input);
    source.onended = () => {
      if (this.voice?.source !== source) return;
      fade.disconnect();
      this.voice = null;
      this.anchor = { position: 0, at: 0 };
      this.set({ playing: false });
      this.next();
    };
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
