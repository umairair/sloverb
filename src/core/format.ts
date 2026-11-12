/** Seconds as a clock: 0:07, 3:42, 1:02:05. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * A song's name from its file name, or from a video's title: no folder, no
 * extension, underscores as spaces, and none of what can't be seen but still
 * takes up room or throws the layout: spaces at either end, doubled spaces,
 * tabs and line breaks, no-break and other odd-width spaces, zero-width and
 * direction marks, control characters. Dashes left hanging at either end go
 * too. Accents typed as two characters are joined into one, so the same name
 * is always the same letters. A slash inside a name is kept (a video can be
 * called "AC/DC"), only a real path in front is dropped. Nothing left is
 * `untitled`.
 */
export function titleFrom(fileName: string): string {
  const name = fileName
    .normalize("NFC")
    // can't be seen: controls, soft hyphens, zero-width and direction marks, byte order marks
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁩﻿]/g, "")
    // a folder in front: anything up to the last backslash, or a path that starts at the root, home or here
    .replace(/^.*\\/, "")
    .replace(/^(?:~|\.{1,2})?\/.*\//, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // a dash left hanging at either end, as in " - song" or "song -", unless dashes are all there is
  const bare = name.replace(/^[\s\-–—|]+/, "").replace(/[\s\-–—|]+$/, "");
  return bare || name || "untitled";
}

/** Speed the way it reads on the slider: 0.80×. */
export function speedText(speed: number): string {
  return `${speed.toFixed(2)}×`;
}

export function percentText(amount: number): string {
  return `${Math.round(amount * 100)}%`;
}
