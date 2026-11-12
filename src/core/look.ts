/**
 * How sloverb looks, which is the only thing a listener can set: the colours
 * it wears and how much the light moves with the music. No browser in here,
 * so it is tested in node. The colours of each theme are in `styles.css`.
 */

/** In the order they are offered. `dark` is how sloverb has always looked. */
export const THEMES = ["dark", "light", "minimal", "ember", "ocean", "forest"] as const;
export type Theme = (typeof THEMES)[number];

export interface Look {
  theme: Theme;
  /** How much the light moves with the music: 1 is all of it, 0 is off. */
  glow: number;
}

/** What a first visit gets. */
export const LOOK: Look = { theme: "dark", glow: 1 };

/** What was kept from last time, whatever state it is in: anything missing or odd falls back to how a first visit looks. */
export function readLook(saved: string | null | undefined): Look {
  let from: unknown = null;
  try {
    from = JSON.parse(saved ?? "");
  } catch {
    // nothing kept, or not something we wrote
  }
  const { theme, glow } = (from && typeof from === "object" ? from : {}) as Record<string, unknown>;
  return {
    theme: THEMES.includes(theme as Theme) ? (theme as Theme) : LOOK.theme,
    glow: typeof glow === "number" && Number.isFinite(glow) ? Math.min(1, Math.max(0, glow)) : LOOK.glow,
  };
}

/** How the glow is written on its slider: a percentage, or `off`. */
export function glowText(glow: number): string {
  const percent = Math.round(glow * 100);
  return percent > 0 ? `${percent}%` : "off";
}
