/**
 * Where in the song we are. The audio clock only ever counts up, so the
 * position is an anchor (this place in the song, at this moment on the clock)
 * plus however far the song has run since, at the current speed.
 */
export interface Anchor {
  /** seconds into the song as recorded */
  position: number;
  /** the audio clock when that was true */
  at: number;
}

/** Fold a position back into the song, which loops. */
export function wrap(position: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return ((position % duration) + duration) % duration;
}

export function positionAt(anchor: Anchor, now: number, speed: number, duration: number): number {
  return wrap(anchor.position + Math.max(0, now - anchor.at) * speed, duration);
}
