# sloverb

Slowed + reverb and nightcore for any song, in the browser. Open a file, drag two sliders, save an MP3. It's live at [sloverb.app](https://sloverb.app).

The first version launched in February 2025 and passed 10,000 uses. This is the November 2026 rewrite (see [History](#history)).

All the audio work happens on the listener's device with the Web Audio API, so a file you open is never uploaded. The one thing that needs a server is importing audio from a YouTube link, which goes through a small relay and a worker described [below](#youtube-imports).

The frontend is React 19, TypeScript and Vite, with Web Audio, a Web Worker and WebAssembly for encoding. The backend is FastAPI, yt-dlp and FFmpeg. The page itself only depends on React and an MP3 encoder at runtime.

## What it does

- Speed from 0.5× to 2×. Pitch follows speed, like a record on a turntable, which is what gives slowed and nightcore their sound. The slider is logarithmic, so equal distances are equal pitch intervals and 1× sits in the middle.
- Reverb from dry to drenched, using a hall generated in code.
- Export to 320 kbps MP3 that matches what was playing, rendered faster than real time.
- A queue where each song keeps its own speed and reverb.
- A background that moves with the loudness and the beat, with nine colour schemes and light and dark themes.
- Built for phones first: one column that fits without scrolling, lock-screen and media-key controls, and the back button closes pages. On a keyboard, space plays and pauses and the arrow keys seek by 10 seconds.

## How the audio works

```
song ─┬─ dry gain ───────────────┬─ ×¼ ─ WaveShaper ceiling ─ out
      └─ Convolver (room) ─ wet ─┘
```

`chain()` in `src/audio/chain.ts` builds this graph against any `BaseAudioContext`. The player runs it in a live `AudioContext`, and saving renders the whole song through the same function in an `OfflineAudioContext`, so the exported file is sample-for-sample what you heard, reverb tail included.

The reverb's impulse response is generated from seeded noise in `src/core/impulse.ts`: 4.6 seconds of stereo with an 18 ms pre-delay, an RT60 of 3.9 s, treble above 2.6 kHz that dies off faster, a high-pass at 230 Hz to keep the bass tight, and a different seed per ear for width. It is normalised to unit energy with the convolver's own normalisation turned off, so it sounds the same in every browser and at every sample rate, and nothing has to be downloaded for it.

A loud song plus its own reverb goes over full scale. The dry and wet gains trade off as the reverb rises and pull the mix down by up to 4.2 dB, then a `tanh` soft-clip in a `WaveShaper` bends anything above −1 dBFS toward a 0.97 ceiling. It has no attack or release, so it can't pump, and quieter samples pass through untouched.

The rendered audio is transferred to a Web Worker that encodes it with LAME compiled to WebAssembly (`wasm-media-encoders`) and reports progress. If the WebAssembly can't load, it falls back to WAV. The encoder is only fetched when someone saves.

Only the song that is playing is decoded into memory. The rest of the queue stays compressed until its turn, so a long queue doesn't run a phone out of memory. Playback position is tracked as an anchor plus elapsed time × speed (`src/core/transport.ts`), so changing speed doesn't need a seek.

### The background

An `AnalyserNode` measures overall level and three frequency bands each frame, and `src/core/dance.ts` turns those into a slow swell plus beat hits. A hit is detected from how fast a band is rising compared with the last ~200 ms, which keeps sidechained bass from firing false beats. The visuals are delayed by the device's reported output latency so they line up with what you hear. For photosensitivity, a hit never changes brightness, never lands in a single frame, and each band fires at most about three times a second; tests enforce all three, and `prefers-reduced-motion` turns the beat motion off.

## Performance

It should feel instant on a cheap phone. `scripts/check-speed.mjs` runs before the unit tests and in CI, and fails the build on transitions over 0.25 s, animations that trigger layout or paint, and `backdrop-filter`. Screen changes have no transitions, hashed assets are cached for a year, and the production bundle is about 82 kB of gzipped JavaScript. Lighthouse scores 100 for performance, accessibility, best practices and SEO ([docs/seo.md](docs/seo.md) covers the search and link-preview setup).

## YouTube imports

Pasting a YouTube link fetches its audio as an MP3 and adds it to the queue like a local file. Only import audio you have permission to use.

```
browser (sloverb.app, Vercel)
   │  POST /v1/imports, poll status, GET the MP3
   ▼
api.sloverb.app  ── FastAPI relay on Render: in-memory jobs, 10-minute TTL, no database or disk
   ▲
   │  outbound, Ed25519-signed HTTPS only: claim a job, report progress, upload the MP3
   │
worker on an always-on home machine: yt-dlp + FFmpeg
```

YouTube rejects downloads from cloud provider IP ranges (tested from two Render regions, with and without proof-of-origin tokens), so the download runs on a home connection. The worker only makes outbound requests and opens no ports.

The relay holds only the worker's Ed25519 public key. Every worker request signs the method, path, timestamp, a random nonce and a SHA-256 of the body (`backend/worker_auth.py`), and the relay rejects anything older than 90 seconds, a repeated nonce, or a body that doesn't match. Each claimed job carries a random lease, so a cancelled or stale job can't be completed late.

yt-dlp and FFmpeg run in a fresh process for each attempt and are killed as a group on cancel or timeout, using a process group on macOS and Linux and a job object on Windows (`backend/winjob.py`). Duration, download size, output size and wall-clock time are all capped. Links are reduced to a canonical `watch?v=` URL in the browser and again on the server (`backend/urls.py`), and visitors only ever see errors from a fixed list, since yt-dlp's own messages can contain signed URLs and IP addresses.

Import requests are logged in memory on the relay and collected by the worker into a journal on its own disk; nothing is written on Render. Page views come from Vercel Web Analytics, which is cookieless. See [docs/youtube-import.md](docs/youtube-import.md), [docs/worker.md](docs/worker.md) and [docs/analytics.md](docs/analytics.md) for the details.

## Project layout

```
src/
  core/        Pure TypeScript with no browser APIs, unit-tested in Node
    settings.ts    slider ↔ speed mapping, reverb gain curves, soft-clip ceiling, file naming
    impulse.ts     procedural reverb impulse response
    dsp.ts         seeded noise and one-pole filter coefficients
    transport.ts   playback position at any speed, with looping
    peaks.ts       waveform envelope for drawing
    dance.ts       beat detection and easing for the background
    look.ts        themes and glows, reading and migrating saved preferences
    youtube.ts     link canonicalisation, import progress
    format.ts, wav.ts
  audio/       Web Audio
    engine.ts      the player: queue, per-song settings, play/seek/skip, Media Session, analyser
    chain.ts       the audio graph shared by playback and export
    save.ts        offline render and download
    mp3.worker.ts  MP3 (or WAV fallback) encoding off the main thread
  imports/     YouTube import client and the link box
  screens/     Start, Player, Info, Themes
  ui.tsx       sliders, waveform, transport, animated background
  App.tsx      screen state, history integration, view transitions, drag and drop
backend/
  app.py         FastAPI app: job queue, limits, CORS, public API
  relay.py       worker endpoints (claim, progress, upload), mounted in relay mode
  worker_auth.py Ed25519 request signing and verification
  worker.py      the outbound worker (Windows and macOS)
  extract.py     yt-dlp + FFmpeg in a disposable subprocess
  urls.py        YouTube link validation
  winjob.py      Windows job objects for killing a whole process tree
  events.py      what the relay notes about each request, held in memory for the worker to collect
  board.py       the dashboard on the relay: secret path, password, session cookie, fed live by the worker
  analytics.py   the worker's journal: storage, sums, and the watch / stats / songs / imports commands
  dashboard.py   a read-only page for the worker's own machine (127.0.0.1), with dashboard.html, and what the worker sends board.py
  geo.py         address to city from a local database file
windows/       worker installer and supervisor (scheduled task, starts at boot)
macos/         alternative worker host: menu bar app and LaunchAgent installer
public/        robots.txt, sitemap.xml, the icons and the link preview picture, served at the site's root
scripts/       check-speed.mjs (CI performance lint), layout-audit.js (in-browser layout measurement),
               make-images.mjs (draws the .ico, home screen icon and preview picture with Playwright)
docs/          design decisions, changelog, import and worker guides
```

## Development

Requires Node 22+.

```bash
npm install
npm run dev
```

Open http://localhost:5190. In development the audio engine is available as `window.sloverb`, so you can drive it from the console (`sloverb.tune({ reverb: 0.7 })`, `sloverb.snapshot()`).

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5190 |
| `npm test` | Performance lint, then Vitest unit tests for `src/core` and `src/imports` |
| `npm run check:speed` | Performance lint only |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build |

To try real songs locally, put them in `public/local/`, which is git-ignored. No audio files are committed.

### Backend (optional)

Only needed to work on YouTube imports. Requires Python 3.12+, and Node and FFmpeg on `PATH` for yt-dlp.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 10000
```

Without `WORKER_PUBLIC_KEY` the server runs extraction itself instead of waiting for a worker, which is the simplest setup for local work. Copy `.env.example` to `.env.local` to point the frontend at it, then restart `npm run dev`. `VITE_` variables are compiled into the public JavaScript, so never put a secret in one.

```bash
.venv/bin/python -m pytest backend/tests -q
```

## Testing and CI

Vitest covers the DSP, the reverb, the playback clock, the beat detector's photosensitivity limits and the import client. pytest covers link validation against SSRF-style inputs, the job lifecycle, request signing and replay, and the analytics journal; the Windows process containment is tested on a Windows runner. GitHub Actions runs the frontend checks and build, the backend tests and Docker build on Linux, the backend tests on Windows, and a compile of the macOS menu bar app.

## Deployment

| Part | Where | How |
| --- | --- | --- |
| Frontend | Vercel | Every push to `main`. `VITE_IMPORT_API_URL` is set at build time. |
| Relay | Render, one free web service (`render.yaml`) | Docker image from `backend/Dockerfile`, deployed after CI passes and only when backend files change. One Uvicorn process, since job state is in memory. |
| Worker | An always-on Windows PC | A scheduled task that starts at boot, installed and updated with `windows/install.py`. |

The relay and the worker deploy independently, so the job protocol is versioned (`"version": 1`) and kept backward compatible.

## Documentation

- [docs/decisions.md](docs/decisions.md): design decisions and their reasoning
- [docs/changelog.md](docs/changelog.md): dated history of user-visible changes
- [docs/accessibility.md](docs/accessibility.md): how sloverb meets WCAG 2.2 AA
- [docs/seo.md](docs/seo.md): search and link previews
- [docs/youtube-import.md](docs/youtube-import.md): import hosting, limits, API and troubleshooting
- [docs/worker.md](docs/worker.md): installing and running the worker
- [docs/analytics.md](docs/analytics.md): what the import journal records and what it leaves out

## History

The first version used React, Tone.js and a Flask server for exports. It is preserved on the `original` branch and the `v1-original` tag.
