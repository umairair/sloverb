/**
 * How sloverb looks, which is the only thing a listener can set: a dark page
 * or a light one, which glow lights it, and how much that glow moves with the
 * music. No browser in here, so it is tested in node. The colours and the
 * shape of each glow are in `styles.css`.
 */

/** The page itself. `dark` is how sloverb looked until 2026-11-14, pitch black; it was called `default` for two days. */
export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * The glows, in the order they are offered. Each is three colours and its own
 * way of moving behind the page, and the same three colour the waveform, the
 * sliders and the import bar.
 * `classic` is the blue, purple and pink of the first sloverb.
 */
export const GLOWS = ["classic", "vapor", "sunset", "ember", "aurora", "ocean", "forest", "rose", "mono"] as const;
export type Glow = (typeof GLOWS)[number];

export interface Look {
  theme: Theme;
  glow: Glow;
  /** How much the glow moves with the music: 1 is all of it, 0 is off. */
  amount: number;
}

/**
 * What a first visit gets, and anyone who has never chosen: a black page in
 * rose's colours, with the glow effect at 78%, so the light behind the page
 * comes up with the first song. Umair's choice on 2026-11-27 (D34, D37);
 * from 2026-11-14 it was `light` with `rose`, and before that `dark` with
 * `classic`. The `<html>` tag in `index.html` says the same before anything
 * is drawn, and `public/og-2.jpg` is drawn in its colours
 * (`scripts/make-images.mjs`).
 */
export const LOOK: Look = { theme: "dark", glow: "rose", amount: 0.78 };

/**
 * Until 2026-11-14 there were six themes and no glows, and the colours came
 * with the theme. These are every name a theme has had. All but `light` were
 * dark pages, and a device that kept one of them chose it while dark was what
 * everyone got, so it stays dark whatever a first visit gets.
 */
const NAMED = ["default", "dark", "light", "minimal", "ember", "ocean", "forest"];
/** And the glow each of them was: its own colours where it had them, otherwise the blue, purple and pink that came with the page. */
const was = (theme: unknown): Glow => (theme === "minimal" ? "mono" : theme === "ember" || theme === "ocean" || theme === "forest" ? theme : "classic");

const within = (n: number) => Math.min(1, Math.max(0, n));

/** What was kept from last time, whatever state it is in: anything missing or odd falls back to how a first visit looks. */
export function readLook(saved: string | null | undefined): Look {
  let from: unknown = null;
  try {
    from = JSON.parse(saved ?? "");
  } catch {
    // nothing kept, or not something we wrote
  }
  const { theme, glow, amount } = (from && typeof from === "object" ? from : {}) as Record<string, unknown>;
  // before the glows had names, `glow` was the amount
  const much = typeof amount === "number" ? amount : glow;
  return {
    theme: theme === "light" ? "light" : NAMED.includes(theme as string) ? "dark" : LOOK.theme,
    // a theme kept without a glow's name was kept before glows had names
    glow: GLOWS.includes(glow as Glow) ? (glow as Glow) : NAMED.includes(theme as string) ? was(theme) : LOOK.glow,
    amount: typeof much === "number" && Number.isFinite(much) ? within(much) : LOOK.amount,
  };
}

/** A colour written as `#rgb` or `#rrggbb`, as its three numbers. Anything else is not read. */
function numbers(colour: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim())?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16)) as [number, number, number];
}

/** One colour moved part of the way to another, 0 for not at all and 1 for all the way. A colour it can't read is given back as it came. */
export function toward(from: string, to: string, much: number): string {
  const a = numbers(from);
  const b = numbers(to);
  if (!a || !b) return from;
  const t = within(much);
  return `#${a.map((n, i) => Math.round(n + (b[i] - n) * t).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * How far the ends of the waveform lean from the glow's middle colour towards
 * its first and its last. Umair asked on 2026-11-27 for the gradient there to
 * be barely there (D40); until then the three colours ran across it in full.
 */
export const HINT = 0.14;

/** The three colours the played part of the waveform runs through, left to right: the middle one, hardly changing. */
export function waveColours(c1: string, c2: string, c3: string): [string, string, string] {
  return [toward(c2, c1, HINT), c2, toward(c2, c3, HINT)];
}

/** How the amount is written on its slider: a percentage, or `off`. */
export function glowText(amount: number): string {
  const percent = Math.round(amount * 100);
  return percent > 0 ? `${percent}%` : "off";
}
