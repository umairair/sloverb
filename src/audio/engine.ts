import { part, type Heard } from "../core/dance";
import { titleFrom } from "../core/format";
import { ROOM_SECONDS } from "../core/impulse";
import { envelope } from "../core/peaks";
import { cleanSettings, DEFAULTS, fileName, type Settings } from "../core/settings";
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
 *
 * Each song keeps its own speed and reverb. The sliders change the song that
 * is playing and no other, a song that hasn't been touched is as it was
 * recorded, and coming back to one finds it the way it was left.
 */
export interface State extends Settings {
  status: "empty" | "opening" | "ready";
  /** what went wrong, said plainly, for a few seconds */
  error: string | null;
  /** something worth saying that isn't a problem, like a song joining the list, for a moment */
  note: string | null;
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
  /** how this song was left: the sliders go here when it comes on */
  settings: Settings;
}

/** Long enough that starting and stopping never click, short enough not to notice. */
const FADE = 0.02;
/** Further in than this, going back means the start of this song; before it, the song before. */
const RESTART_AFTER = 3;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

const SILENCE: Heard = { level: 0, low: 0, mid: 0, high: 0 };

class Engine {
  private state: State = { status: "empty", error: null, note: null, title: "", duration: 0, playing: false, saving: null, count: 0, index: 0, ...DEFAULTS };
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private chain: Chain | null = null;
  private meter: AnalyserNode | null = null;
  private heard = new Float32Array(1024);
  private spectrum = new Uint8Array(512);
  private heardAt = -Infinity;
  private loudness = 0;
  private parts: Heard = { level: 0, low: 0, mid: 0, high: 0 };
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
  private hush = 0;
  /** the frame of a reset that is still gliding the sliders home, if one is, and the song it is taking there */
  private glide = 0;
  private homing: Track | null = null;

  /** the song's loudness from start to end, for drawing */
  shape: Float32Array = new Float32Array(0);

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  snapshot = () => this.state;

  private set(change: Partial<State>) {
    this.state = { ...this.state, ...change };
    // only when it changes: this runs on every move of a slider, and telling the phone costs more than checking
    const shown = this.state.status !== "ready" ? "none" : this.state.playing ? "playing" : "paused";
    if ("mediaSession" in navigator && navigator.mediaSession.playbackState !== shown) navigator.mediaSession.playbackState = shown;
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
      // the spectrum is for the light's dancing, which needs to see a beat land: less of the analyser's own smoothing
      this.meter.smoothingTimeConstant = 0.35;
      // and a loud song must not fill the scale, or every beat in it reads the same: full
      this.meter.minDecibels = -85;
      this.meter.maxDecibels = -5;
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
   * Add songs to the end of the list. Anything the browser can decode: mp3,
   * m4a, wav, flac, ogg, the sound of a video. With nothing open the first of
   * them plays; with a song already open or opening they wait their turn and
   * whatever is playing carries on. A file that isn't a song is only found out
   * when its turn comes, and then drops out.
   */
  add = async (files: readonly { file: Blob; name: string }[]) => {
    const fresh = files.map(({ file, name }) => ({ file, title: titleFrom(name), settings: { ...DEFAULTS } }));
    if (!fresh.length) return;
    this.tracks.push(...fresh);
    this.list();
    if (this.track || this.aim) return this.say(fresh.length > 1 ? `${fresh.length} songs added` : "added");
    // the first song in the list that can be read; the ones that can't leave the list as they are found
    while (!this.track && !this.aim && this.tracks.length) if (await this.load(this.tracks[0])) break;
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
      // a reset still on its way home when the song changes is finished for the song it was for, not carried into this one
      cancelAnimationFrame(this.glide);
      if (this.homing) this.homing.settings = { ...DEFAULTS };
      this.homing = null;
      this.aim = null;
      this.track = track;
      this.song = song;
      this.shape = envelope(Array.from({ length: song.numberOfChannels }, (_, channel) => song.getChannelData(channel)));
      // the sliders go to where this song was left, before it starts, so it comes on at its own speed
      if (track.settings.reverb !== this.state.reverb) this.chain?.reverb(track.settings.reverb, true);
      this.set({ status: "ready", duration: song.duration, ...track.settings });
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

  /** Say something for a couple of seconds. */
  private say(note: string) {
    this.set({ note });
    clearTimeout(this.hush);
    this.hush = window.setTimeout(() => this.set({ note: null }), 2200);
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
    // straight from a tap the browser always lets sound start, so start at once and let the sound hardware catch up:
    // the song is scheduled on the audio clock, which waits for it. Waiting here instead held the button for up to a
    // quarter of a second after a pause
    const tapped = (navigator as { userActivation?: { isActive: boolean } }).userActivation?.isActive === true;
    if (!running() && tapped) void ctx.resume().catch(() => {});
    else if (!running()) {
      // not from a tap (a song that just finished opening): the browser may refuse, and then this never settles,
      // so don't wait on it for long
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

  /** Listen once a frame, however many things ask: the light and the waveform both do, and get the same answer. */
  private listen() {
    const now = performance.now();
    if (now - this.heardAt < 8) return;
    this.heardAt = now;
    const meter = this.meter!;
    meter.getFloatTimeDomainData(this.heard);
    let sum = 0;
    for (let i = 0; i < this.heard.length; i++) sum += this.heard[i] * this.heard[i];
    this.loudness = Math.min(1, Math.sqrt(sum / this.heard.length) * 2.4);
    meter.getByteFrequencyData(this.spectrum);
    const binHz = meter.context.sampleRate / meter.fftSize;
    this.parts = { level: this.loudness, low: part(this.spectrum, 35, 150, binHz), mid: part(this.spectrum, 300, 2000, binHz), high: part(this.spectrum, 4000, 12000, binHz) };
  }

  /** How loud it is right now, 0 to 1 or so, for anything on screen that moves with the music. */
  level = (): number => {
    if (!this.meter || !this.state.playing) return 0;
    this.listen();
    return this.loudness;
  };

  /** The same, with how much of it is low, in the middle and high, for the light's dancing (core/dance.ts). */
  hear = (): Heard => {
    if (!this.meter || !this.state.playing) return SILENCE;
    this.listen();
    return this.parts;
  };

  /**
   * How long what is playing now takes to leave the speaker, in seconds, where the browser says: next to nothing on a
   * laptop, a fifth of a second on wireless headphones. The light waits this long so it lands with the sound.
   */
  lag = (): number => {
    const ctx = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    const lag = (ctx?.outputLatency ?? 0) + (ctx?.baseLatency ?? 0);
    return Number.isFinite(lag) ? Math.min(0.5, Math.max(0, lag)) : 0;
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

  /** Change the speed, the reverb, or both. Taking hold of a slider stops a reset half way. */
  tune = (change: Partial<Settings>) => {
    cancelAnimationFrame(this.glide);
    this.homing = null;
    this.apply(change);
  };

  /**
   * Both sliders back to where they started, gliding there over half a
   * second rather than jumping, so the song can be heard turning back into
   * itself on the way.
   */
  reset = () => {
    cancelAnimationFrame(this.glide);
    const from = { speed: this.state.speed, reverb: this.state.reverb };
    const begun = performance.now();
    this.homing = this.track;
    const step = (now: number) => {
      const t = Math.min(1, (now - begun) / 520);
      const eased = 1 - (1 - t) ** 3;
      const at = (a: number, b: number) => Math.round((a + (b - a) * eased) * 100) / 100;
      this.apply({ speed: at(from.speed, DEFAULTS.speed), reverb: at(from.reverb, DEFAULTS.reverb) });
      if (t < 1) this.glide = requestAnimationFrame(step);
      else this.homing = null;
    };
    this.glide = requestAnimationFrame(step);
  };

  private apply(change: Partial<Settings>) {
    const next = cleanSettings({ speed: change.speed ?? this.state.speed, reverb: change.reverb ?? this.state.reverb });
    if (next.speed !== this.state.speed && this.state.playing && this.voice && this.ctx) {
      // note where we are at the old speed, then carry on from there at the new one
      const now = this.ctx.currentTime;
      this.anchor = { position: positionAt(this.anchor, now, this.state.speed, this.state.duration), at: now };
      this.voice.source.playbackRate.setValueAtTime(next.speed, now);
    }
    if (next.reverb !== this.state.reverb) this.chain?.reverb(next.reverb, true);
    if (next.speed === this.state.speed && next.reverb === this.state.reverb) return;
    // kept with the song that is playing, so it is found like this again after the others have had their turn
    if (this.track) this.track.settings = next;
    this.set(next);
  }

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
