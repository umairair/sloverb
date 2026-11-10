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
- The room is seeded and comes out the same every time. Tests rely on that.
- A sample under the knee passes through `hold()` untouched, so `original` with no reverb is the song as it was, 1 dB quieter. Keep it that way.
- No song files in the repo, and no demo song. `public/local/` is ignored by git, for trying real songs.
- Only the song that is playing is held decoded. The rest of the list waits as files and is decoded when its turn comes, so a long list doesn't run a phone out of memory. Don't cache decoded songs.
- Songs come in through `engine.add([{ file, name }])` and nowhere else. Getting a song from a link is not built yet, and when it is it only has to call that.

## Checking it works

There is no way to listen from here, so measure. In development the engine is on the window as `sloverb`. From the browser console you can drive it (`sloverb.tune({ reverb: 0.7 })`, `sloverb.seek(30)`), read `sloverb.snapshot()` and `sloverb.position()`, and render through `chain()` in an `OfflineAudioContext` to read levels and peaks.

## Style

Umair's taste. Get this right the first time.

**Look**
- Pitch black, white text, grey for anything secondary. System font. Rounded, soft, frosted. Think ChatGPT on an iPhone.
- One set of colours, the blue, purple and pink of the first sloverb, always as a gradient in that order left to right (`--grad` in `src/styles.css`, and the same three in `src/ui.tsx` for the waveform). It is light on a black page: the wordmark, the waveform behind the playhead, the fills of the sliders and save, the ring round play, the glow in the background. Never a flat coloured block, never a fourth colour.
- No emoji. No sharp rectangles.
- Nothing decorative. If it doesn't help someone make their song, it goes.

**Words in the app**
- Lowercase, one or two plain words: `choose song`, `save`, `speed`, `reverb`, `add song`, `info`.
- The page about the app is called `info`, never about.
- No taglines, no helper sentences, no reassurance copy, no hints. If a control needs explaining, redesign it.
- Say what is happening, plainly. `opening`, `saving`, `saved`, `can't read that file`.

**Sentences (the info page, anything longer)**
- Write like a person talking, in full flowing sentences. Sentence case, real names capitalised.
- Join related thoughts with a comma instead of chopping them into short sentences. One period at the end.
- Never: clipped fragments, haiku-style line lists, labelled feature rows, salesy or techbro phrasing, em-dashes.
- Humble. State facts and stop.
- Don't explain what should be obvious.
- Signed `- Umair`. Link: linkedin, not github.

**Layout**
- One centred column, built for a phone first and the same on a desktop, only with more room round it.
- Top to bottom: the song's name and what this version is, the waveform, the transport, the presets and sliders, save.
- It has to fit an iPhone or Android browser without scrolling, bars and all. Sizes bend with the height of the screen (`--gap`, `--tall` in `src/styles.css`); check 375x553 and 360x640 after touching the layout.
- Nothing may depend on hover, and hover styles live inside `@media (hover: hover)` so they don't stick after a tap.
- Dragging a file in is for a mouse: the drop area on the start screen is hidden on touch screens, and the whole page is the target once a file is over it.

**Controls**
- As few as possible. Two sliders, three presets, the transport and save. There is no settings screen.
- No floating bars or pills of extras. The only thing at the bottom of the screen is the word `info`.
- The transport is the only place with icons: the song before, play or pause, the song after. Everything else is a word.
- Never make anyone configure anything. One save button, one format.
