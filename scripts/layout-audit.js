// Measures the layout, for checking that everything is still centred and evenly spaced after a change.
// Development only: nothing imports this, and it is not part of the build.
//
// With the dev server running, in the browser console:
//
//   await import("/scripts/layout-audit.js")
//   await audit.player()        // opens two test tones, so the player is on screen
//   audit.summary()             // the player: where the column is, the gap at each step down it, how far off the middle
//   await audit.others()        // the screen behind, info and theme: how far each is off the middle
//   audit.report({ save: ".save", bar: ".bar" })   // any elements, by selector
//
// Run it at each of the sizes in CLAUDE.md ("Layout"). `off` is how far an element's centre is from the centre of
// the screen, left to right, and should be 0 for anything meant to be in the middle. Top to bottom, the room above
// what is on screen should equal the room between it and the bottom line, and `centred on` should be the same number
// for every screen at one size: that is the line all of them share.

const round = (x) => Math.round(x * 10) / 10;

window.audit = {
  wait: (ms) => new Promise((done) => setTimeout(done, ms)),

  /** A song made of beeps, as a file the player will open. No real songs are kept in the repo. */
  tone(name, seconds = 20) {
    const rate = 22050;
    const n = rate * seconds;
    const buffer = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buffer);
    const write = (at, text) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    write(0, "RIFF");
    view.setUint32(4, 36 + n * 2, true);
    write(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const beat = Math.exp(-((t * 2) % 1) * 5) * (0.35 + 0.65 * Math.abs(Math.sin(t * 0.9)));
      view.setInt16(44 + i * 2, Math.round(32767 * 0.7 * beat * Math.sin(2 * Math.PI * (110 + 60 * Math.sin(t)) * t)), true);
    }
    return { file: new File([buffer], name, { type: "audio/wav" }), name };
  },

  box(selector) {
    const element = document.querySelector(selector);
    if (!element) return null;
    const b = element.getBoundingClientRect();
    return { l: round(b.left), r: round(b.right), t: round(b.top), b: round(b.bottom), w: round(b.width), h: round(b.height), off: round((b.left + b.right) / 2 - innerWidth / 2) };
  },

  line(b) {
    return b ? `x ${b.l}–${b.r} (w ${b.w}, off ${b.off})  y ${b.t}–${b.b} (h ${b.h})` : "not on screen";
  },

  screen() {
    return `${innerWidth}x${innerHeight}, page ${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`;
  },

  /** Where each of these is: `{ name: selector }`. */
  report(map) {
    return [this.screen(), ...Object.entries(map).map(([name, selector]) => `${name.padEnd(12)} ${this.line(this.box(selector))}`)].join("\n");
  },

  /** Put the player on screen, with two songs so the count shows, and both sliders moved so reset shows. */
  async player() {
    await window.sloverb.add([this.tone("midnight drive.wav"), this.tone("two.wav")]);
    await this.wait(900);
    window.sloverb.tune({ speed: 0.8, reverb: 0.45 });
    window.sloverb.seek(8);
    await this.wait(500);
  },

  /** The player in one line: the column, the room round it, how far off the middle it is, and the gap at each step down. */
  summary() {
    const b = (selector) => this.box(selector);
    const main = b(".player"), bar = b(".bar"), title = b(".title"), wave = b(".wave"), times = b(".times"), transport = b(".transport");
    const speed = b(".slide--speed"), reverb = b(".slide--bloom"), reset = b(".reset"), save = b(".save");
    return [
      this.screen(),
      `column ${main.l}–${main.r}`,
      `room above ${main.t}, room down to the bottom line ${round(bar.t - main.b)}, under it ${round(innerHeight - bar.b)}`,
      `centred on ${round((main.t + main.b) / 2)}`,
      `name →${round(wave.t - title.b)}→ wave ${wave.h} →${round(times.t - wave.b)}→ times →${round(transport.t - times.b)}→ transport ${transport.h} →${round(speed.t - transport.b)}→ speed ${speed.h} →${round(reverb.t - speed.b)}→ reverb ${reverb.h} →${round(save.t - reverb.b)}→ save ${save.h}`,
      `reset ${reset.w}x${reset.h}`,
    ].join(" | ");
  },

  /** Whatever is behind (start or player), then info, then theme: the line each is centred on, which should be the same. */
  async others() {
    const link = (word) => [...document.querySelectorAll(".bar .link")].find((b) => b.textContent.trim() === word);
    const middle = (top, bottom) => `centred on ${round((top + bottom) / 2)}`;
    const out = [this.screen()];
    const main = this.box(".screen > main:not([hidden])"), bar = this.box(".bar");
    out.push(`behind: ${middle(main.t, main.b)}, column ${main.l}–${main.r}, room above ${main.t}, room down to the bottom line ${round(bar.t - main.b)}`);
    // the word on the bottom line, the class of the page it opens (theme's is still `.themes`), and the first thing on that page
    for (const [word, page, first] of [["info", "info", ".info__lead"], ["theme", "themes", ".themes .slide"]]) {
      link(word).click();
      await this.wait(500);
      const top = this.box(first), back = this.box(".back button"), column = this.box(`.${page} article`), scroller = document.querySelector(`.${page}`);
      out.push(`${word}: ${middle(top.t, back.b)}, column ${column.l}–${column.r}, ${scroller.scrollHeight > scroller.clientHeight ? "scrolls" : "fits"}`);
      back && document.querySelector(".back button").click();
      await this.wait(700);
    }
    return out.join("\n");
  },
};
