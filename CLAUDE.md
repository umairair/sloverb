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
  - Never set a value that changes every frame on `:root` or `body`, every element would restyle every frame. The music level (`--level`) goes only to elements with the class `hears`. The theme is the one thing set on the whole page, as the attribute `data-theme` on `<html>`, and only at the moment someone picks one.
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

- A change of screen never waits on the browser. `closePage` and `closeAdding` in `src/App.tsx` change what is on screen at once and tidy the history afterwards (`history.back()`, then a check 400ms later that clears the address by hand if the browser didn't go back), and the effect that moves `shown` to `view` falls back to a plain switch if the View Transition hasn't run its callback within 250ms or throws. Before 2026-11-12 both waited: closing called `history.back()` and relied on `popstate`, and the screen only changed inside the transition's callback. On Umair's iPhone, after opening the LinkedIn link in a new tab and coming back, `back` on `info` then did nothing however often it was pressed. Which of the two Safari failed at was never established (it could not be reproduced off the phone), so both are guarded. Keep it that way: anything a person presses must do its job even if the nicety round it fails.
- The live player and a save both go through `chain()` in `src/audio/chain.ts`, so the file is what was playing. Never add something to one and not the other.
- `src/core` has no browser APIs in it, which is why it can be tested in node. Sums go in `core`, Web Audio goes in `audio`.
- The look (theme and glow) is kept in `localStorage` under `sloverb.look`. Three places read that name or the theme list and must agree: `src/look.ts`, the small script in `index.html` that sets `data-theme` before the first paint so a light page never opens black, and `THEMES` in `src/core/look.ts`. Anything unreadable falls back to `default` with all of the glow (`readLook`), and storage being blocked only means the look isn't remembered.
- The room is seeded and comes out the same every time. Tests rely on that.
- A sample under the knee passes through `hold()` untouched, so `original` with no reverb is the song as it was, 1 dB quieter. Keep it that way.
- No song files in the repo, and no demo song. `public/local/` is ignored by git, for trying real songs.
- Only the song that is playing is held decoded. The rest of the list waits as files and is decoded when its turn comes, so a long list doesn't run a phone out of memory. Don't cache decoded songs.
- A song's speed and reverb live on its `Track`, and the engine's `state` only mirrors the one that is playing. Anything that changes them goes through `apply()` in `src/audio/engine.ts`, which writes both, and `load()` puts a song's own settings on before it starts. A `reset` still gliding when the song changes is finished for the song it belonged to rather than carried into the next.
- Songs come in through `engine.add([{ file, name }])` and nowhere else, YouTube imports included. With nothing open the first of them plays; with a song open or opening they go on the end of the list and whatever is playing carries on, with a short `added` note. Adding never interrupts the song that is playing.
- Keep the browser's API address on a sloverb.app subdomain (see above). If it ever has to change, the order is: Render custom domain, DNS record, wait for Render to show the certificate, then the Vercel variable, then redeploy.
- The relay and the worker are deployed at different times (Render on push, the Mac only when someone reruns the installer). Keep the job protocol (`"version": 1`) backward compatible, or bump it on both sides together.
- One Uvicorn process on Render, never more. Jobs, rate limits and the replay guard live in that process's memory.
- Never put a secret in a `VITE_` variable, it ends up in the public JavaScript. The worker's private key never leaves the Mac, Render only has the public key.
- YouTube links are checked twice, in the browser (`src/core/youtube.ts`) and again on the server and the worker (`backend/urls.py`). Change both together.
- Error messages a visitor can see are a fixed list (`safe_errors` in `backend/relay.py`, and the `ValueError`s in `backend/extract.py`). yt-dlp's own errors can contain signed URLs and addresses, so never pass them through.

## Known gaps

Found on 2026-11-10 and not fixed yet. Raise them rather than assuming they are settled.

- There is no limit on imports per address at the moment. It was 6 an hour until 2026-11-12, when Umair hit it himself while testing and asked for it not to count for now (`rate_limit = 0` in `backend/app.py`, where 0 means off). Only three imports can be in flight at once (`capacity`), which is all that stands between a busy visitor and his Mac. If it comes back, know that it was easy to dodge: Uvicorn runs with `--forwarded-allow-ips='*'`, so it takes the visitor's address from the first `X-Forwarded-For` entry, which a visitor can write, and it counted failed and cancelled attempts too.
- The worker checks in every few seconds, so the free Render service never sleeps. That uses about 744 of the 750 free hours a month.
- The site only checks `status: ok` from `/healthz`, not `available`, so the YouTube box shows even when the Mac is asleep and the visitor finds out after pressing open.
- Render gives the Mac 270 seconds per job and the Mac's own download limit is 240, which leaves 30 seconds to upload.
- The Docker image still carries Node, FFmpeg and a YouTube token generator that relay mode never uses.

## Checking it works

There is no way to listen from here, so measure. In development the engine is on the window as `sloverb`. From the browser console you can drive it (`sloverb.tune({ reverb: 0.7 })`, `sloverb.seek(30)`), read `sloverb.snapshot()` and `sloverb.position()`, and render through `chain()` in an `OfflineAudioContext` to read levels and peaks.

## Style

Umair's taste. Get this right the first time.

**Look**
- Out of the box: pitch black, white text, grey for anything secondary. System font. Rounded, soft, frosted. Think ChatGPT on an iPhone. That is the theme called `default`, and it is what every first visit gets.
- One set of colours per theme, always as a gradient of three in the same order left to right (`--c1` to `--c3` and `--grad` in `src/styles.css`; the waveform reads the same three through `looks.paint()` in `src/look.ts`). On `default` they are the blue, purple and pink of the first sloverb, as light on a black page: the wordmark, the waveform behind the playhead, the fills of the sliders and save, the ring round play, the glow in the background. Never a flat coloured block, never a fourth colour within a theme.
- The first theme is called `default`. It was `dark` for a few hours on 2026-11-12 until Umair renamed it, and anything still kept on a device as `dark` reads as `default` (the unknown-name fallback in `readLook`).
- Themes, since 2026-11-12, at Umair's request (D15): `default`, `light`, `minimal`, `ember`, `ocean`, `forest`, picked on `settings` and kept on the device. `light` is paper with dark text, slightly deeper colours, and the glow behind the page turned into its opposite, dark ink that deepens with the music. `minimal` is black and white only, with nothing glowing while it is quiet. `ember` (red, orange, amber), `ocean` (aqua, sky, indigo) and `forest` (lime, green, teal) are `default` in other colours. Every colour in `src/styles.css` is a variable in the themes block at the top of that file and nothing below it names a colour, so keep it that way: a new colour goes in that block, for every theme it differs in. To add a theme, add a block there and its name to `THEMES` in `src/core/look.ts`, nothing else.
- Words on a slider or on save are drawn twice in the same place, once over the bare part (`--over`) and once inside the colour (`--on`), which is cut off where the colour ends. That is what lets them read on a light page and on the brighter themes. Keep both copies if you touch `Slider` or the save button.
- The glow in the background follows the music (`Aura` in `src/ui.tsx`). Since 2026-11-12 it is bent for contrast, so quiet parts go nearly dark and loud parts glow, and it eases over about two thirds of a second each way. Umair asked for more movement but for everyone to be comfortable with it, older listeners included, so it must never flicker or flash: keep the easing if you touch it. How much of it anyone sees is theirs to set with the `glow` slider on `settings`, from all of it down to `off`. That setting scales the level handed to everything with the class `hears`, so at `off` nothing on the page moves with the music, while the glows that are there when it is quiet stay.
- The player rests when the page behind it is dark. Umair found on 2026-11-12 that with nothing playing and the background black, the colours and buttons at full strength were harsh on the eye, while with the glow up they looked right. So a veil of the page's own colour (`.rest` in `src/styles.css`, the last thing in `Player`) lies over the player at up to 30% (`--rest`) and thins as the light comes up, which makes the whole player softer when paused, in quiet parts or with `glow` off, and full strength with the music. It is one layer whose opacity follows `--level`, so it costs nothing per frame. `light` sets `--rest` to 0, paper is never dark. If he wants it softer or stronger, `--rest` is the one number to change.
- The one exception to a theme's three colours is the speed slider, which Umair asked on 2026-11-12 to stand out wildly from everything else while still fitting. It has its own three (`--s1` to `--s3`, used by `.slide--speed` in `src/styles.css`), each roughly the opposite of the page's own: gold, lime and mint (`#ffc04d`, `#d9ff5c`, `#5cffc0`) on `default`, and likewise opposite on every other theme except `minimal`, where it is white. A gradient left to right with a glow that breathes with the music. Nowhere else.
- No emoji. No sharp rectangles.
- Nothing decorative. If it doesn't help someone make their song, it goes.

**Words in the app**
- Lowercase, one or two plain words: `browse files`, `save`, `speed`, `reverb`, `info`, `settings`, `glow effect` (the slider on `settings`, which the docs also call the glow slider; Umair's wording, it was `glow` at first), and a theme's name is one word.
- The button on the start screen says `browse files`, with a song open or not. It said `choose song` and `add song` until 2026-11-12, when Umair asked for words that make it clear you are picking from the files on your own device, and chose this from the usual ones (`upload` was ruled out because nothing leaves the device).
- The button in the YouTube link box says `paste` while the box is empty and `open` once there is something in it (`src/imports/LinkImport.tsx`, added 2026-11-12 at Umair's request). `paste` reads what was copied, and if it is a YouTube video link it goes in the box and starts opening straight away, one press in all. Anything else gets `no youtube link copied` and is not put in the box. If the browser won't let the page read the clipboard the box is focused for a paste by hand, and where it can't be read at all (`navigator.clipboard.readText` missing) the button is `open` as before. Phones may show their own small `Paste` confirmation first, that can't be removed.
- While a YouTube link is being fetched, the box it was typed in becomes a bar of the same size and shape (`.link-import__going`): it fills with the theme's colour as the import goes, a light runs along it the whole time so a slow step still looks alive, and one word in the middle says what is happening (`starting`, `queued`, `downloading`, `converting`, `receiving`, `opening`), with `cancel` under it. Umair asked on 2026-11-12 for it to be clearer that the song is loading while staying minimal; before, it was a line of small grey text. The relay only reports how far the download is, so `importProgress` in `src/core/youtube.ts` gives every step a share of one bar, and the bar never goes backwards. No percentage is written, the bar is the amount. The part still to come shows the same colour dimmed, with a faint line round the whole pill, because on an iPhone's OLED screen a nearly black track disappeared and the bar looked cut off (Umair, 2026-11-12). Anything that sits on black needs to be checked for that: a 7% white fill is invisible there.
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
- `info` has no heading. Umair had the big `sloverb` removed on 2026-11-12 and put the name inside the sentence instead, drawn as the wordmark (the same class, so the same drifting gradient as at the bottom of the player and the colours of whichever theme is on). The sentence is his wording, don't edit it.

**Layout**
- One centred column, built for a phone first and the same on a desktop, only with more room round it. It is the same width on every screen, start, player, info and settings alike (`--col`, 440px, with at least `--side`, 20px, either side, both in `src/styles.css`). Use those two for anything new, never a width of its own.
- Everything is centred left to right on the middle of the screen. Top to bottom, the rule is that the room above whatever is on screen equals the room between it and the bottom line, at every size (D17, as amended the same day). `.screen` is a column of flexible parts: empty room, the thing on screen, and a foot with the bottom line at the bottom of it. The room starts from nothing and the foot from `--foot` (54px: the bottom line's 48px and the 6px under it), and both grow by the same amount, which is what makes the two rooms equal. `info` and `settings` have no bottom line and leave the same `--foot` empty at their foot, so all four screens are centred on one line and nothing shifts between them. The exact middle of the whole screen was tried first and was wrong: the bottom line fills the foot of the screen, so it left about twice the room above the player as below it on a laptop, which Umair saw at once on his MacBook. Before that, phones had the right rule and screens over 800px tall had a fixed 48px added that broke it. Don't use a grid for this: with only a least height a grid sizes its rooms to the bigger one and overflows a short screen. When the screen is too short, the thing never comes closer to the bottom line than `--gap` (a margin on `.bar`). `.bar` has a fixed height of 48px so the foot is always worked out from the same number.
- Nothing that comes and goes may change the height of a centred screen, or all of it jumps. `reset` hangs under the sliders, and `cancel` and an import's error hang under the link box, all positioned so they take no room. The toast (`added`, `can't read that file`) appears on the bottom line, over the words there, because any place above it covers `save` on a short screen.
- `scripts/layout-audit.js` measures all of this. With the dev server running, `await import("/scripts/layout-audit.js")` in the browser console, then `await audit.player()`, `audit.summary()` and `await audit.others()` print where everything is and how far it is from the middle. Run it after touching the layout, at 320x568, 360x640, 375x553, 390x664, 390x844, 768x1024, 1440x900, and on its side at 667x375 and 844x390. `room above` should equal `room down to the bottom line`, `centred on` should be the same number for the start screen, the player, `info` and `settings` at one size, every `off` should be 0, and the page should never be bigger than the screen. Add a laptop window, 1440x790, to that list: it is where an imbalance shows most.
- Top to bottom: the song's name, the waveform, the transport, the two sliders with `reset` under them, save. There is no line saying what this version is (`slowed + reverb` and so on): Umair had it removed on 2026-11-12, the sliders already show it. With a song open, the small gradient `sloverb` with a plus in a small circle beside it sits on the bottom line next to `info` and `settings`, all centred together. It opens the start screen to add songs, with the song still playing. The plus is there because Umair found nobody would guess the name was the way to add a song. There, the bottom line shows the playing song (three moving bars and its name, `NowPlaying` in `src/ui.tsx`) next to `info` and `settings`, and pressing it goes back. To its left is a small play and pause (`MiniPlay` in `src/ui.tsx`, added 2026-11-12 at Umair's request), so the music can be stopped from the start screen: the player's button in miniature, the same glyph inside a thin ring of the three colours that turns while the song plays, with no white disc because that line is meant to be quiet. It is only there, the player has its own button. The line is held to the width of the screen (`max-width` on `.bar`), so a long song name never pushes `settings` off the edge. A name too long for its place slides through it, see `Marquee` under Controls. The start screen is a history entry, like `info`, so a phone's back button and Escape also go back, and picking, dropping or importing a song goes back by itself. `Start` stays mounted, hidden, while the player shows, so a YouTube import keeps going and joins the list when it lands.
- `settings` (`src/screens/Settings.tsx`) is a page like `info`, a history entry at `#settings` that back, Escape and `back` under the themes all close. Top to bottom it is the `glow` slider, the six themes three across, and `back`. Each theme is a small tile painted in its own colours (the tile carries `data-theme`, which is why the theme rules in `src/styles.css` are not tied to `:root`), with its name under it. The page has no background of its own and the screen underneath is hidden rather than covered, so the light behind the page shows through and answers the slider and the themes as they change. With nothing playing there would be nothing to see, so while `settings` is open and no song is playing the light breathes slowly on its own (`looks.showing` in `src/look.ts`, read by `Aura`). No headings, labels or explanations on it.
- Every change of screen (start, player, the start screen over the player, info, settings) dissolves into the next: the old one fades as the new one comes into focus, 0.2s in all (it was 0.7s until Umair found it slow, taps can't land while it runs). `App.tsx` keeps what should be on screen (`view`) apart from what is (`shown`) and moves between them with the browser's View Transitions, the animation is `::view-transition-old/new(root)` in `src/styles.css`. Browsers without View Transitions, and anyone who asks for reduced motion, get a plain switch. A new screen should be added to `View` so it gets the same treatment.
- The way out of `info` and of `settings` is `back` with a thin drawn arrow before it (`Back` in `src/ui.tsx`), grey, centred under everything else on the page, with a little more space above it than between the things above. It stays in the centre column: on 2026-11-12 it was tried at the top left of the page and Umair rejected it at once, everything in sloverb is in one stack down the middle and he should not have to travel to a corner with a mouse or trackpad to go back. Don't put it, or anything else, at an edge or corner. The arrow is an SVG, not a character, so it looks the same everywhere, and it slides a little to the left on hover and press. No pill or box round it: Umair wants `info` as bare as a plain text blog.
- A phone on its side is too short for one column, so under 500px tall and over 640px wide the player is two columns under the song's name, the waveform and transport on the left, the sliders, `reset` and `save` on the right, and the start screen closes up. Both fit 667x375 without scrolling.
- The player is four groups: the name, the waveform with the transport, the sliders with reset, and save. The sliders have the same space above them as below (1.6 times `--gap`, the room `reset` needs), so they stand apart evenly whether or not `reset` is showing; before 2026-11-12 only the space below was that big, which left a lopsided hole on a song nobody had touched yet. The count between the two times is in a three-column grid, so it is in the true middle however wide the times are. Words on a slider are 24px in from each end, the same both sides. Space between groups (`--gap`) is always clearly bigger than space inside one (`--gap-s`), otherwise it reads as a list of equal rows. Controls stacked together share a height (`--tall`) and corner radius (`--r-ctl`).
- It has to fit an iPhone or Android browser without scrolling, bars and all. Sizes bend with the height of the screen (`--gap`, `--gap-s`, `--tall` in `src/styles.css`); check 375x553 and 360x640 after touching the layout.
- Nothing may depend on hover, and hover styles live inside `@media (hover: hover)` so they don't stick after a tap.
- Dragging a file in is for a mouse: the drop area on the start screen is hidden on touch screens, and the whole page is the target once a file is over it.

**Speed**
- See "Keeping it fast" at the top of this file. It applies to every change, not only to style.

**Controls**
- As few as possible. Two sliders, `reset`, the transport and save. Until 2026-11-12 there was no settings screen at all; Umair then asked for one (D15), for how sloverb looks and nothing else: the `glow` slider and the themes. Nothing about the sound belongs there, and it is not a place to park options. Anything added to it should be something a listener would actually want to change about the look.
- The sliders are the only way to change the sound. There were three presets (`slowed`, `original`, `nightcore`), Umair had them removed on 2026-11-12 so that moving a slider is the whole experience. Every visit starts with the song as it was recorded, 1× and 0% reverb (`DEFAULTS` in `src/core/settings.ts`), and `reset` glides both back there and is only visible once one has moved. `reset` is 18px and takes a press anywhere across the middle half of the column, for the full height between the sliders and save: Umair found it small and fiddly on 2026-11-12, people want to reset quickly. Each song in the list keeps its own speed and reverb (`settings` on a `Track` in `src/audio/engine.ts`, D16): the sliders change the song that is playing and no other, a song that hasn't been touched starts as recorded, and going back to one finds it the way it was left. Until 2026-11-12 one pair of settings carried over from song to song. They are kept only for as long as the page is open, like the list itself.
- The speed slider has nothing written on it, no name, no number and no middle mark, on purpose: Umair wants it to feel mysterious, you find out what it does by moving it. It is the biggest control on the page. Its value is still given to screen readers through `aria-valuetext`. The reverb slider keeps its name and percentage.
- The sliders show what they do: the speed one has a sheen running at the song's speed while it plays (a Web Animation whose `playbackRate` is the speed, so no script runs per frame), the reverb one's edge goes soft and glows with the amount. That feedback follows the sound, not the finger.
- A slider reaches 0 and 100% when the finger is still 26px in from its ends (`REACH` in `src/ui.tsx`), and the travel between is stretched to match. Umair found on his iPhone, in a case, that the ends were too close to the edge of the screen to get to (2026-11-12). The sliders look the same and are as wide as before; the colour's edge just runs slightly ahead of the finger towards the ends. The waveform is not treated this way, its playhead stays under the finger.
- Nothing reacts to a press on a slider: no glow, no swelling grip, no light coming up behind the page. Those were tried and Umair removed them on 2026-11-12 as icky and bloated. Don't add press or hold effects to the sliders, or anything that lights up out of nowhere when touched.
- A song's name that is too long for its place slides through it instead of being cut short, in the player's heading and beside the bars at the bottom of the start screen (`Marquee` in `src/ui.tsx`, asked for by Umair on 2026-11-12). It measures whether the name fits, again whenever its place changes size, and only then draws the name twice and moves it with a CSS animation on `transform`: setting off half a second after it appears and then never resting (it rested for a fifth of each trip at first, which Umair found took too long to get going after changing screen), at a pace tied to the size of the letters, fading at both ends, and only while the song plays. A name that fits is left alone and stays centred. With reduced motion a long name gets an ellipsis instead. Use `Marquee` for any other single line that may not fit.
- Song names are cleaned once, in `titleFrom` in `src/core/format.ts`, for files and YouTube titles alike: spaces of every kind trimmed and collapsed, invisible characters removed (zero-width, direction marks, soft hyphens, controls), underscores to spaces, the extension and any real folder path dropped, dashes left hanging at either end removed, accents joined. A slash inside a name is kept, so `AC/DC` survives. Don't use lookbehind in that or any other regular expression, iPhones before iOS 16.4 fail to load the whole page on one.
- No floating bars or pills of extras. The only things at the bottom of the screen are the words `info` and `settings`, in the same grey type, and, with a song open, the way between the player and the start screen beside them (`.bar` in `src/App.tsx`). Three things is as many as fit a 360px phone, so nothing else goes on that line. There is no `add song` or `youtube link` in the player any more (removed 2026-11-12), adding happens on the start screen.
- The transport is the only place with icons: the song before, play or pause, the song after. The exceptions are the small plus beside `sloverb` at the bottom of the player and the small play and pause beside the playing song at the bottom of the start screen. Everything else is a word.
- Never make anyone configure anything to get their song. One save button, one format. `settings` is only for taste, and everything works without ever opening it.
