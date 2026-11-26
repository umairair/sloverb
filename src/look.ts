import { useSyncExternalStore } from "react";
import { LOOK, readLook, type Look } from "./core/look";

/**
 * The look someone chose on `themes`, kept on their device between visits.
 * The theme and the glow are two attributes on the page, `data-theme` and
 * `data-glow`, and every colour follows from them in `styles.css`. They are
 * set once when one is picked, never per frame. `index.html` has the default
 * two on its `<html>` tag and a script that puts the kept ones over them
 * before anything is drawn, so a light page doesn't open with a flash of
 * black.
 */

/** The same name is read by the script in `index.html`. */
const KEY = "sloverb.look";

function kept(): Look {
  try {
    return readLook(localStorage.getItem(KEY));
  } catch {
    // private windows and blocked storage: the look just isn't remembered
    return LOOK;
  }
}

let look = kept();
const listeners = new Set<() => void>();

/** The colours the waveform is drawn in. A canvas can't use the page's variables, so they are read from it. */
export interface Paint {
  /** behind the playhead, left to right */
  colours: [string, string, string];
  ahead: string;
  head: string;
}
let paint: Paint | null = null;

function wear() {
  const page = document.documentElement;
  page.dataset.theme = look.theme;
  page.dataset.glow = look.glow;
  // the glow effect at `off` holds still everything that moves on its own, the lights' drift and the wordmark's
  // colours, so there is always a way to stop the page moving that doesn't depend on the device's own setting
  page.toggleAttribute("data-still", look.amount === 0);
  paint = null;
  // the browser's own bars on a phone follow the page
  const bg = getComputedStyle(page).getPropertyValue("--bg").trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", look.theme === "light" ? "light" : "dark");
}
wear();

export const looks = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  snapshot: () => look,
  set(change: Partial<Look>) {
    const next = readLook(JSON.stringify({ ...look, ...change }));
    if (next.theme === look.theme && next.glow === look.glow && next.amount === look.amount) return;
    const dressed = next.theme !== look.theme || next.glow !== look.glow || (next.amount === 0) !== (look.amount === 0);
    look = next;
    if (dressed) wear();
    try {
      localStorage.setItem(KEY, JSON.stringify(look));
    } catch {
      // see `kept`
    }
    for (const listener of listeners) listener();
  },
  /** `themes` is open: with no song playing the light breathes there anyway, so the slider and the glows have something to show. */
  showing: false,
  paint(): Paint {
    if (paint) return paint;
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, or: string) => style.getPropertyValue(name).trim() || or;
    // high contrast on Windows: the page is drawn in the system's own few colours, and the waveform follows it
    const forced = window.matchMedia("(forced-colors: active)").matches;
    const drawn: Paint = forced ? { colours: ["Highlight", "Highlight", "Highlight"], ahead: "GrayText", head: "CanvasText" } : {
      colours: [read("--c1", "#4f8cff"), read("--c2", "#a855f7"), read("--c3", "#ff4d8d")],
      ahead: `rgb(${read("--fg-rgb", "255 255 255")} / 0.2)`,
      head: read("--text", "#fff"),
    };
    // not kept until the stylesheet has arrived
    if (style.getPropertyValue("--c1").trim()) paint = drawn;
    return drawn;
  },
};

export function useLook() {
  return useSyncExternalStore(looks.subscribe, looks.snapshot);
}
