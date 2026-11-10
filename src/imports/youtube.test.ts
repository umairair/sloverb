import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { youtubeUrl } from "../core/youtube";
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
