# sloverb

Slowed and reverb or nightcore for any song, in the browser. Vite + React + TypeScript, plain Web Audio, no server.

## Git

This folder is a clone of `github.com/umairair/sloverb`.

- Check `git status` before starting. Pull first.
- Commit after each working change, small and often.
- Run `npm test` and `npm run build` before pushing.

## Commands

- `npm run dev` dev server on 5190
- `npm test` unit tests for `src/core`
- `npm run build` typecheck and build into `dist/`

## Rules that are easy to break

- The live player and a save both go through `chain()` in `src/audio/chain.ts`, so the file is what was playing. Never add something to one and not the other.
- `src/core` has no browser APIs in it, which is why it can be tested in node. Sums go in `core`, Web Audio goes in `audio`.
- The room and the demo song are seeded and come out the same every time. Tests rely on that.
- A sample under the knee passes through `hold()` untouched, so `original` with no reverb is the song as it was, 1 dB quieter. Keep it that way.
- No song files in the repo. The demo is written in code. `public/local/` is ignored by git, for trying real songs.
- Songs come in through `engine.open(file, name)` and nowhere else. Getting a song from a link is not built yet, and when it is it only has to call that.

## Checking it works

There is no way to listen from here, so measure. In development the engine is on the window as `sloverb`. From the browser console you can drive it (`sloverb.tune({ reverb: 0.7 })`, `sloverb.seek(30)`), read `sloverb.snapshot()` and `sloverb.position()`, and render through `chain()` in an `OfflineAudioContext` to read levels and peaks.

## Style

Umair's taste. Get this right the first time.

**Look**
- Pitch black, white text, grey for anything secondary. System font. Rounded, soft, frosted. Think ChatGPT on an iPhone.
- No colour. No emoji. No icons where a word will do. No sharp rectangles.
- Nothing decorative. If it doesn't help someone make their song, it goes.

**Words in the app**
- Lowercase, one or two plain words: `open song`, `demo`, `play`, `pause`, `save`, `speed`, `reverb`, `about`.
- No taglines, no helper sentences, no reassurance copy, no hints. If a control needs explaining, redesign it.
- Say what is happening, plainly. `opening`, `saving 42%`, `can't read that file`.

**Sentences (the about page, anything longer)**
- Write like a person talking, in full flowing sentences. Sentence case, real names capitalised.
- Join related thoughts with a comma instead of chopping them into short sentences. One period at the end.
- Never: clipped fragments, haiku-style line lists, labelled feature rows, salesy or techbro phrasing, em-dashes.
- Humble. State facts and stop.
- Don't explain what should be obvious.
- Signed `- Umair`. Link: linkedin, not github.

**Controls**
- As few as possible. Two sliders, three presets, play and save. There is no settings screen.
- Everything else lives in one floating bar at the bottom middle: `open`, `about`.
- Never make anyone configure anything. One save button, one format.
