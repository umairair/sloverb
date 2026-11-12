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
 * How far along an import is, 0 to 1, as one number for one bar. The relay
 * only knows how much of the download is done; the steps either side of it
 * each get a share, so the bar is always a little further on than it was.
 */
export function importProgress(status: string, progress: number | null): number {
  const part = Math.min(1, Math.max(0, progress ?? 0));
  switch (status) {
    case "starting":
      return 0.04;
    case "queued":
      return 0.08;
    case "downloading":
      return 0.12 + part * 0.6;
    case "converting":
      return 0.8;
    case "receiving":
      return 0.9;
    case "opening":
      return 0.97;
    default:
      return 0;
  }
}

