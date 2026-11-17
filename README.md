# sloverb

Slowed and reverb or nightcore for any song, made in the browser. Open a song, set the speed and the reverb, save it as an MP3.

Playback, effects and MP3 exports happen on your device, and a song you choose never leaves it. YouTube links are the one exception: a worker on the owner's always-on Windows PC downloads the video as an MP3 and hands it back to the player through a small relay at `api.sloverb.app`, and the temporary copies are deleted after import.

Rebuilt from the original, which was React and Tone.js with a Flask server for saving. That version is kept as the branch `original` and the tag `v1-original`.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5190 and press `browse files`, or drop files anywhere on the page. More songs can be added at any time, and the buttons either side of play go through the ones that are loaded. Each song keeps its own speed and reverb, so coming back to one finds it the way it was left. When a song ends the next one starts, and a song on its own loops.

Space plays and pauses, the arrow keys move through the song ten seconds at a time, and the sliders take arrow keys too when they have focus.

It is laid out for a phone first: one centred column that fits a small screen without scrolling, nothing that depends on hover, and `info` and `themes` are steps in the browser's history so the back button closes them.

`themes` is only about how it looks. A first visit gets `light` with the glow `rose`. The page is `dark` or `light`, and there are nine glows to light it, `classic`, `vapor`, `sunset`, `ember`, `aurora`, `ocean`, `forest`, `rose` and `mono`, each with its own three colours and its own way of moving behind the page. The glow swells with how loud the song is and dances to it, one light jumping to the low end, one to the middle and one to the highs. A `glow effect` slider sets how much of that there is, down to off. All three are remembered on the device.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5190 |
| `npm test` | The speed check (`scripts/check-speed.mjs`), then unit tests for `src/core` and `src/imports` |
| `npm run check:speed` | Only the speed check, which fails changes that would make the site feel slow |
| `await import("/scripts/layout-audit.js")` in the browser console, with the dev server running | Loads `audit`, which measures whether everything is centred and evenly spaced (how to use it is at the top of the file) |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build |
| `.venv/bin/python -m pytest backend/tests -q` | Backend tests (relay, worker signing, link checks) |

## How it works

Speed is the playback rate, so pitch follows it the way it does on a record. That is the slowed sound, and nightcore is the same thing the other way.

Reverb is a convolution with a room that is written in code rather than recorded: a few seconds of shaped noise with a short gap in front, a long body, treble that dies sooner than the rest, no low end, and a different answer for each ear.

A loud song plus its own reverb is louder than a file can hold, so the mix comes down a little as the reverb goes up and whatever still pokes over is bent under a ceiling. A song on its own passes through untouched, 1 dB quieter.

| Part | File | Job |
| --- | --- | --- |
| Settings | `core/settings.ts` | Slider positions to speed and gains, where the sliders start (`DEFAULTS`), the ceiling, what the saved file is called |
| Room | `core/impulse.ts` | Writes the reverb's impulse response, seeded so it is the same every time |
| Shape | `core/peaks.ts` | The loudness of the song from start to end, for drawing |
| Clock | `core/transport.ts` | Where in the song we are, at any speed, looping |
| Chain | `audio/chain.ts` | The Web Audio graph: song, room, ceiling |
| Player | `audio/engine.ts` | Holds the list of songs and each one's speed and reverb, plays, pauses, seeks, moves between them, and holds the state the screen reads |
| Save | `audio/save.ts`, `audio/mp3.worker.ts` | Renders the whole song offline through the same chain, then encodes a 320 kbps MP3 on another thread |
| Look | `core/look.ts`, `look.ts`, `screens/Themes.tsx` | The two themes, the glows and how much they move: what they can be, keeping them on the device, and the page that changes them. The colours of each glow are the block at the top of `styles.css`, and its shape is under "light behind everything" in the same file |

`src/core` has no browser in it and is tested in node. In development the engine is on the window as `sloverb`, so it can be driven and measured from the console.

To try real songs locally, put them in `public/local/`, which git ignores.

## Getting songs from a link

Paste a YouTube video link on the start screen, or press `paste` in the empty box to take the copied link and open it in one go. With a song already playing, press `sloverb` at the bottom of the player to get back to the start screen, and the import joins the end of the list when it lands. Watch, short, embed, music and youtu.be links work, playlists resolve only to the linked video. While a link is being fetched its box becomes a progress bar with one word for the current step, and imports can be cancelled and retried. Only import audio you have permission to use.

```
browser (sloverb.app, Vercel)  ──►  api.sloverb.app (Render relay)  ◄──  home worker on a Windows PC (outbound only)
```

The browser asks the relay for an import and checks on it once a second. The worker on the owner's PC asks the relay for work, downloads and converts the video with yt-dlp and FFmpeg, and uploads the MP3. The browser then fetches the MP3 straight from the relay, which keeps it clear of Vercel's 4.5 MB function limit, and passes it to `engine.add([{ file, name }])`, so it gets the same queue, effects and save as a chosen file.

The download runs at home because YouTube refuses downloads from Render's addresses. The relay lives on a sloverb.app subdomain because ad blockers block `onrender.com`. Imports only work while that PC is on and online, which it always is. The worker ran on the owner's Mac until 2026-11-16 and still can.

| Part | File | Job |
| --- | --- | --- |
| Link check | `core/youtube.ts`, `backend/urls.py` | Turns any YouTube video link into a plain watch link, refuses everything else |
| Client | `imports/youtube.ts`, `imports/LinkImport.tsx` | Starts the import, shows progress, cancels, fetches the MP3 |
| Relay | `backend/app.py`, `backend/relay.py` | Jobs, limits, CORS, and the endpoints the worker uses |
| Signing | `backend/worker_auth.py` | Ed25519 signatures on every worker request, with replay protection |
| Worker | `backend/worker.py`, `backend/extract.py` | Claims a job, runs yt-dlp and FFmpeg in a process it can kill, uploads the MP3, pauses on low battery. Runs on Windows and macOS |
| Windows service | `windows/install.py`, `windows/service.py`, `backend/winjob.py` | Starts the worker at boot from a scheduled task, restarts it, pause and resume, kills a whole extraction on Windows |
| Menu bar app | `macos/WorkerApp.swift`, `macos/install.py` | The Mac's version: starts the worker at login, pause and resume, battery notices |

For local development, install Python 3.12+, Node 22+ and FFmpeg, then run:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 10000
```

Without `WORKER_PUBLIC_KEY` set, this local server downloads videos itself instead of waiting for a worker. Set `VITE_IMPORT_API_URL=http://localhost:10000` in `.env.local` and run the frontend separately with `npm run dev`. With no `VITE_IMPORT_API_URL` the YouTube controls don't appear at all. The URL is public configuration, never put secrets in `VITE_` variables. Run backend tests with `.venv/bin/python -m pytest backend/tests -q` (on Windows, `.venv\Scripts\python.exe` in place of `.venv/bin/python`).

See [YouTube imports](docs/youtube-import.md) for hosting, DNS, limits, the API and troubleshooting, and [the Windows worker](docs/windows-worker.md) for installing, updating and running the worker ([the Mac worker](docs/mac-worker.md) for the Mac's).

## Documentation

`CLAUDE.md` is the guide for anyone, agent or person, changing sloverb, and starts with the rule that every change keeps these docs true, which CI checks. `docs/decisions.md` records why things are the way they are and how to change them, and `docs/changelog.md` is the readable history.
