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
