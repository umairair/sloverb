# sloverb

Slowed and reverb or nightcore for any song, made in the browser. Open a song, set the speed and the reverb, save it as an MP3.

Playback, effects and MP3 exports happen on your device. Local files stay there. YouTube links go to a small import server, which downloads and converts one video to MP3, then hands it to the same player and deletes its temporary copy.

Rebuilt from the original, which was React and Tone.js with a Flask server for saving. That version is in the history of `main`.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5190 and press `choose song`, or drop files anywhere on the page. More songs can be added at any time, and the buttons either side of play go through the ones that are loaded. When a song ends the next one starts, and a song on its own loops.

Space plays and pauses, the arrow keys move through the song ten seconds at a time, and the sliders take arrow keys too when they have focus.

It is laid out for a phone first: one centred column that fits a small screen without scrolling, nothing that depends on hover, and `info` is a step in the browser's history so the back button closes it.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5190 |
| `npm test` | Unit tests for everything in `src/core` |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build |

## How it works

Speed is the playback rate, so pitch follows it the way it does on a record. That is the slowed sound, and nightcore is the same thing the other way.

Reverb is a convolution with a room that is written in code rather than recorded: a few seconds of shaped noise with a short gap in front, a long body, treble that dies sooner than the rest, no low end, and a different answer for each ear.

A loud song plus its own reverb is louder than a file can hold, so the mix comes down a little as the reverb goes up and whatever still pokes over is bent under a ceiling. A song on its own passes through untouched, 1 dB quieter.

| Part | File | Job |
| --- | --- | --- |
| Settings | `core/settings.ts` | Slider positions to speed and gains, presets, the ceiling, what the saved file is called |
| Room | `core/impulse.ts` | Writes the reverb's impulse response, seeded so it is the same every time |
| Shape | `core/peaks.ts` | The loudness of the song from start to end, for drawing |
| Clock | `core/transport.ts` | Where in the song we are, at any speed, looping |
| Chain | `audio/chain.ts` | The Web Audio graph: song, room, ceiling |
| Player | `audio/engine.ts` | Holds the list of songs, plays, pauses, seeks, moves between them, and holds the state the screen reads |
| Save | `audio/save.ts`, `audio/mp3.worker.ts` | Renders the whole song offline through the same chain, then encodes a 320 kbps MP3 on another thread |

`src/core` has no browser in it and is tested in node. In development the engine is on the window as `sloverb`, so it can be driven and measured from the console.

To try real songs locally, put them in `public/local/`, which git ignores.

## Getting songs from a link

Paste a YouTube video link on the start screen, or press `youtube link` beside `add song` in the player. Watch, short, embed, music and youtu.be links work, playlists resolve only to the linked video. Imports have progress, cancellation and retryable errors. Only import audio you have permission to use.

The backend uses FastAPI, yt-dlp, its EJS scripts, Node 24 and FFmpeg. MP3s go directly from the import server to the browser, avoiding Vercel function payload limits. Every imported song goes through `engine.add([{ file, name }])`, with the same queue, effects and save path as a chosen file.

For local development, install Python 3.12+, Node 22+ and FFmpeg, then run:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 10000
```

Set `VITE_IMPORT_API_URL=http://localhost:10000` in `.env.local` and run the frontend separately with `npm run dev`. The URL is public configuration, never put secrets in `VITE_` variables. Run backend tests with `.venv/bin/python -m pytest backend/tests -q`.

See [deployment and research](docs/youtube-import.md) for the free Render setup, Vercel configuration, CI/CD and hosting limits.
