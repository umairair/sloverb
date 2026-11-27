import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importProgress, importWord, youtubeUrl } from "../core/youtube";
import { importYoutube } from "./youtube";

const id = "a".repeat(43);
const video = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const job = { id, status: "ready", title: "Me at the zoo", progress: 1, error: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => { vi.stubEnv("VITE_IMPORT_API_URL", "https://imports.example"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("youtube links", () => {
  it.each([video, "https://youtu.be/jNQXAC9IVRw?si=tracking", "https://music.youtube.com/watch?v=jNQXAC9IVRw&list=123", "https://youtube.com/shorts/jNQXAC9IVRw"])("normalizes %s", (url) => {
    expect(youtubeUrl(url)).toBe(video);
  });
  it.each(["https://youtube.com.evil.test/watch?v=jNQXAC9IVRw", "https://youtube.com@127.0.0.1/watch?v=jNQXAC9IVRw", "https://youtube.com/playlist?list=123", "file:///etc/passwd", "https://youtube.com/watch?v=bad"])("rejects %s", (url) => {
    expect(() => youtubeUrl(url)).toThrow("enter a youtube video link");
  });
});

it("polls then returns an MP3 for engine.add and deletes server audio", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn()
    .mockResolvedValueOnce(json({ status: "ok" }))
    .mockResolvedValueOnce(json({ ...job, status: "queued" }, 202))
    .mockResolvedValueOnce(json({ ...job, status: "opening", progress: null }))
    .mockResolvedValueOnce(json(job))
    .mockResolvedValueOnce(new Response("ID3audio", { headers: { "Content-Type": "audio/mpeg" } }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const update = vi.fn();
  const result = importYoutube(video, new AbortController().signal, update);
  await vi.runAllTimersAsync();
  const song = await result;
  expect(song.name).toBe("Me at the zoo.mp3");
  expect(song.file.type).toBe("audio/mpeg");
  expect(await song.file.text()).toBe("ID3audio");
  expect(update).toHaveBeenCalledWith({ status: "queued", progress: 1 });
  // the relay's `opening` is the PC looking the video up, not the browser's last step
  expect(update).toHaveBeenCalledWith({ status: "finding", progress: null });
  expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ status: "opening" }));
  expect(fetch.mock.calls.at(-1)).toMatchObject([`https://imports.example/v1/imports/${id}`, { method: "DELETE" }]);
});

it("shows extractor errors and cleans up failed jobs", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(json({ status: "ok" }))
    .mockResolvedValueOnce(json({ ...job, status: "failed", error: "that video isn't available" }, 202))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  await expect(importYoutube(video, new AbortController().signal, vi.fn())).rejects.toThrow("that video isn't available");
  expect(fetch.mock.calls.at(-1)?.[1].method).toBe("DELETE");
});

it("cancels a queued import and releases the server job", async () => {
  const controller = new AbortController();
  const fetch = vi.fn()
    .mockResolvedValueOnce(json({ status: "ok" }))
    .mockResolvedValueOnce(json({ ...job, status: "queued" }, 202))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  await expect(importYoutube(video, controller.signal, ({ status }) => {
    if (status === "queued") controller.abort();
  })).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch.mock.calls.at(-1)?.[1].method).toBe("DELETE");
});

it("rejects non-audio responses instead of sending an error page to the player", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(json({ status: "ok" }))
    .mockResolvedValueOnce(json(job, 202))
    .mockResolvedValueOnce(new Response("not audio", { headers: { "Content-Type": "text/html" } }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  await expect(importYoutube(video, new AbortController().signal, vi.fn())).rejects.toThrow("couldn't read that import");
});

it("says a blocker may be at fault when no request gets a response", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetch);
  const result = importYoutube(video, new AbortController().signal, () => {}).catch((error: Error) => error.message);
  await vi.runAllTimersAsync();
  expect(await result).toBe("an ad blocker may be stopping imports");
  expect(fetch).toHaveBeenCalledTimes(3);
});

describe("import progress", () => {
  const steps: [string, number | null][] = [["starting", null], ["queued", null], ["finding", null], ["downloading", null], ["downloading", 0.3], ["downloading", 0.99], ["converting", null], ["receiving", null], ["opening", null]];

  it("only ever moves forward through the steps of an import", () => {
    const along = steps.map(([status, progress]) => importProgress(status, progress));
    for (let i = 1; i < along.length; i++) expect(along[i]).toBeGreaterThan(along[i - 1]);
    expect(along[0]).toBe(0);
    expect(importProgress("opening", null, 60)).toBeLessThan(1);
  });

  it("creeps on through a step with nothing to report, and never past the next", () => {
    for (const [status] of steps) {
      const at = [0, 1, 3, 10, 60, 600].map((seconds) => importProgress(status, null, seconds));
      for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThanOrEqual(at[i - 1]);
      expect(at[2]).toBeGreaterThan(at[0]);
    }
    const order = ["starting", "queued", "finding", "downloading", "converting", "receiving", "opening"];
    for (let i = 1; i < order.length; i++) expect(importProgress(order[i - 1], null, 1e6)).toBeLessThan(importProgress(order[i], null, 0));
  });

  it("leaves most of the bar for after the PC has found the video", () => {
    expect(importProgress("finding", null, 1e6)).toBeLessThan(0.3);
  });

  it("holds odd reports inside the download's share", () => {
    expect(importProgress("downloading", 7)).toBeLessThan(importProgress("converting", null));
    expect(importProgress("downloading", -1)).toBeCloseTo(0.25);
    expect(importProgress("something new", null)).toBe(0);
  });

  it("says one word for each step", () => {
    expect(steps.map(([status]) => importWord(status))).toEqual(["connecting", "connecting", "finding", "downloading", "downloading", "downloading", "converting", "loading", "loading"]);
  });
});
