import { describe as group, expect, it } from "vitest";
import { clock, percentText, speedText, titleFrom } from "./format";
import { impulse, ROOM_SECONDS } from "./impulse";
import { GLOWS, glowText, LOOK, readLook, THEMES } from "./look";
import { bars, envelope } from "./peaks";
import { CEILING, cleanSettings, describe, dryGain, fileName, hold, KNEE, isDefault, MAX_SPEED, MIN_SPEED, DEFAULTS, sliderToSpeed, speedToSlider, wetGain } from "./settings";

const SLOWED = { speed: 0.8, reverb: 0.4 };
const ORIGINAL = { speed: 1, reverb: 0 };
const NIGHTCORE = { speed: 1.25, reverb: 0 };
import { positionAt, wrap } from "./transport";
import { encodeWav } from "./wav";

const energy = (x: Float32Array, from = 0, to = x.length) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return sum;
};

group("settings", () => {
  it("puts as recorded in the middle of the speed slider, with the ends an octave either way", () => {
    expect(speedToSlider(1)).toBeCloseTo(0.5);
    expect(speedToSlider(MIN_SPEED)).toBe(0);
    expect(speedToSlider(MAX_SPEED)).toBe(1);
    expect(sliderToSpeed(0)).toBe(0.5);
    expect(sliderToSpeed(1)).toBe(2);
  });

  it("goes there and back", () => {
    for (const speed of [0.5, 0.63, 0.8, 1, 1.25, 1.5, 2]) expect(sliderToSpeed(speedToSlider(speed))).toBeCloseTo(speed, 2);
  });

  it("holds on to 1 when the slider passes close by", () => {
    expect(sliderToSpeed(0.495)).toBe(1);
    expect(sliderToSpeed(0.508)).toBe(1);
    expect(sliderToSpeed(0.47)).toBeLessThan(1);
    expect(sliderToSpeed(0.53)).toBeGreaterThan(1);
  });

  it("keeps settings inside what the engine can play", () => {
    expect(cleanSettings({ speed: 9, reverb: -1 })).toEqual({ speed: 2, reverb: 0 });
    expect(cleanSettings({ speed: NaN, reverb: NaN })).toEqual({ speed: 1, reverb: 0 });
  });

  it("adds no reverb at zero and only ever more, against the song, as the slider rises", () => {
    expect(wetGain(0)).toBe(0);
    expect(dryGain(0)).toBe(1);
    for (let r = 0.05; r <= 1.001; r += 0.05) {
      expect(wetGain(r) / dryGain(r)).toBeGreaterThan(wetGain(r - 0.05) / dryGain(r - 0.05));
      expect(dryGain(r)).toBeLessThan(dryGain(r - 0.05));
    }
  });

  it("never gets louder overall as the reverb comes up", () => {
    // the room hands back about as much as it is given, so the two add as powers
    const loud = (r: number) => Math.hypot(dryGain(r), wetGain(r));
    for (let r = 0; r <= 1.001; r += 0.05) expect(loud(r)).toBeLessThanOrEqual(1.0001);
  });

  it("leaves a song alone under the ceiling and holds everything else beneath it", () => {
    for (const x of [0, 0.1, -0.5, KNEE, -KNEE]) expect(hold(x)).toBe(x);
    let last = KNEE;
    for (let x = KNEE + 0.01; x < 8; x += 0.01) {
      const y = hold(x);
      expect(y).toBeGreaterThanOrEqual(last);
      expect(y).toBeLessThanOrEqual(CEILING);
      expect(hold(-x)).toBe(-y);
      last = y;
    }
    // no corner where it starts to bend
    expect(hold(KNEE + 1e-4) - KNEE).toBeCloseTo(1e-4, 6);
  });

  it("knows when the sliders are back where they started", () => {
    expect(isDefault(DEFAULTS)).toBe(true);
    expect(DEFAULTS).toEqual({ speed: 1, reverb: 0 });
    expect(isDefault({ speed: 1, reverb: 0.004 })).toBe(true);
    expect(isDefault({ speed: 1, reverb: 0.4 })).toBe(false);
    expect(isDefault({ speed: 0.8, reverb: 0 })).toBe(false);
  });

  it("names what was done", () => {
    expect(describe(SLOWED)).toBe("slowed + reverb");
    expect(describe(ORIGINAL)).toBe("");
    expect(describe(NIGHTCORE)).toBe("nightcore");
    expect(describe({ speed: 1.25, reverb: 0.3 })).toBe("sped up + reverb");
    expect(describe({ speed: 1.08, reverb: 0 })).toBe("sped up");
    expect(describe({ speed: 0.7, reverb: 0 })).toBe("slowed");
    expect(describe({ speed: 1, reverb: 0.5 })).toBe("reverb");
  });

  it("names the file after the song and what was done to it", () => {
    expect(fileName("espresso", SLOWED, "mp3")).toBe("espresso (slowed + reverb).mp3");
    expect(fileName("espresso", ORIGINAL, "wav")).toBe("espresso.wav");
    expect(fileName('a/b: "c"?', NIGHTCORE, "mp3")).toBe("a b c (nightcore).mp3");
    expect(fileName("  ", ORIGINAL, "mp3")).toBe("sloverb.mp3");
  });
});

group("format", () => {
  it("writes seconds as a clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(7.9)).toBe("0:07");
    expect(clock(222)).toBe("3:42");
    expect(clock(3725)).toBe("1:02:05");
    expect(clock(NaN)).toBe("0:00");
    expect(clock(-3)).toBe("0:00");
  });

  it("makes a title out of a file name", () => {
    expect(titleFrom("espresso.mp3")).toBe("espresso");
    expect(titleFrom("All_The_Stars__final.m4a")).toBe("All The Stars final");
    expect(titleFrom("C:\\music\\song.name.flac")).toBe("song.name");
    expect(titleFrom(".mp3")).toBe("untitled");
    expect(titleFrom("no extension")).toBe("no extension");
    // spaces of every kind at the ends and doubled in the middle, tabs and line breaks
    expect(titleFrom("   lost  in\tthe \n rain  .mp3")).toBe("lost in the rain");
    expect(titleFrom("  night drive　.wav")).toBe("night drive");
    expect(titleFrom("__intro__.mp3")).toBe("intro");
    // things that can't be seen: zero-width and direction marks, soft hyphens, controls, a byte order mark
    expect(titleFrom("﻿​sun­set‏‮\u0007.mp3")).toBe("sunset");
    // a dash left hanging at either end goes, one in the middle stays, and dashes alone are a name
    expect(titleFrom(" - artist - song - .mp3")).toBe("artist - song");
    expect(titleFrom("song —.mp3")).toBe("song");
    expect(titleFrom("-.mp3")).toBe("-");
    // a slash in a name is not a folder, a real path in front is
    expect(titleFrom("AC/DC - Thunderstruck.mp3")).toBe("AC/DC - Thunderstruck");
    expect(titleFrom("/Users/me/Music/song.mp3")).toBe("song");
    expect(titleFrom("~/Music/song.mp3")).toBe("song");
    // accents typed as two characters are one letter
    expect(titleFrom("café.mp3")).toBe("café");
    expect(titleFrom("   ")).toBe("untitled");
    expect(titleFrom("")).toBe("untitled");
  });

  it("writes the slider values", () => {
    expect(speedText(0.8)).toBe("0.80×");
    expect(percentText(0.404)).toBe("40%");
  });
});

group("transport", () => {
  it("runs at the speed of the song, not the clock", () => {
    expect(positionAt({ position: 10, at: 100 }, 105, 0.8, 200)).toBeCloseTo(14);
    expect(positionAt({ position: 10, at: 100 }, 105, 1.25, 200)).toBeCloseTo(16.25);
  });

  it("comes back round at the end", () => {
    expect(positionAt({ position: 190, at: 0 }, 20, 1, 200)).toBeCloseTo(10);
    expect(wrap(-5, 200)).toBe(195);
    expect(wrap(5, 0)).toBe(0);
  });

  it("never runs backwards if the clock is read early", () => {
    expect(positionAt({ position: 10, at: 100 }, 99.9, 1, 200)).toBe(10);
  });
});

group("peaks", () => {
  it("draws loud parts tall and silence flat", () => {
    const x = new Float32Array(8000);
    for (let i = 4000; i < 8000; i++) x[i] = Math.sin(i / 3);
    const env = envelope([x], 8);
    expect([...env.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    for (const v of env.slice(4)) expect(v).toBeGreaterThan(0.9);
    expect(Math.max(...env)).toBeCloseTo(1);
  });

  it("copes with nothing at all", () => {
    expect(envelope([], 4)).toEqual(new Float32Array(4));
    expect(envelope([new Float32Array(100)], 4)).toEqual(new Float32Array(4));
    expect(bars(new Float32Array(0), 3)).toEqual(new Float32Array(3));
  });

  it("keeps the tallest slice when squeezing into fewer bars, and stretches into more", () => {
    const env = Float32Array.from([0.1, 0.9, 0.2, 0.3, 0.4, 0.5]);
    expect([...bars(env, 3)].map((v) => +v.toFixed(2))).toEqual([0.9, 0.3, 0.5]);
    expect(bars(env, 12)).toHaveLength(12);
    expect(bars(env, 12)[2]).toBeCloseTo(0.9);
  });
});

group("the room", () => {
  const room = impulse(44100);

  it("lasts as long as it says and answers with an energy of one", () => {
    expect(room.left).toHaveLength(Math.round(ROOM_SECONDS * 44100));
    expect((energy(room.left) + energy(room.right)) / 2).toBeCloseTo(1, 5);
  });

  it("is the same room every time, and at every sample rate", () => {
    expect(impulse(44100).left).toEqual(room.left);
    const other = impulse(48000);
    expect((energy(other.left) + energy(other.right)) / 2).toBeCloseTo(1, 5);
    expect(other.left).toHaveLength(Math.round(ROOM_SECONDS * 48000));
  });

  it("waits a moment, dies away, and ends on silence", () => {
    expect(energy(room.left, 0, 700)).toBe(0);
    const second = (s: number) => energy(room.left, s * 44100, (s + 1) * 44100);
    expect(second(0)).toBeGreaterThan(second(1) * 2);
    expect(second(1)).toBeGreaterThan(second(2) * 2);
    expect(second(2)).toBeGreaterThan(second(3) * 2);
    expect(Math.abs(room.left[room.left.length - 1])).toBeLessThan(1e-6);
  });

  it("gives each ear a different answer", () => {
    let dot = 0;
    for (let i = 0; i < room.left.length; i++) dot += room.left[i] * room.right[i];
    expect(Math.abs(dot)).toBeLessThan(0.05);
  });

  it("has no low end to turn the bass to mud", () => {
    // feed it a 60 Hz hum and a 1 kHz tone, and compare what comes back
    const through = (hz: number) => {
      let re = 0;
      let im = 0;
      for (let i = 0; i < room.left.length; i++) {
        const a = (2 * Math.PI * hz * i) / 44100;
        re += room.left[i] * Math.cos(a);
        im += room.left[i] * Math.sin(a);
      }
      return Math.hypot(re, im);
    };
    const mean = (hz: number[]) => hz.map(through).reduce((a, b) => a + b) / hz.length;
    expect(mean([50, 55, 60, 65, 70])).toBeLessThan(mean([900, 950, 1000, 1050, 1100]) * 0.25);
  });
});

group("wav", () => {
  it("writes a header a player will accept, then the samples", () => {
    const left = Float32Array.from([0, 0.5, -0.5, 1, -1]);
    const right = Float32Array.from([0, 0, 0, 2, -2]);
    const bytes = encodeWav([left, right], 44100);
    const view = new DataView(bytes.buffer);
    const tag = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(tag(36)).toBe("data");
    expect(bytes).toHaveLength(44 + 5 * 2 * 2);
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(20);
    // half scale, give or take the dither
    expect(Math.abs(view.getInt16(44 + 4, true) - 16384)).toBeLessThanOrEqual(2);
    // too loud is held at full scale rather than wrapping round
    expect(view.getInt16(44 + 14, true)).toBe(32767);
    expect(view.getInt16(44 + 18, true)).toBe(-32768);
  });
});

group("look", () => {
  it("starts dark with the first glow and all of it, whatever was or wasn't kept", () => {
    for (const kept of [null, undefined, "", "not json", "null", "7", "[]", '{"theme":"neon","glow":"lots","amount":"lots"}']) expect(readLook(kept)).toEqual(LOOK);
    expect(LOOK).toEqual({ theme: "dark", glow: "classic", amount: 1 });
    expect(THEMES).toEqual(["dark", "light"]);
  });

  it("keeps a theme and a glow it knows, and an amount from off to all of it", () => {
    for (const theme of THEMES)
      for (const glow of GLOWS) expect(readLook(JSON.stringify({ theme, glow, amount: 0.4 }))).toEqual({ theme, glow, amount: 0.4 });
    expect(readLook('{"theme":"light","amount":0}').amount).toBe(0);
    expect(readLook('{"amount":3}').amount).toBe(1);
    expect(readLook('{"amount":-1}').amount).toBe(0);
    expect(readLook('{"glow":"ocean"}')).toEqual({ theme: "dark", glow: "ocean", amount: 1 });
    expect(readLook('{"theme":"light","glow":"toString"}')).toEqual({ theme: "light", glow: "classic", amount: 1 });
  });

  it("reads what was kept when the colours came with the theme and glow was the amount", () => {
    expect(readLook('{"theme":"default","glow":0.5}')).toEqual({ theme: "dark", glow: "classic", amount: 0.5 });
    expect(readLook('{"theme":"dark","glow":0.5}')).toEqual({ theme: "dark", glow: "classic", amount: 0.5 });
    expect(readLook('{"theme":"light","glow":0}')).toEqual({ theme: "light", glow: "classic", amount: 0 });
    expect(readLook('{"theme":"minimal","glow":1}')).toEqual({ theme: "dark", glow: "mono", amount: 1 });
    for (const theme of ["ember", "ocean", "forest"]) expect(readLook(JSON.stringify({ theme, glow: 0.25 }))).toEqual({ theme: "dark", glow: theme, amount: 0.25 });
    expect(readLook('{"theme":"ocean"}')).toEqual({ theme: "dark", glow: "ocean", amount: 1 });
  });

  it("writes the glow as a percentage, or off", () => {
    expect(glowText(1)).toBe("100%");
    expect(glowText(0.4)).toBe("40%");
    expect(glowText(0)).toBe("off");
    expect(glowText(0.004)).toBe("off");
  });
});
