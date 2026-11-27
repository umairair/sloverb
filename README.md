# sloverb

Slowed + reverb and nightcore for any song, in the browser. Open a file, drag two sliders, save an MP3.

**Live:** [sloverb.app](https://sloverb.app)

Everything that touches the sound runs on the listener's device with the Web Audio API: playback, the reverb, the limiter and the MP3 encoder. A file you open is never uploaded. The one feature that needs a server, importing audio from a YouTube link, goes through a small relay and a self-hosted worker described [below](#youtube-imports).

Stack: React 19, TypeScript, Vite, Web Audio, Web Workers + WASM on the frontend; FastAPI, yt-dlp and FFmpeg on the backend. The only runtime dependencies in the page are React and an MP3 encoder.

## Features

- **Speed from 0.5× to 2×.** Pitch follows speed, like a record on a turntable, which is what gives slowed and nightcore their sound. The slider is logarithmic, so equal distances are equal pitch intervals and 1× sits in the middle.
- **Reverb from dry to drenched**, from a hall generated in code rather than a recorded impulse.
- **Export to 320 kbps MP3** that matches what was playing, rendered faster than real time and encoded off the main thread.
- **A queue.** Add as many songs as you like; each keeps its own speed and reverb.
- **An audio-reactive background** that follows loudness and the beat, with nine colour schemes and light and dark themes.
- **Phone-first.** One column that fits a small screen without scrolling, touch-friendly sliders, lock-screen and media-key controls (Media Session), and the back button closes pages.
- **Keyboard:** space plays and pauses, the arrow keys seek by 10 seconds, and focused sliders take arrow keys.

## How the audio works

```
song ─┬─ dry gain ───────────────┬─ ×¼ ─ WaveShaper ceiling ─ out
      └─ Convolver (room) ─ wet ─┘
```

**One graph for playback and export.** `chain()` in `src/audio/chain.ts` builds the graph against any `BaseAudioContext`. The player uses it with a live `AudioContext`. Saving renders the whole song through the same function in an `OfflineAudioContext`, so the file is sample-for-sample what was heard, with the reverb tail included.

**A procedural, deterministic reverb.** `src/core/impulse.ts` writes a 4.6 s stereo impulse response from seeded noise (mulberry32): an 18 ms pre-delay, a short swell, a body with an RT60 of 3.9 s, treble above 2.6 kHz that dies faster (1.5 s), a two-pole high-pass at 230 Hz so the bass stays tight, and a different seed per ear for width. It is normalised to unit energy and the convolver's own normalisation is off, so it sounds the same in every browser, at every sample rate, and in every export. Nothing is downloaded for it.

**Gain staging without a limiter.** A loud master plus its own reverb overshoots full scale. The dry and wet gains follow curves that trade off as the reverb rises and pull the mix down by up to 4.2 dB, then a memoryless `tanh` soft-clip (a `WaveShaper` curve) bends anything above −1 dBFS toward a 0.97 ceiling. It has no attack or release, so it can't pump, and below the knee a sample passes through unchanged.

**MP3 encoding in a worker.** The rendered PCM is transferred (not copied) to a Web Worker that encodes 320 kbps MP3 with LAME compiled to WASM (`wasm-media-encoders`), reporting progress as it goes. If the WASM fails to load it falls back to WAV, so a save always produces a file. The encoder is only fetched when someone saves.

**Bounded memory.** Only the playing song is held as a decoded `AudioBuffer`, which is tens of megabytes per song. The rest of the queue stays as compressed `Blob`s and is decoded when its turn comes, so a long queue doesn't run a phone out of memory.

**A clock that survives speed changes.** The audio clock only counts up, so the position is an anchor (a place in the song at a moment on the clock) plus elapsed time × speed (`src/core/transport.ts`). Changing speed re-anchors rather than re-seeking.

### The audio-reactive background

An `AnalyserNode` measures overall level and three bands each frame (35–150 Hz, 300 Hz–2 kHz, 4–12 kHz). `src/core/dance.ts` turns those into a slow loudness swell plus three beat "hits":

- A hit is an onset, measured by how fast a band is rising, not how loud it is. A rise only counts above where that band has sat for the last ~200 ms, and is scaled against the biggest recent rise. That keeps sidechain-ducked bass from triggering false beats and makes a dense, loud mix react about as much as a sparse one.
- Visuals are delayed by the device's reported output latency (`outputLatency + baseLatency`), so the light moves with what reaches the ear, not with what was sent to the speakers.
- **Photosensitivity limits, enforced by tests.** A hit never changes brightness, never lands in a single frame (it eases in over ~100 ms), and each band fires at most about three times a second. `prefers-reduced-motion` turns the beat motion off.

Each frame writes a few CSS custom properties to the background layer only. The lights are pre-drawn and moved with `transform` and `opacity`, so the per-frame cost is compositing, not layout or paint.

## Performance

Every interaction should feel instant on a cheap phone. Part of that is checked by a machine: `scripts/check-speed.mjs` runs before the unit tests and in CI, and fails the build on transitions over 0.25 s, animated properties that trigger layout or paint (`height`, `box-shadow`, `background-position`, …), `backdrop-filter`, and styles set on the whole document from script. An intentional exception has to be justified inline with a `speed-ok:` comment.

The rest is in the design: screen changes are a plain switch in the frame of the press, with no transition on anything a person touches, playback starts immediately on a real user gesture (`navigator.userActivation`), and hashed assets are cached for a year (`vercel.json`). The production bundle is about 82 kB of gzipped JavaScript.

## Search and link previews

The app has almost no words on purpose, so what search engines and link previews read lives in the head of `index.html` and in `public/`: a title with the words people search for, a description, a canonical address, Open Graph tags and a 1200×630 preview image, `WebSite` and `WebApplication` structured data (JSON-LD), crawlable icons, `robots.txt` and a sitemap. With JavaScript off the page shows the text of `info` instead of nothing, which is also what crawlers that don't run JavaScript read. None of it runs code or adds to what the page loads before it is drawn; Lighthouse scores 100 for SEO, performance, accessibility and best practices. See [docs/seo.md](docs/seo.md).

## YouTube imports

Pasting a YouTube link fetches its audio as an MP3 and adds it to the queue through the same `engine.add()` as a local file. Only import audio you have permission to use.

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

**Why a home worker.** YouTube rejects downloads from cloud provider IP ranges (tested from two Render regions, with and without proof-of-origin tokens). The worker runs on a residential connection and only ever makes outbound requests, so it opens no ports and accepts no inbound connections.

**Authenticating the worker.** Render holds only the worker's Ed25519 public key. Each worker request signs the method, path, timestamp, a random nonce and the SHA-256 of the body (`backend/worker_auth.py`). The relay rejects anything outside a 90-second window, replays a nonce, or has a body that doesn't match its digest. A claimed job carries a random lease, so a stale or cancelled job can't be completed late, and a retried upload with the same content is idempotent.

**Containing the extractor.** yt-dlp and FFmpeg run in a separate process per attempt (a refusal that may be transient is retried in a fresh process, up to three attempts inside one deadline) and are killed as a group on cancel or deadline: a POSIX process group on macOS and Linux, a Windows job object on Windows (`backend/winjob.py`, with processes started suspended so nothing escapes before it is assigned). Duration, download size, output size and wall-clock time are all capped.

**Input and output hygiene.** Links are canonicalised to `https://www.youtube.com/watch?v=<11-char id>` in the browser (`src/core/youtube.ts`) and again on the relay and the worker (`backend/urls.py`), so nothing else ever reaches the extractor. Error messages shown to visitors come from a fixed allowlist, because yt-dlp's own errors can contain signed URLs and IP addresses.

**Operational details.** The browser talks to `api.sloverb.app` rather than `*.onrender.com` because ad blockers block the latter. The MP3 streams straight from the relay to the browser, which avoids Vercel's 4.5 MB function payload limit. The YouTube controls are only rendered when the build has `VITE_IMPORT_API_URL`, so preview deployments and local builds work without a backend.

**Logs and analytics, kept at home.** The relay notes each request to the import API (address, country, browser, the video, the outcome) in a bounded in-memory list and writes nothing to disk or to its logs. The worker collects those notes over the same signed channel, with a long poll so a request shows up within a second, and appends them to a JSON-lines journal on its own disk together with its own account of each download: the video's metadata, how long each step took, and the extractor's real error, which is never shown to a visitor. A job is named by a hash of its ID, never the ID, since the ID is a bearer capability. On the worker's machine `watch` tails the journal, `stats`, `songs` and `imports` summarise it, and `dashboard` serves a live page to that machine's own browser, bound to 127.0.0.1, read-only, with a strict Content-Security-Policy and a `Host` check against DNS rebinding. Cities come from a database file on that machine, so no visitor's address is sent to a lookup service. Only YouTube imports are visible to any of this; files opened locally never leave the browser.

**Page views on Vercel.** The site loads Vercel Web Analytics with a few lines in the head of `index.html` rather than the `@vercel/analytics` package, so the bundle is unchanged: it injects `/_vercel/insights/script.js` (about 1.5 kB, cookieless, skipped on localhost) and page views appear in the project's Analytics tab on Vercel once it is enabled there. No custom events are sent.

See [docs/youtube-import.md](docs/youtube-import.md) for hosting, limits, the API and troubleshooting, [docs/worker.md](docs/worker.md) for how the worker is installed, supervised and controlled, and [docs/analytics.md](docs/analytics.md) for what is recorded and how to look at it.

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
  analytics.py   the worker's journal: storage, sums, and the watch / stats / songs / imports commands
  dashboard.py   a read-only page for the worker's own machine (127.0.0.1), with dashboard.html
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

Open http://localhost:5190. In development the audio engine is exposed as `window.sloverb`, so it can be driven and inspected from the console (`sloverb.tune({ reverb: 0.7 })`, `sloverb.snapshot()`).

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5190 |
| `npm test` | Performance lint, then Vitest unit tests for `src/core` and `src/imports` |
| `npm run check:speed` | Performance lint only |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build |

With the dev server running, `await import("/scripts/layout-audit.js")` in the browser console loads a tool that measures whether every screen is centred and evenly spaced; usage is at the top of the file.

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

- **Frontend:** Vitest covers the DSP and gain curves, the impulse response (determinism, decay, stereo decorrelation, low-end cut), the transport clock, WAV encoding, filename and title cleaning, saved-preference migration, the beat detector (including the photosensitivity limits), link validation, and the import client against a mocked API (polling, cancellation, cleanup, ad-blocker detection).
- **Backend:** pytest covers link validation against SSRF-style inputs, the job lifecycle (round trip, cancel, deadlines, expiry), size and origin limits, metadata checks before any download, request signing, replay and lease handling, upload integrity, and the worker's pause behaviour. Windows-only process containment (job objects, the single-instance lock) is tested on a Windows runner. For the journal: which requests become events and which don't, that job IDs, leases, typed text and extractor errors never leak into them, the cursor and resend behaviour of collection, the buffer's ceiling and rate budget, sanitising of hostile headers and titles, the journal's storage and tailing, the sums, and the dashboard's refusal of cross-site and rebinding requests.
- **GitHub Actions** (`.github/workflows/ci.yml`) runs the frontend checks and build, the backend tests and Docker image build on Linux, the backend tests on Windows, a compile of the macOS menu bar app, and a check that code changes come with documentation changes (`.github/scripts/check-docs.sh`).

## Deployment

| Part | Where | How |
| --- | --- | --- |
| Frontend | Vercel | Every push to `main`. `VITE_IMPORT_API_URL` is set at build time. |
| Relay | Render, one free web service (`render.yaml`) | Docker image from `backend/Dockerfile`, deployed after CI passes and only when backend files change. One Uvicorn process, since job state is in memory. |
| Worker | An always-on Windows PC | A scheduled task that starts at boot, installed and updated with `windows/install.py`. |

The relay and the worker deploy independently, so the job protocol is versioned (`"version": 1`) and kept backward compatible.

## Documentation

- [docs/decisions.md](docs/decisions.md): design decisions with their reasoning and what would justify revisiting them
- [docs/changelog.md](docs/changelog.md): dated history of user-visible changes
- [docs/accessibility.md](docs/accessibility.md): what sloverb does to meet WCAG 2.2 AA, and how to check it after a change
- [docs/seo.md](docs/seo.md): what search engines and link previews are given, why the app itself has no words for them, and the dashboard steps left
- [docs/youtube-import.md](docs/youtube-import.md): import hosting, limits, API and troubleshooting
- [docs/worker.md](docs/worker.md): installing, running and controlling the worker
- [docs/analytics.md](docs/analytics.md): the worker's journal of import requests: what is recorded, where it lives, how to watch it, and what is deliberately left out
- [CLAUDE.md](CLAUDE.md): conventions and constraints for anyone changing the code, including AI coding agents

## History

This is a rewrite. The first version used React, Tone.js and a Flask server for exports; it is preserved on the `original` branch and the `v1-original` tag.
