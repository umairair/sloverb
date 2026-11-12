# sloverb

Slowed and reverb or nightcore for any song, in the browser. Vite + React + TypeScript and plain Web Audio. Songs are played, changed and saved on the listener's device. The one exception is YouTube links, which are downloaded by a worker on Umair's own Mac and handed back to the browser through a small relay on Render.

Live at https://sloverb.app. Two rules below apply to every change you make: keep the documentation true, and keep it fast. Read this file, then `docs/decisions.md`, then `README.md`, then `docs/youtube-import.md` and `docs/mac-worker.md` if the task touches imports.

## Keeping the documentation true

This rule applies to every change, by any agent or person, for as long as the project exists. The documentation is how the next agent understands sloverb, so a change isn't finished until the docs say what is now true.

- **In the same commit as the change**, update whichever of these it affects:
  - `CLAUDE.md` for rules, hosting, commands, known gaps, and anything an agent must know before touching the code.
  - `README.md` for what sloverb does, how to run it, and which file does what.
  - `docs/*.md` for the detail of a part (imports, the Mac worker, anything new that deserves its own page).
  - `docs/decisions.md` when something is decided, or an earlier decision is changed or reversed.
  - `docs/changelog.md`, one dated line for anything a visitor, Umair or a future agent would notice.
- **Fix what's wrong when you find it.** If something in the docs no longer matches the code or the live site, correct it, even when it isn't part of your task.
- **Write it so a new agent with no memory of this conversation can act on it.** Say why, not only what. Use dates, not "today". Name files, services and settings exactly.
- **Delete what stops being true** rather than piling up exceptions. A gap that gets fixed comes off Known gaps and goes into the changelog.
- **CI enforces this.** The `docs` job in `.github/workflows/ci.yml` fails when a push or PR changes code or config without touching `CLAUDE.md`, `README.md` or `docs/`. Only when nothing a future agent needs to know has changed (a typo, a tweak to a number already described, a refactor that leaves behaviour and structure alone), put `[no-docs: reason]` in the commit message or PR title. A failing check also holds back the Render deploy, which waits for checks to pass.
- **Decisions can change.** Nothing in these docs is permanent because it was written down. A future agent may change a rule, the hosting, the design or anything else once it understands why the current choice was made (see `docs/decisions.md`) and Umair agrees where the change is his call. Record the new decision there, mark the old one as replaced and say why, and update every other doc it touches. The exceptions are the things Umair said must be kept: the `original` branch and `v1-original` tag, keeping it fast, and the style section below.
- Everything lives in this repo and on GitHub, never only in an agent's private memory or a chat.
- `AGENTS.md` points other tools here, and `.github/pull_request_template.md` carries the same checklist into every PR.


## Keeping it fast

This rule applies to every change, by any agent or person, for as long as the project exists, exactly like keeping the documentation true. Umair wants sloverb to feel lightning fast: every tap, hover, drag and screen change has to answer instantly, on any phone, old and cheap ones included. On 2026-11-12 he found it had become lazy after a run of visual additions, and every effect was reworked to keep its look and lose its cost (D14 in `docs/decisions.md`). Don't let it drift back.

- **Before you call any change finished**, ask whether it makes anything slower to answer, heavier to draw, or slower to load, and check it in a browser if it touches what is on screen. A change that looks good and feels slow is not done.
- **`npm test` runs `scripts/check-speed.mjs` first**, and so does the `check` job in CI, so a push that breaks one of the rules a machine can see fails before it deploys. It flags transitions or one-off animations over 0.25s, animating properties that repaint or relayout (`height`, `width`, `box-shadow`, `background-position` and so on), transitions on properties that repaint, `backdrop-filter`, and styles set on the whole page from script. A line that genuinely needs an exception says why on the same line with a comment containing `speed-ok:`. Don't add one to get a change through, fix the change.
- **The check can't see everything.** These rules are on you:
  - Anything a person touches answers a press in `--press` (0.04s) and a hover or release in `--quick` (0.12s), both in `src/styles.css`. Nothing they touch takes longer than about 0.2s, screen changes included.
  - Never set a value that changes every frame on `:root` or `body`, every element would restyle every frame. The music level (`--level`) goes only to elements with the class `hears`, and `--lift` lives on `.aura`.
  - Never animate `box-shadow`, `height`, `width`, `filter` sizes or `background-position` every frame. Draw the glow once on its own layer and fade its `opacity`, or move it with `transform` (see `.slide--speed::after` and `.now-playing__bars`). The wordmark's colour drift is the one moving gradient, and it steps twenty times a second rather than sixty.
  - No `backdrop-filter` on anything that sits over the moving light behind the page, it re-blurs every frame. The toast and the drop overlay keep theirs because they are brief.
  - Prefer loops the browser runs (CSS animations, Web Animations) over `requestAnimationFrame`. The light (`Aura`) and the waveform are the two script loops, and `engine.level()` measures once per frame for both.
  - Play starts at once when the press is a real tap (`navigator.userActivation`), instead of waiting for the sound hardware to wake.
  - iPhones only show `:active` on a page that listens for touches, which is the empty `touchstart` listener in `src/main.tsx`. Don't remove it.
  - Files under `/assets/` have hashed names and are cached for a year (`vercel.json`), so a return visit loads from the phone.
  - Don't add a dependency or a big file to the page for an effect. React is most of the JavaScript already.
  - Anything new that moves with the music goes through `hears` and must not restyle, relayout or repaint the page each frame.

## Git

This folder is a clone of `github.com/umairair/sloverb` (private).

- Check `git status` before starting. Pull first.
- Commit after each working change, small and often.
- Run `npm test` and `npm run build` before pushing, plus the backend tests if `backend/` changed.
- Update the docs in the same commit (see above).
- A push to `main` is a production deploy (see below). Every PR gets a Vercel preview, but imports are off in previews.
- The original app (React, Tone.js, Flask) is kept as the branch `original` and the tag `v1-original`, both at `9a04faa`. Umair asked for it to be kept safe. Never delete or move either.
- `remake` and `youtube-import` are merged branches, kept only as history.

## How it fits together

```
browser at sloverb.app (Vercel)
  │  local files: decoded, played and saved on the device, never uploaded
  │  youtube link:
  ▼
https://api.sloverb.app   Render web service "sloverb-import" (free plan, relay mode)
  ▲  holds jobs in memory for 10 minutes, no database, no disk that survives a restart
  │  outbound, signed HTTPS only (claim job, report progress, upload MP3)
  │
Mac worker on Umair's Mac   menu bar app "sloverb", started at login
     yt-dlp + FFmpeg turn one video into an MP3
```

- YouTube refuses downloads from Render's addresses (both regions tried), which is why the download happens on a home Mac. Nobody ever connects to the Mac. It only makes outgoing requests.
- The browser talks to `api.sloverb.app`, never to `sloverb-import.onrender.com`. Ad blockers block `onrender.com` when it is called from sloverb.app (Chrome shows `net::ERR_BLOCKED_BY_CLIENT`), so the API must stay on a sloverb.app subdomain. The Mac worker still uses the `onrender.com` address, which is fine because no browser is involved.
- Imports only work while the Mac is awake, online, logged in and not paused. Otherwise `/healthz` says `"available": false` and the site shows `imports are offline, try later`.
- An imported MP3 goes into `engine.add([{ file, name }])` like any other file, so the queue, effects and save are the same for both.

## Where everything is hosted

Umair has no command-line access to Vercel, Render or Namecheap from this Mac. He makes dashboard changes himself in his own browser, so give him short numbered steps and the direct link where you know it.

| What | Where | Notes |
| --- | --- | --- |
| Frontend | Vercel project `sloverb`, team `umairs-projects-31af5c61` | Deploys every push to `main`. Root directory is the repo root. |
| `VITE_IMPORT_API_URL` | https://vercel.com/umairs-projects-31af5c61/sloverb/settings/environment-variables | Production value is `https://api.sloverb.app`. It is baked in at build time, so a change needs a redeploy. Unset means no YouTube controls appear at all. |
| Relay | Render service `sloverb-import`, declared in `render.yaml` | Docker from `backend/Dockerfile`. Deploys from `main` only after CI passes, and only when `backend/**`, `render.yaml` or `.dockerignore` change. `WORKER_PUBLIC_KEY` puts it in relay mode. |
| DNS | Namecheap, Advanced DNS for `sloverb.app` | `@` A `76.76.21.21` and `www` CNAME `cname.vercel-dns.com` (Vercel), `api` CNAME `sloverb-import.onrender.com` (Render custom domain, verified 2026-11-10). The old `api` A record to `192.142.10.5` was the original app's Ultahost server, which Umair no longer uses. |
| Worker | `~/Library/Application Support/Sloverb Worker/` and `~/Library/LaunchAgents/app.sloverb.worker.plist` on Umair's Mac | Runs a copy of `backend/` taken at install time. See `docs/mac-worker.md`. |

## Commands

- `npm run dev` dev server on 5190
- `npm test` the speed check, then unit tests for `src/core` and `src/imports`
- `npm run check:speed` the speed check on its own (`scripts/check-speed.mjs`, see "Keeping it fast")
- `npm run build` typecheck and build into `dist/`
- `python3 -m venv .venv && .venv/bin/pip install -r backend/requirements-dev.txt` once, then `.venv/bin/python -m pytest backend/tests -q` backend tests
- `curl https://api.sloverb.app/healthz` is the relay up, and is the worker available
- `cat ~/Library/Application\ Support/Sloverb\ Worker/state.json` what the worker on this Mac is doing (battery, paused, jobs done)
- `.venv/bin/python macos/install.py --relay https://sloverb-import.onrender.com --start` install or update the worker. Needed after any change to `backend/` that should reach the Mac. It keeps the key and the pause setting.

## Rules that are easy to break

- The live player and a save both go through `chain()` in `src/audio/chain.ts`, so the file is what was playing. Never add something to one and not the other.
- `src/core` has no browser APIs in it, which is why it can be tested in node. Sums go in `core`, Web Audio goes in `audio`.
- The room is seeded and comes out the same every time. Tests rely on that.
- A sample under the knee passes through `hold()` untouched, so `original` with no reverb is the song as it was, 1 dB quieter. Keep it that way.
- No song files in the repo, and no demo song. `public/local/` is ignored by git, for trying real songs.
- Only the song that is playing is held decoded. The rest of the list waits as files and is decoded when its turn comes, so a long list doesn't run a phone out of memory. Don't cache decoded songs.
- Songs come in through `engine.add([{ file, name }])` and nowhere else, YouTube imports included. With nothing open the first of them plays; with a song open or opening they go on the end of the list and whatever is playing carries on, with a short `added` note. Adding never interrupts the song that is playing.
- Keep the browser's API address on a sloverb.app subdomain (see above). If it ever has to change, the order is: Render custom domain, DNS record, wait for Render to show the certificate, then the Vercel variable, then redeploy.
- The relay and the worker are deployed at different times (Render on push, the Mac only when someone reruns the installer). Keep the job protocol (`"version": 1`) backward compatible, or bump it on both sides together.
- One Uvicorn process on Render, never more. Jobs, rate limits and the replay guard live in that process's memory.
- Never put a secret in a `VITE_` variable, it ends up in the public JavaScript. The worker's private key never leaves the Mac, Render only has the public key.
- YouTube links are checked twice, in the browser (`src/core/youtube.ts`) and again on the server and the worker (`backend/urls.py`). Change both together.
- Error messages a visitor can see are a fixed list (`safe_errors` in `backend/relay.py`, and the `ValueError`s in `backend/extract.py`). yt-dlp's own errors can contain signed URLs and addresses, so never pass them through.

## Known gaps

Found on 2026-11-10 and not fixed yet. Raise them rather than assuming they are settled.

- The rate limit (6 imports an hour per address) may be easy to dodge. Uvicorn runs with `--forwarded-allow-ips='*'`, so it takes the visitor's address from the first `X-Forwarded-For` entry, which a visitor can write. Not tested against Render.
- The worker checks in every few seconds, so the free Render service never sleeps. That uses about 744 of the 750 free hours a month.
- The site only checks `status: ok` from `/healthz`, not `available`, so the YouTube box shows even when the Mac is asleep and the visitor finds out after pressing open.
- Render gives the Mac 270 seconds per job and the Mac's own download limit is 240, which leaves 30 seconds to upload.
- The Docker image still carries Node, FFmpeg and a YouTube token generator that relay mode never uses.

## Checking it works

There is no way to listen from here, so measure. In development the engine is on the window as `sloverb`. From the browser console you can drive it (`sloverb.tune({ reverb: 0.7 })`, `sloverb.seek(30)`), read `sloverb.snapshot()` and `sloverb.position()`, and render through `chain()` in an `OfflineAudioContext` to read levels and peaks.

## Style

Umair's taste. Get this right the first time.

**Look**
- Pitch black, white text, grey for anything secondary. System font. Rounded, soft, frosted. Think ChatGPT on an iPhone.
- One set of colours, the blue, purple and pink of the first sloverb, always as a gradient in that order left to right (`--grad` in `src/styles.css`, and the same three in `src/ui.tsx` for the waveform). It is light on a black page: the wordmark, the waveform behind the playhead, the fills of the sliders and save, the ring round play, the glow in the background. Never a flat coloured block, never a fourth colour.
- The glow in the background follows the music (`Aura` in `src/ui.tsx`). Since 2026-11-12 it is bent for contrast, so quiet parts go nearly dark and loud parts glow, and it eases over about two thirds of a second each way. Umair asked for more movement but for everyone to be comfortable with it, older listeners included, so it must never flicker or flash: keep the easing if you touch it.
- The one exception is the speed slider, which Umair asked on 2026-11-12 to stand out wildly from everything else while still fitting. It uses gold, lime and mint (`#ffc04d`, `#d9ff5c`, `#5cffc0`, `.slide--speed` in `src/styles.css`), each roughly the opposite of the blue, purple and pink above it, as a gradient left to right with a glow that breathes with the music. Nowhere else.
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
- Top to bottom: the song's name, the waveform, the transport, the two sliders with `reset` under them, save. There is no line saying what this version is (`slowed + reverb` and so on): Umair had it removed on 2026-11-12, the sliders already show it. With a song open, the small gradient `sloverb` with a plus in a small circle beside it sits on the bottom line next to `info`, the two centred together. It opens the start screen to add songs, with the song still playing. The plus is there because Umair found nobody would guess the name was the way to add a song. There, the bottom line shows the playing song (three moving bars and its name, `NowPlaying` in `src/ui.tsx`) next to `info`, and pressing it goes back. The start screen is a history entry, like `info`, so a phone's back button and Escape also go back, and picking, dropping or importing a song goes back by itself. `Start` stays mounted, hidden, while the player shows, so a YouTube import keeps going and joins the list when it lands.
- Every change of screen (start, player, the start screen over the player, info) dissolves into the next: the old one fades as the new one comes into focus, 0.2s in all (it was 0.7s until Umair found it slow, taps can't land while it runs). `App.tsx` keeps what should be on screen (`view`) apart from what is (`shown`) and moves between them with the browser's View Transitions, the animation is `::view-transition-old/new(root)` in `src/styles.css`. Browsers without View Transitions, and anyone who asks for reduced motion, get a plain switch. A new screen should be added to `View` so it gets the same treatment.
- On `info` the way out is the plain grey word `back` right under the text, not at the bottom edge, so it is close to whatever was just read. No pill or box round it: Umair wants that page as bare as a plain text blog.
- The player is four groups: the name, the waveform with the transport, the sliders with reset, and save. Space between groups (`--gap`) is always clearly bigger than space inside one (`--gap-s`), otherwise it reads as a list of equal rows. Controls stacked together share a height (`--tall`) and corner radius (`--r-ctl`).
- It has to fit an iPhone or Android browser without scrolling, bars and all. Sizes bend with the height of the screen (`--gap`, `--gap-s`, `--tall` in `src/styles.css`); check 375x553 and 360x640 after touching the layout.
- Nothing may depend on hover, and hover styles live inside `@media (hover: hover)` so they don't stick after a tap.
- Dragging a file in is for a mouse: the drop area on the start screen is hidden on touch screens, and the whole page is the target once a file is over it.

**Speed**
- See "Keeping it fast" at the top of this file. It applies to every change, not only to style.

**Controls**
- As few as possible. Two sliders, `reset`, the transport and save. There is no settings screen.
- The sliders are the only way to change the sound. There were three presets (`slowed`, `original`, `nightcore`), Umair had them removed on 2026-11-12 so that moving a slider is the whole experience. Every visit starts with the song as it was recorded, 1× and 0% reverb (`DEFAULTS` in `src/core/settings.ts`), and `reset` glides both back there and is only visible once one has moved. The settings carry over from one song in the list to the next.
- The speed slider has nothing written on it, no name, no number and no middle mark, on purpose: Umair wants it to feel mysterious, you find out what it does by moving it. It is the biggest control on the page. Its value is still given to screen readers through `aria-valuetext`. The reverb slider keeps its name and percentage.
- The sliders show what they do: the speed one has a sheen running at the song's speed while it plays (a Web Animation whose `playbackRate` is the speed, so no script runs per frame), the reverb one's edge goes soft and glows with the amount, and holding either lifts the light behind the page (`--lift`). Keep that kind of feedback when touching them, it is what makes them feel like more than a form control.
- No floating bars or pills of extras. The only things at the bottom of the screen are the word `info` and, with a song open, the way between the player and the start screen beside it (`.bar` in `src/App.tsx`). There is no `add song` or `youtube link` in the player any more (removed 2026-11-12), adding happens on the start screen.
- The transport is the only place with icons: the song before, play or pause, the song after. The one exception is the small plus beside `sloverb` at the bottom of the player. Everything else is a word.
- Never make anyone configure anything. One save button, one format.
