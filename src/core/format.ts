/** Seconds as a clock: 0:07, 3:42, 1:02:05. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** A song's name from its file name: no extension, no underscores, no doubled spaces. */
export function titleFrom(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]{2,5}$/i, "");
  return base.replace(/_+/g, " ").replace(/\s+/g, " ").trim() || "untitled";
}

/** Speed the way it reads on the slider: 0.80×. */
export function speedText(speed: number): string {
  return `${speed.toFixed(2)}×`;
}

export function percentText(amount: number): string {
  return `${Math.round(amount * 100)}%`;
}
