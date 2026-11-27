/** A single public video. Strip playlists, timestamps and tracking parameters. */
export function youtubeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    const hosts = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"];
    if (!hosts.includes(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) throw new Error();
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    const id = url.hostname.endsWith("youtu.be") && parts.length === 1
      ? parts[0]
      : url.pathname === "/watch"
        ? url.searchParams.get("v")
        : parts.length === 2 && ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : null;
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) throw new Error();
    return `https://www.youtube.com/watch?v=${id}`;
  } catch {
    throw new Error("enter a youtube video link");
  }
}

/**
 * Each step of an import, in order: where it starts on the bar, how much of the bar it has, and how many seconds it
 * usually takes. `finding` is the PC looking the video up, which the relay calls `opening`; `opening` here is the
 * browser decoding the MP3 at the very end. Until 2026-11-27 the two were one word, so the bar jumped to 97% the
 * moment the PC picked the job up and sat there for the rest of it. The shares follow how long each step takes,
 * not how many steps there are, and `converting` covers the PC sending the MP3 to the relay as well.
 */
const STEPS: Record<string, [start: number, share: number, seconds: number]> = {
  starting: [0, 0.04, 1],
  queued: [0.04, 0.04, 3],
  finding: [0.08, 0.17, 4],
  downloading: [0.25, 0.3, 5],
  converting: [0.55, 0.3, 8],
  receiving: [0.85, 0.1, 2],
  opening: [0.95, 0.04, 1],
};

/** The one word on the bar for each step (chosen with Umair on 2026-11-27). */
const WORDS: Record<string, string> = {
  starting: "connecting", queued: "connecting", finding: "finding", downloading: "downloading",
  converting: "converting", receiving: "loading", opening: "loading",
};

export function importWord(status: string): string {
  return WORDS[status] ?? "connecting";
}

/**
 * How far along an import is, 0 to 1, as one number for one bar. The relay only knows how much of the download is
 * done. Every other step creeps on through its share for as long as it lasts, quickly at first and ever more slowly,
 * so the bar is never still and never reaches the end of a step that hasn't finished.
 */
export function importProgress(status: string, progress: number | null, seconds = 0): number {
  const step = STEPS[status];
  if (!step) return 0;
  const [start, share, usual] = step;
  const part = progress === null || !Number.isFinite(progress)
    ? 1 - Math.exp(-Math.max(0, seconds) / usual)
    : Math.min(1, Math.max(0, progress));
  return start + share * Math.min(0.97, part);
}
