import { youtubeUrl } from "../core/youtube";

export const youtubeEnabled = Boolean(import.meta.env.VITE_IMPORT_API_URL?.trim());

export type ImportStatus = "starting" | "queued" | "opening" | "downloading" | "converting" | "receiving";
export interface ImportProgress { status: ImportStatus; progress: number | null }
interface Job { id: string; status: ImportStatus | "ready" | "failed"; title: string; progress: number | null; error: string | null }

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function request<T>(url: string, signal: AbortSignal, options: RequestInit = {}, timeout = 15000, audio = false): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.throwIfAborted();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(typeof body?.detail === "string" ? body.detail : "couldn't reach imports, try again");
    }
    if (!audio) return await response.json();
    if (!response.headers.get("content-type")?.startsWith("audio/mpeg") || !response.body) throw new Error("couldn't read that import");
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 20 * 1024 * 1024) throw new Error("that video is too large");
        chunks.push(value.slice().buffer as ArrayBuffer);
      }
      if (!size) throw new Error("couldn't read that import");
      return new Blob(chunks, { type: "audio/mpeg" }) as T;
    } finally {
      await reader.cancel().catch(() => {});
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

/** MP3 bytes go straight into the existing engine, never through a Vercel function. */
export async function importYoutube(value: string, signal: AbortSignal, update: (state: ImportProgress) => void): Promise<{ file: Blob; name: string }> {
  const url = youtubeUrl(value);
  const base = import.meta.env.VITE_IMPORT_API_URL?.replace(/\/+$/, "");
  if (!base) throw new Error("link imports aren't available yet");
  let id: string | undefined;
  const deadline = Date.now() + 6 * 60_000;
  try {
    update({ status: "starting", progress: null });
    // A sleeping free instance can take about a minute to wake. Health requests
    // are safe to retry; job creation deliberately is not retried.
    let awake = false;
    // fetch rejects with a TypeError only when no response came back at all:
    // an ad blocker or no network. A sleeping server still answers.
    let blocked = true;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const health = await request<{ status: string }>(`${base}/healthz`, signal, {}, 10000);
        if (health.status === "ok") { awake = true; break; }
        blocked = false;
      } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof TypeError)) blocked = false;
        if (blocked && attempt === 2) break;
      }
      await delay(2000, signal);
    }
    if (!awake) throw new Error(blocked ? "couldn't reach imports, an ad blocker or the network may be stopping it" : "couldn't reach imports, try again");
    let job = await request<Job>(`${base}/v1/imports`, signal, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
    });
    if (!/^[a-zA-Z0-9_-]{32,64}$/.test(job.id)) throw new Error("couldn't start import");
    id = job.id;
    while (job.status !== "ready") {
      if (job.status === "failed") throw new Error(job.error || "couldn't import that video");
      if (Date.now() > deadline) throw new Error("import took too long, try again");
      update({ status: job.status, progress: job.progress });
      await delay(1000, signal);
      job = await request<Job>(`${base}/v1/imports/${id}`, signal);
    }
    update({ status: "receiving", progress: null });
    const file = await request<Blob>(`${base}/v1/imports/${id}/audio`, signal, {}, 60000, true);
    signal.throwIfAborted();
    return { file, name: `${job.title || "youtube"}.mp3` };
  } finally {
    if (id) {
      // Use a fresh signal: cancellation must also release the server's slot.
      const cleanup = new AbortController();
      const timer = setTimeout(() => cleanup.abort(), 5000);
      void fetch(`${base}/v1/imports/${id}`, { method: "DELETE", signal: cleanup.signal, keepalive: true }).catch(() => {}).finally(() => clearTimeout(timer));
    }
  }
}
