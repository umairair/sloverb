/**
 * How sloverb looks, which is the only thing a listener can set: a dark page
 * or a light one, which glow lights it, and how much that glow moves with the
 * music. No browser in here, so it is tested in node. The colours and the
 * shape of each glow are in `styles.css`.
 */

/** The page itself. `dark` is how sloverb has always looked; it was called `default` for two days. */
export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * The glows, in the order they are offered. Each is three colours and its own
 * way of moving behind the page, and the same three colour everything else
 * that is light: the wordmark, the waveform, the sliders, save.
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

/** What a first visit gets. */
export const LOOK: Look = { theme: "dark", glow: "classic", amount: 1 };

/**
 * Until 2026-11-14 there were six themes and no glows, and the colours came
 * with the theme. What those are now: all but `light` were dark pages.
 */
const was = (theme: unknown): Glow | null => (theme === "minimal" ? "mono" : theme === "ember" || theme === "ocean" || theme === "forest" ? theme : null);

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
    theme: theme === "light" ? "light" : LOOK.theme,
    glow: GLOWS.includes(glow as Glow) ? (glow as Glow) : (was(theme) ?? LOOK.glow),
    amount: typeof much === "number" && Number.isFinite(much) ? within(much) : LOOK.amount,
  };
}

/** How the amount is written on its slider: a percentage, or `off`. */
export function glowText(amount: number): string {
  const percent = Math.round(amount * 100);
  return percent > 0 ? `${percent}%` : "off";
}
