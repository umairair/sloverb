# Decisions

Why sloverb is the way it is. Each entry says what was decided, why, and what would be a good reason to change it. Any of these can be changed by a future agent who understands the reason and, where it's Umair's call, has his agreement.

To change a decision, add a new entry at the bottom, set the old one's status to `replaced by D<n>` with a line on why, and update every doc the change touches. Don't delete old entries: the reasoning is what stops the next agent from undoing something for a reason that was already ruled out.

Status is `active`, `replaced by D<n>`, or `dropped`.

## D1. Rebuild from scratch, keep the original safe

2026-11-09 · active

The original (React, Tone.js, a Flask server for saving) was replaced on `main` by a rebuild. Umair asked for the original to be kept, so it is the branch `original` and the tag `v1-original` at `9a04faa`.

**Revisit if:** never delete those two. Everything else about the rebuild is open.

## D2. Everything about the sound happens in the browser

2026-11-09 · active

Plain Web Audio, no Tone.js, no server for playback or saving. Songs a visitor chooses never leave their device. The live player and the save share one chain (`src/audio/chain.ts`) so the file is what was playing.

**Revisit if:** something can only be done on a server. Keep files the visitor chose on their device either way.

## D3. No songs in the repo

2026-11-09 · active

The original shipped three commercial songs as samples. They were left out because they aren't ours to distribute. A demo song synthesised in code replaced them for a while, and Umair then asked for it to be removed too. `public/local/` is ignored by git for trying real songs locally.

**Revisit if:** there is a song sloverb has the rights to, and Umair wants a sample.

## D4. A phone-first player

2026-11-09 · active

One centred column that fits a phone screen without scrolling, the page called `info` (never about), no floating pills, nothing at the bottom but `info`, `settings` (added by D15) and, with a song open, the small `sloverb` beside them (Umair's call, 2026-11-12), a list of songs you can add to and step through, and the blue, purple and pink gradient from the original, which D15 made one theme of six. The full rules are the Style section of `CLAUDE.md`, which is Umair's taste and his call to change.

**Revisit if:** Umair asks.

## D5. Decode one song at a time

2026-11-09 · active

Only the song that is playing is held decoded, so a long list doesn't run a phone out of memory.

**Revisit if:** memory stops being the constraint, and only with a measurement on a real phone.

## D6. YouTube imports through a separate server

2026-11-10 · active

Getting audio from a YouTube link needs yt-dlp and FFmpeg, which can't run in a browser. It runs behind a FastAPI service separate from Vercel, because Vercel functions can't return more than 4.5 MB and most songs are bigger. The MP3 goes straight from that service to the browser and enters the player through `engine.add`, like a chosen file. The visitor-facing limits (10 minutes, 20 MB, and until 2026-11-12 6 an hour, which Umair had switched off for now) keep it small enough for free hosting.

**Revisit if:** the limits get in the way of real use, or a better source of audio comes along.

## D7. Downloads on Umair's Mac, Render only relays

2026-11-10 · active

YouTube refused real downloads from Render's addresses in both regions tried, even with proof-of-origin tokens. A home connection is accepted, so a worker on Umair's Mac does the download and Render only passes jobs and MP3s between the browser and the Mac. The Mac only makes outgoing, signed requests (Ed25519, key stays on the Mac), so nothing on the internet can connect to it. It pauses at 10% battery, and imports are offline whenever the Mac is asleep. Render stays on the free plan.

**Revisit if:** the Mac being on is too limiting, YouTube starts blocking the home connection, or a host is found that YouTube accepts. The relay can run downloads itself again by removing `WORKER_PUBLIC_KEY`.

## D8. The YouTube controls only appear when there's somewhere to send them

2026-11-10 · active

The controls appear only when the build has `VITE_IMPORT_API_URL`. They were kept hidden until a real import had worked through the deployed system, and clearing the variable and redeploying hides them again.

**Revisit if:** the site should show imports as unavailable instead of hiding them.

## D9. The browser reaches the relay at api.sloverb.app

2026-11-10 · active

Ad blockers blocked requests to `sloverb-import.onrender.com` from sloverb.app (Chrome: `net::ERR_BLOCKED_BY_CLIENT`), so Umair's own imports failed. The relay got a custom domain under sloverb.app, which blockers leave alone. The Mac worker still uses the `onrender.com` address, since no blocker is in its way.

**Revisit if:** the relay moves host. Keep whatever replaces it on a sloverb.app subdomain.

## D10. The documentation is kept true with every change

2026-11-10 · active

Umair asked that every change from now on keep the docs current, so any future agent can understand the whole project from the repo alone, and that this never be forgotten. The rule is at the top of `CLAUDE.md`, a CI job checks that code changes come with doc changes, and decisions are recorded here so they can be changed knowingly.

**Revisit if:** the check gets in the way more than it helps. Change how it's enforced, not whether the docs are kept true.

## D11. Sliders only, no presets

2026-11-12 · active

Umair asked for the `slowed`, `original` and `nightcore` presets to go so that the two sliders are the only way to change the sound, and for that to feel magical: someone puts in a song they love and hears it change under their finger. The sliders got feedback that shows what they do to the sound (a sheen at the song's speed, a soft glowing edge for reverb; a glow and a lift of the background light while one was held were removed later the same day, Umair found them icky), and a `reset` that glides both back to where they started. On the same day the starting point was changed from 0.80× and 40% to the song as recorded, 1× and 0%, so the first thing anyone hears is their song unchanged and the slider is what transforms it. The speed slider then lost its name, number and middle mark and got its own colours, see D13.

**Revisit if:** Umair asks. If people miss a one-tap nightcore, a gesture on the slider is a better fit than bringing the buttons back.

## D12. Adding songs happens on the start screen, and never interrupts

2026-11-12 · active

Umair asked for `add song` and `youtube link` to leave the player in favour of a tasteful way back to the start screen that keeps the song playing, with anything added there queued. `sloverb` at the bottom of the player opens the start screen, the playing song at the bottom of the start screen goes back, and `engine.add` only starts a song when nothing is open. Before this, adding a song switched to it at once, and `sloverb` stopped everything and emptied the list.

**Revisit if:** people want a song to play straight away, or to clear the list without reloading. Either is a small addition to `engine.add` or the start screen, not a reason to bring buttons back into the player.

## D13. The speed slider is mysterious and in its own colours

2026-11-12 · active

Umair asked for the speed slider to say nothing about itself, no name and no number, to be more prominent, and to be in colours wildly different from the rest of the page that still go with it, all so that it feels magical. It is now the biggest control, in gold, lime and mint (the rough opposites of the blue, purple and pink) with a glow that moves with the music. This is the one place the "never a fourth colour" rule in `CLAUDE.md` does not hold.

**Revisit if:** Umair asks, or people can't work out what it does. A hint inside the slider that fades out after the first move would fit better than bringing the word back.

## D14. Instant before pretty, without giving up pretty

2026-11-12 · active

Umair found the site lazy after a run of visual additions (a 0.7s screen transition, 0.2 to 0.6s hovers, glows that trailed a finger) and asked for every interaction to be extremely snappy without losing how it looks. Every effect was kept and made cheap instead: short transitions, nothing restyling the whole page per frame, glows faded rather than repainted, and no constantly redrawn blurs. The rules are in "Keeping it fast" at the top of `CLAUDE.md`, and Umair asked that every future change by any agent be held to them, so `scripts/check-speed.mjs` enforces what it can in `npm test` and CI.

**Revisit if:** never in the direction of slower. A new effect has to fit those rules, or it doesn't go in.

## D15. A settings page for the look: glow and themes

2026-11-12 · active

Until now the style rules said there was no settings screen, nothing to configure, and one set of colours. Umair asked for `settings` next to `info` in the same type, with a way to turn the glow that moves with the music down or off, and new themes: a light one where the effect is dark instead of bright, an extremely minimal one, and some in other colours. So `settings` holds one slider, `glow`, which goes down to `off`, and six themes: `default` (how it always looked, and still the default), `light`, `minimal`, `ember`, `ocean`, `forest`. The choice is kept on the device in `localStorage`.

Choices made along the way, all open to change:

- The glow setting is one slider with `off` at the bottom of it rather than a slider and a switch, because Umair's rule of as few controls as possible still holds.
- It scales everything that moves with the music (the light behind the page, the play button's halo, the speed slider's glow), not only the background, so `off` means nothing pulses. The steady glows stay.
- Every colour became a variable in one block of `src/styles.css`, so a theme is a short list of values and adding one touches no other rule. The page wears a theme as one attribute set once, which keeps to the speed rules (D14).
- Words on the sliders and save are drawn twice, over the bare part and inside the colour, so they read on a light page and on bright fills. Without that, white words vanish on a light slider and on lime or amber.
- `settings` has no background, so the light is visible behind it while the slider moves, and with nothing playing the light breathes slowly there so the slider has something to show. Umair removed lights that came up when a slider was pressed (D11), which is why this one does not answer a press: it is on for as long as the page is open and silent. He has not seen it yet, so it is the first thing to drop if he dislikes it.
- The theme names and the three coloured themes were the agent's pick, Umair asked for "cool ones that are different colours" and left the rest open.

**Revisit if:** Umair asks. More themes are cheap to add. Options that are not about the look do not belong on this page (see Controls in `CLAUDE.md`).

## D16. Each song keeps its own speed and reverb

2026-11-12 · active

Umair asked for every song in the list to have its own state for speed and reverb, so that adjusting one, moving on and coming back finds it the way it was left. Before this there was one pair of settings that carried over from song to song. Now the settings live on each song and the sliders show those of the one playing.

Umair did not say what a song that has never been touched should start with. It starts as recorded, 1× and 0%, rather than taking on whatever the last song had, because that matches D11: the first thing anyone hears of a song is the song unchanged, and the slider is what transforms it. The cost is that someone who slows one song and lets a list play hears the next one at normal speed.

**Revisit if:** people want a whole list slowed at once. Then a fresh song could take the settings of the song before it the first time it comes on (set `settings` in `load()` in `src/audio/engine.ts` instead of in `add()`), and still remember its own from then on. Settings are not kept between visits, the list isn't either.

## D17. Everything is centred on the middle of the screen

2026-11-12 · active

Umair asked for everything to be aligned and centred, the player above all, and for a full sweep of size, shape, spacing and how the parts work together across every state, flow and screen size. Every screen was measured at nine sizes (`scripts/layout-audit.js` is what did the measuring, and is kept for next time). What was found and changed:

- The start screen and the player were centred in the space above the bottom line, about 20px above the true middle on phones, while `info` and `settings` were on the true middle, and above 800px tall a fixed 48px was added to fake it. Now every screen is on the same middle, at every height, and gives way gracefully when there is no room.
- `info` had its own column width (520px) and side padding (24px). Every screen now shares one column and one side margin.
- The space under the sliders was 1.6 times the space above them, to hold `reset`, which left an uneven hole whenever `reset` was hidden. The same space is now above and below.
- The count between the times was only centred when both times were the same width. The words on a slider were 26px in on the left and 20px on the right. `back` had uneven padding. All made even.
- Starting or failing an import changed the height of the start screen and made it jump. The toast covered `save` on short phones. Both moved out of the way.
- A phone on its side had to scroll. It gets two columns.

Left alone on purpose: the three shapes in the player (speed's large rounded corners, reverb's smaller ones, save as a full pill) are each proportional to their height and mark what they are, and the bottom line is centred as a group rather than word by word.

**Revisit if:** Umair asks, or something new is added. Whatever is added goes in the one column and must not change the height of a centred screen when it comes and goes (see Layout in `CLAUDE.md`).

