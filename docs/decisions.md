# Decisions

Why sloverb is the way it is. Each entry says what was decided, why, and what would be a good reason to change it. Any of these can be changed by a future agent who understands the reason and, where it's Umair's call, has his agreement.

To change a decision, add a new entry at the bottom, set the old one's status to `replaced by D<n>` with a line on why, and update every doc the change touches. Don't delete old entries: the reasoning is what stops the next agent from undoing something for a reason that was already ruled out.

Status is `active`, `replaced by D<n>`, or `dropped`.

## D1. Rebuild from scratch, keep the original safe

2026-11-09 · active

The original (React, Tone.js, a Flask server for saving) was replaced on `main` by a rebuild. Umair asked for the original to be kept, so it is the branch `original` and the tag `v1-original` at `df90d53`.

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

2026-11-10 · replaced by D23: the downloads stay at home with Render only relaying, but on an always-on Windows PC instead of the Mac

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

2026-11-12 · active for the page itself, its six themes replaced by D18 on 2026-11-14. Umair renamed the page from `settings` to `themes` on 2026-11-14, and this record and the ones after it keep the name it had when they were written

Until now the style rules said there was no settings screen, nothing to configure, and one set of colours. Umair asked for `settings` next to `info` in the same type, with a way to turn the glow that moves with the music down or off, and new themes: a light one where the effect is dark instead of bright, an extremely minimal one, and some in other colours. So `settings` holds one slider, `glow`, which goes down to `off`, and six themes: `default` (how it always looked, and still the default), `light`, `minimal`, `ember`, `ocean`, `forest`. The choice is kept on the device in `localStorage`.

Choices made along the way, all open to change:

- The glow setting is one slider with `off` at the bottom of it rather than a slider and a switch, because Umair's rule of as few controls as possible still holds.
- It scales everything that moves with the music (the light behind the page, the play button's halo, the speed slider's glow), not only the background, so `off` means nothing pulses. The steady glows stay.
- Every colour became a variable in one block of `src/styles.css`, so a theme is a short list of values and adding one touches no other rule. The page wears a theme as one attribute set once, which keeps to the speed rules (D14).
- Words on the sliders and save are drawn twice, over the bare part and inside the colour, so they read on a light page and on bright fills. Without that, white words vanish on a light slider and on lime or amber.
- On `light` the glow was first made dark ink that deepened with the music, which is what "the effect is dark instead of bright" was taken to mean. On 2026-11-14 Umair asked for it to be the same colour as on `default`, so it is now `default`'s blue, purple and pink on the paper (`--a1` to `--a3` in the `light` block of `src/styles.css`). How strong it gets (`--aura`, 0.3 on `light`) was left alone.
- `settings` has no background, so the light is visible behind it while the slider moves, and with nothing playing the light breathes slowly there so the slider has something to show. Umair removed lights that came up when a slider was pressed (D11), which is why this one does not answer a press: it is on for as long as the page is open and silent. He has not seen it yet, so it is the first thing to drop if he dislikes it.
- The theme names and the three coloured themes were the agent's pick, Umair asked for "cool ones that are different colours" and left the rest open.

**Revisit if:** Umair asks. More themes are cheap to add. Options that are not about the look do not belong on this page (see Controls in `CLAUDE.md`).

## D16. Each song keeps its own speed and reverb

2026-11-12 · active

Umair asked for every song in the list to have its own state for speed and reverb, so that adjusting one, moving on and coming back finds it the way it was left. Before this there was one pair of settings that carried over from song to song. Now the settings live on each song and the sliders show those of the one playing.

Umair did not say what a song that has never been touched should start with. It starts as recorded, 1× and 0%, rather than taking on whatever the last song had, because that matches D11: the first thing anyone hears of a song is the song unchanged, and the slider is what transforms it. The cost is that someone who slows one song and lets a list play hears the next one at normal speed.

**Revisit if:** people want a whole list slowed at once. Then a fresh song could take the settings of the song before it the first time it comes on (set `settings` in `load()` in `src/audio/engine.ts` instead of in `add()`), and still remember its own from then on. Settings are not kept between visits, the list isn't either.

## D17. Everything is centred, with equal room above and below

2026-11-12 · active

Umair asked for everything to be aligned and centred, the player above all, and for a full sweep of size, shape, spacing and how the parts work together across every state, flow and screen size. Every screen was measured at nine sizes (`scripts/layout-audit.js` is what did the measuring, and is kept for next time). What was found and changed:

- The start screen and the player were centred in the space above the bottom line on phones, while `info` and `settings` were on the middle of the whole screen, and above 800px tall a fixed 48px was added that put the player on the middle of the whole screen too. The first fix put every screen on the middle of the whole screen. That was wrong and was changed within hours: on Umair's MacBook it left about twice as much room above the player as between it and the bottom line (109px and 53px at 1440x790), because the bottom line fills the foot of the screen. The rule now is that the room above equals the room down to the bottom line, at every height, which is what phones had all along, and `info` and `settings` keep the bottom line's place empty so they share the same centre line.
- `info` had its own column width (520px) and side padding (24px). Every screen now shares one column and one side margin.
- The space under the sliders was 1.6 times the space above them, to hold `reset`, which left an uneven hole whenever `reset` was hidden. The same space is now above and below.
- The count between the times was only centred when both times were the same width. The words on a slider were 26px in on the left and 20px on the right. `back` had uneven padding. All made even.
- Starting or failing an import changed the height of the start screen and made it jump. The toast covered `save` on short phones. Both moved out of the way.
- A phone on its side had to scroll. It gets two columns.

Left alone on purpose: the three shapes in the player (speed's large rounded corners, reverb's smaller ones, save as a full pill) are each proportional to their height and mark what they are, and the bottom line is centred as a group rather than word by word.

Amended 2026-11-14, when Umair asked for `back` and the bottom line to be checked again. Two things from the sweep above were not right. `back` had been centred as arrow and word together, which is even as a shape but puts the word off the line that every other word on `info` sits on, and it was reasoned that the word is what the eye lines up, so the word was put on the centre line with the arrow hanging before it, like the dash before the name. That was wrong and was undone the same day, see D21. And the bottom line was centred as a row of boxes, while what is drawn in the first and last box starts and ends at different distances inside them, so with a song open it sat between half a pixel and three pixels to one side. It is now centred by what is drawn. The bottom line is still centred as a group and not word by word, so with only `info` and `themes` on it the gap between them is not on the centre line, because the two words are not the same width.

**Revisit if:** Umair asks, or something new is added. Whatever is added goes in the one column and must not change the height of a centred screen when it comes and goes (see Layout in `CLAUDE.md`).

## D18. Two themes, and a glow chosen apart from them

2026-11-14 · active · replaces the six themes of D15

Umair asked for the theme system to be reworked: only a dark theme and a light theme, a plethora of glow effects to pick between, and the glow itself made cooler and more prominent while keeping to the feel of the site. Until then there were six themes (`default`, `light`, `minimal`, `ember`, `ocean`, `forest`) and the colours came with the theme, so a light page could only ever be blue, purple and pink.

What it is now: the look is `{ theme, glow, amount }`. The theme is `dark` or `light`. The glow is one of nine, `classic`, `vapor`, `sunset`, `ember`, `aurora`, `ocean`, `forest`, `rose`, `mono`, and any of them goes with either theme. `amount` is what the `glow effect` slider always set.

Choices made along the way, all the agent's and all open to change, Umair has not seen them yet:

- A glow colours everything that is light, the wordmark, the waveform, the sliders, save, not only the background. The other reading was that only the background changes, but then an orange glow would sit behind blue, purple and pink sliders, which breaks the rule of one set of three colours on a page.
- Each glow has its own shape and motion as well as its own colours, so that nine choices are nine different effects and not nine swatches. They are all the same kind of thing, soft lights in three colours, so they stay within the feel of the site: nothing hard edged, nothing that flashes.
- The names are one plain word each. `classic` is the blue, purple and pink of the first sloverb, `mono` is what `minimal` was. `default` went back to being called `dark`, since with two themes the pair reads as `dark` and `light`.
- More prominent means brighter at the loudest (`--aura` 0.78, was 0.42), lights that grow with the music as well as brighten, and shapes that reach across the page instead of staying in the corners. It still follows the same eased level, so it swells and never flickers (see the glow bullet in `CLAUDE.md`), and a silent page is still pitch black.
- The brightest glows (`aurora`, `forest`, `rose`, `mono`) are held a little lower so words over them stay readable, and grey words became the page's words let through part way so they lift with the glow.
- It keeps to D14. Each light is one element drawn once, and only `transform`, `scale` and `opacity` change. There are at most four of them, and each is smaller than the three that were there before on a phone.
- `settings` shows each glow as a small still of itself rather than a strip of its colours, because the shape is half of what is being chosen.
- What devices had kept is read into the new look rather than thrown away (`readLook` in `src/core/look.ts`).

**Revisit if:** Umair asks. Glows are cheap to add or drop (see the Look section of `CLAUDE.md` for the steps). If any glow is too much or too little, `--aura` in its block is the one number, and `--aura` in the first block and in `light` moves all of them.

## D19. The glow dances to the music

2026-11-14 · active

After the glows of D18 were built, Umair asked whether they react to the music. They only followed how loud it was, smoothed over two thirds of a second, so they showed a verse and a drop but not a beat. He said the glow needs to react and dance to the music.

What was done: the engine measures three parts of the song each frame as well as its loudness, low, middle and high, and each light of a glow listens to one. When its part rises above what it has been doing lately the light jumps and settles, up in a twentieth of a second and back in a quarter. Each glow jumps in its own way (see the glow bullets in `CLAUDE.md`).

Choices made along the way, the agent's and open to change, Umair has not seen it move yet:

- It dances by moving, not by flashing. The earlier rule, that the glow must be comfortable for everyone and never flicker, was Umair's and he did not withdraw it. So a hit swells and shifts a light by up to about a tenth of the screen and raises the brightness of the page by 12% at most, and the slow swell of brightness is unchanged.
- A hit is measured against the song's own movement rather than a fixed amount. With a fixed amount a loud, dense song pinned the low end at full and nothing moved, and a sparse one hit full on every beat. Tried and measured on made-up songs of both kinds, at normal speed, slowed with reverb, and sped up.
- Three parts, not one beat detector. Finding the tempo of a song is fragile, and slowed songs with a lot of reverb have soft beats. Three envelopes always show something true about the music, and give the three lights different things to do.
- The speed of the slow drift does not follow the music. It was considered and left out: changing the rate of a running animation several times a second is the kind of cost D14 warns about, for an effect that is hard to see.
- On `settings` with nothing playing, the glow dances to a quiet made-up beat so each glow shows what it does.
- Less motion asked for on the device means no dance, only the swell.

Not checked: it has only been seen against made-up songs in a browser with no screen, at half the frame rate of a phone. How it feels against real songs on a real phone, and whether the jumps are the right size, is for Umair to judge. If it is too much or too little, `--swell`, `--jx` and `--jy` in `.aura` in `src/styles.css` are how far a light moves, and `COUNTS` and `FULL` in `src/core/dance.ts` are how big a rise has to be to count and to land in full.

Amended the same day. Umair tried it on the live site and said it was good but could be more on-beat. Four things were changed, and the bullets above are as first written:

- Every light moves on the kick together, and keeps a part of its own on top. With one light per part, only a third of the page moved on the beat.
- A hit is found by how fast a part is rising rather than how far it is above its average, and lands in the frame it is found instead of easing up over a few. The first way trailed the beat.
- Only the real beats count: a rise has to clear where that part has been sitting, and is measured against the biggest rise lately. On a made-up loud, dense song the first way hit between the beats as often as on them, because the bass ducking under each hat and coming back up read as a kick.
- The light waits for the sound to leave the speaker, by what the browser reports. On wireless headphones the picture was otherwise a fifth of a second early.

Amended again the same day, and this one matters more than the rest. The on-beat version above was pushed to the live site without ever having been watched in motion, only measured for timing, and Umair's report was that it was giving epilepsy. It moved every light in one frame on every kick and hat, hats included at eight or ten a second, and raised the brightness with each. That is how a strobe behaves and it should not have shipped. What it is now: a hit never changes the brightness, lights ease to a hit over a tenth of a second and settle over nearly half, no part can hit more than about three times a second, and the moves are about half the size. The beat is still found the same way, so it is still in time. The lesson for anything that moves with the music: timing can be measured, comfort has to be seen, and when it cannot be seen from where the work is being done, start gentle and let Umair ask for more.

Following the tempo and pulsing on a grid was considered again and left out for the same reason as before. It is the next thing to try if this is still not tight enough on real songs.

**Revisit if:** Umair asks.

## D20. A first visit is light, in rose

2026-11-14 · active

Umair asked for `light` with `rose` to be the default for everyone, after trying the glows of D18 on the live site. Until then a first visit was `dark` with `classic`, as sloverb had looked since the first version.

What "everyone" was taken to mean: everyone who has not chosen. A look is only kept on a device once someone changes something on `themes`, so the new default reaches every first visit and every returning visitor who never touched it. Someone who picked a look keeps it, and so does a device still holding a look from before D18, all of which were chosen while dark was the default and stay dark (see the look bullet under "Rules that are easy to break" in `CLAUDE.md`). Overriding what people chose was the other reading and was not done. If Umair meant that, it is a small change in `readLook`, and it cannot be undone for the people it overrides.

The stylesheet still writes `dark` with `classic` first and has every other look say where it differs. Only `LOOK` in `src/core/look.ts` and the script and `<meta>` tags in `index.html` changed, so a page never opens black and then turns to paper.

The tab icon was left blue, purple and pink on black that day, as the mark of the site rather than of the look that is on. Umair changed that on 2026-11-16, see D22.

With `light` and `rose` as what everyone sees first, Umair said the same day that `rose` looked much better on dark and drowned out on light. It was: pale pink over paper is close to no colour at all. The glow on `light` was made stronger for every glow (`--aura` 0.62 to 0.88) and `rose` on `light` was given hotter versions of its own three colours at full strength. The colours of its sliders, save and wordmark were left alone.

**Revisit if:** Umair asks.

## D21. Lines are centred whole, and everything is measured against everything

2026-11-14 · active

That morning `back` on `info` had been changed so that its word was on the centre line and its arrow hung out to the left (the amendment to D17). Umair sent a screenshot of it from his laptop and asked whether it really looked okay, and then for everything to be aligned in relation to everything across the whole app. It did not look okay: the eye reads the arrow and the word as one shape, and that shape sat to the left of `linkedin` and `Umair` above it.

The rule that came out of it: every line, row and group is centred as one whole thing by what is drawn of it, and no part of it is centred alone with the rest hung off its side. `back` and `- Umair` went back to being centred whole.

Then every screen was measured, by where the ink is and not where the boxes are, at eighteen sizes in both themes, by four passes that each had a second pass try to refute what the first found. What was wrong and is now right:

- A laptop window around 500px tall, 967x507 on Umair's MacBook, was never in the list of sizes to check. The player was 21px taller than it, so the bottom line was cut off, and `themes` scrolled by 30px. The player gives up some of its waveform and the room round its sliders between 500 and 540px tall, and `themes` closes the gaps it could spare. Making the player two columns there was the other way and was not taken: every other screen in that window is the one 440px column.
- `back` was a 48px button for the sake of a finger, and the empty half of it under the word counted as part of the page, so everything on `info` and `themes` sat 7 to 9px high and both pages were 26px taller than what was drawn on them. It is now as tall as its word, with the room to press as a layer under it.
- The ring round the chosen tile on `themes` was outside the tile, so that tile was 10px wider than the others and stuck out of the column. It is a line on the tile's own edge now. This changes how chosen looks, slightly, and is the one thing in this sweep that is taste as much as alignment.
- On a phone on its side: `info` scrolled, having been left out of the rules for that shape. On `themes` the two theme tiles floated half way up the right-hand side at a height that matched nothing, with `back` under them far to the right of the middle. The player's left column started and ended 22px inside its right one. All three are now level, and `back` is in the middle.
- Smaller things: the big `sloverb` 2px right of the middle because of its tight letters, two slider grips 3px out of line at the same end, the bars beside the playing song's name 2px under the line its words stand on, a name nearer the tile under it than its own on `themes`, `or` not half way between the button and the link box on a phone, the keyboard's ring inside the link box and to one side of it.
- An import's error could be two lines, and on a short screen the second was printed over `info` and `themes`. It is one line always, and the one message that was too long for that was reworded from `couldn't reach imports, an ad blocker or the network may be stopping it` to `an ad blocker may be stopping imports`. The wording is Umair's to change, it only has to fit (see Layout in `CLAUDE.md`).

Left alone on purpose, each looked at and found to be as intended: `back` is at a different height on `info` than on `themes`, because each page centres what it holds. `info` and `themes` have more room under them than above, because they keep the bottom line's place empty (D17). `info` and `themes` on the bottom line move left and right between screens, because the line is centred whole. The three shapes of the pills in the player (D17). A waveform's bars stop up to 2px short of the column's edges, because they are whole pixels wide. A song's name can be a pixel right of the middle, which depends on its letters.

Not measurable from here: the browser that did the measuring draws Inter where a Mac or iPhone draws San Francisco, so anything that depends on the shape of letters can differ by about a pixel there, top to bottom. Left to right nothing depends on the font. A phone on its side narrower than 640px (568x320) still gets one column and scrolls, on every screen, as it did before.

**Revisit if:** Umair finds the line round the chosen tile too quiet, or the two tall theme tiles on a sideways phone not to his taste. The first is one rule (`.pick[aria-checked="true"] .pick__look::after`), the second is the last few rules of the sideways block in `src/styles.css`.

## D22. The tab icon is rose

2026-11-16 · active

Umair asked for a tab icon that reflects the default look, `light` with `rose`, and picked it from five drawn for him. The sound wave is the same five bars round a centre line as before, now in paper (`#f4f3ee`, the `--bg` of `light`) on a rounded tile that runs corner to corner through the hotter pink, pink and peach that `rose` uses on `light` (`--a1` to `--a3` in `[data-theme="light"][data-glow="rose"]`). Until then it was blue, purple and pink bars on black, the colours of `classic` on `dark`, kept on 2026-11-14 as the mark of the site rather than of the look (D20).

The other four kept a paper tile or no tile: pink bars on paper, dark bars with a rose bloom, pink bars with a bloom, and pink bars alone. A solid rose tile was the one that still read on both a light and a dark tab bar, since a paper tile sinks into a light one.

The icon does not follow the look someone has chosen. It is one SVG and the same for everyone, written inside `index.html` until 2026-11-26 and `public/favicon.svg` since. Search engines get it as `public/favicon.ico`, drawn from the SVG, since Google can't fetch an icon written into the page and doesn't list SVG among its favicon formats (D26).

**Revisit if:** Umair asks, or the default look changes again.

## D23. The worker runs on an always-on Windows PC

2026-11-16 · active

Umair moved the worker from his MacBook to an always-on Windows desktop. The Mac only worked while it was awake, logged in and charged, which is what D7 said to revisit. Everything else in D7 stands: YouTube still refuses Render, so downloads happen at home, Render only relays, and the home machine only makes outgoing, signed requests. The relay and the job protocol didn't change.

The PC got its own key, generated there. Copying the Mac's key was the other way, and would have needed no change on Render, but it would have moved a private key between machines and left two workers able to claim jobs. Render holds one public key, so the Mac is refused from now on.

The worker starts at boot from a scheduled task that runs as Umair's account before anyone logs in (S4U, no stored password, not elevated), so a Windows Update restart doesn't take imports down until he signs in. Registering it needs one administrator approval per install. Starting at login would have needed none, and was not taken for that reason.

`backend/worker.py` and `backend/app.py` run on both systems. On Windows a job object stands in for the process group that `os.killpg` kills on the Mac (`backend/winjob.py`), `SetThreadExecutionState` stands in for `caffeinate`, and the battery comes from `GetSystemPowerStatus`. There is no tray icon: `sloverb-worker.cmd status`, `pause` and `resume` replace the menu bar item, which Umair doesn't need on a machine that is never unplugged. See [the worker](worker.md).

**Revisit if:** the PC is retired, YouTube starts refusing the home connection, or a tray icon turns out to be missed.

## D24. Pairs either side of a rule are centred whole, and `back` on info stands under the rule

2026-11-26. Umair asked for a thin upright rule between `info` and `themes` on the bottom line and between `linkedin` and `github` on `info`, and for both to be perfectly centred. The rule was put on the centre line first, with the two words hanging either side, as the gap between `linkedin` and `github` had been since 2026-11-17. On the live site he said neither looked centred with the whole picture: with one word longer than the other, each pair looked shifted towards its longer word. So each pair is centred whole by its ink, as D21 says of every line, and the exception for a pair either side of a gap is gone.

That leaves the rule between `linkedin` and `github` about 5px right of the middle, since `linkedin` is the wider word, and `back`, on the true middle right under it, then looked shifted left: the eye lines it up with the rule above it, not with the screen. Two words of different widths can't have both the pair and the rule on the middle. Shown three ways out side by side (rule on the middle, `back` under the rule, no rule on `info`), Umair chose `back` under the rule. On `info` it sits in the rule's column of the `.info__links` grid with no width of its own, so it follows the rule on any font and any screen. `back` also lost its arrow the same day, at his request, so the word alone could be centred.

**Revisit if:** the words on that line change, or something else is added under the links.

## D25. sloverb meets WCAG 2.2 AA

2026-11-26 · active

Umair asked for the whole app and experience to be made accessible to industry standards. The standard taken is WCAG 2.2 at level AA, with the ARIA Authoring Practices for the custom controls (the sliders, the waveform, the radio groups on `themes`, the two pages that open as dialogs). Everything done for it, and how to check it, is in `docs/accessibility.md`.

Most of it changes nothing anyone sees: names, keyboard keys, where the focus goes after a screen changes, one live region for screen readers, `aria-disabled` on `save` while it works. Three things do show, and each was chosen as the smallest change that met the standard without touching the look:

- The words on a slider, on `save` and in the YouTube import bar are 19px bold, where they were 17 to 18px and medium or semibold. They sit on the glow's own colours, and some of those are too bright for the words on them to reach 4.5:1 (white on `classic`'s blue and pink is about 3.1:1, and dark words on the paler ends of `sunset`, `aurora` and `ocean` on `light` about 3.3:1). Large text, 19px bold, needs only 3:1, which every look reaches. The other ways out were to darken `classic`'s colours, which are the first sloverb's, or to make its words dark, which the style section rules out, so both are Umair's call and neither was taken.
- The `glow effect` slider at `off` now also holds the lights' drift and the wordmark's colours still (`data-still` on `<html>`). WCAG 2.2.2 asks for a way to stop anything that moves on its own for more than five seconds, and before this only the device's reduced motion setting did that.
- In Windows high contrast mode the sliders, `save` and the tiles on `themes` get an edge and a fill in the system's colours, where before they had no shape at all.

**Revisit if:** Umair finds the bolder words on the sliders heavy. Then measure each glow on both themes again: the words can go back to their old size only on a look where they reach 4.5:1, or the glows' colours have to change instead.

## D26. Search engines get words of their own, and the app doesn't change for them

2026-11-26 · active

Umair asked for the whole site to be made as good for search as it can be, without changing much of what anyone sees. sloverb is one page with almost no words, by design (Style in `CLAUDE.md`), and its title, then `sloverb.app`, was his and kept word for word (he agreed to a longer one the same day, D27). So everything done for search is where a visitor doesn't see it, and the screens are pixel for pixel what they were, measured with screenshots of every screen before and after on both themes. What was added, and why each part, is in `docs/seo.md`: a description in the style of `info`, a canonical address, link preview tags and picture, structured data, icons at addresses of their own, `robots.txt` and a sitemap, and a page for when JavaScript is off.

What a visitor can notice: an icon on an iPhone's home screen instead of a picture of the page, a picture and a description when a link to sloverb is shared, and, with JavaScript off, `info`'s words instead of a black page. For that last one the default look moved from the script in `index.html` to the `<html>` tag, since no script runs then.

Chosen against:

- Changing the title or putting a sentence on the start screen. Either would help more than everything above, and both are Umair's to decide, so they were left as they were. He agreed to the title the same day, see D27. The start screen stays without one.
- Drawing the start screen into `index.html` at build time for crawlers that don't run JavaScript. It has almost no words, so it would add a build step and the risk of the page being drawn twice for very little.
- A web app manifest. It makes Chrome offer to install sloverb as an app, which changes how it is used, and it counts for nothing in search.
- Aiming at YouTube downloading searches. Imports run on Umair's PC with no limit per address and carry legal weight, so the descriptions leave them out.

**Revisit if:** Umair wants `info` to be a page of its own at an address search engines count (`/info` rather than `#info`).

## D27. The title carries the words people search for

2026-11-26 · active

The tab read `sloverb.app`, Umair's wording from 2026-11-16, kept word for word under Style in `CLAUDE.md`. Once the rest of D26 was done, the title was the biggest gain left for search, since search engines weigh it more than anything else on a page and it held none of the words anyone looks for. It was put to Umair as `sloverb.app, slowed + reverb and nightcore`, and he asked for it to be done. His words stay first, so the tab still starts with the name, and the rest are the two things sloverb is for, written the way `info` writes them. `+` reads as a space to a search engine, so it matches `slowed reverb` and `slowed and reverb` alike.

A longer title would also have become the name under the icon when someone adds sloverb to a home screen on Android, so `<meta name="application-name" content="sloverb">` keeps that `sloverb`, as `apple-mobile-web-app-title` already did on an iPhone.

**Revisit if:** Umair wants the tab shorter again. Then the words after the comma go, and the title is again the weakest part of sloverb for search.

## D28. A journal of what visitors ask for, kept on the PC and nowhere else

2026-11-27 · active

Umair asked for logs and a lot of analytics on the backend on the Windows PC, to look live at the requests people are making and where from, and to track the songs. Until then nothing was recorded at all: the relay ran without an access log, the worker's log held only crashes, and a failed import left no trace of why.

What it is now: the relay notes each request in memory, the worker collects the notes over its signed channel and writes them to a journal on its own disk with its own account of each download, and `watch`, `stats`, `songs`, `imports` and `dashboard` read it there. All of it is in [the journal](analytics.md).

Choices made along the way, the agent's unless it says otherwise, all open to change:

- **It lives on the PC and nowhere else**, because that is where Umair asked for it, and because it is addresses and what people imported. Render stays without a disk, a database or an access log (D7, D23). The other way, a store on Render or a hosted analytics service, would put visitors' data on someone else's machine for a hobby site.
- **The worker fetches it, nobody sends it.** The PC accepts no connections (D7), so the relay can't push. The worker asks over the channel it already has, and the relay holds the request until there is news, which makes it live without a request every second. A separate endpoint rather than extra fields on `claim`, because a worker from before this would have taken a claim answer with no job in it as a job.
- **Only what the backend already sees.** That is YouTube imports. Songs opened from a device never leave it (D2), and counting them would mean the site reporting on its visitors, which is a different decision and not one to make by the way. The site still runs no analytics script (`docs/seo.md`).
- **Addresses are kept whole.** Umair asked where requests come from, and an address is also what tells one visitor from another and one abuser from everyone else, with no limit per address in force (Known gaps in `CLAUDE.md`). Keeping only a hash or the first three parts was the other way.
- **A city comes from a file on the PC**, not a lookup service, so no visitor's address is sent to a third party. The cost is a 130 MB download by hand every month or two. The country is free either way, from Cloudflare.
- **A job is named by a hash of its id.** The id is a bearer capability (`docs/youtube-import.md`), and the journal is a file that will be opened, printed and one day pasted somewhere.
- **The extractor's real error is kept, on the PC only.** `youtube blocked this import` used to be all anyone knew. The raw message can hold signed links and the PC's address, so it stays out of anything that leaves the machine.
- **The dashboard is a page served to the PC's own browser**, started by hand, on `127.0.0.1`, read-only. It is the one place in this where something listens, and it is not the worker. A page reachable from a phone was the other way, and would have meant either opening the PC to the internet or putting the data on Render behind a password, both ruled out above. If Umair wants to look from elsewhere, remote desktop into the PC is the way that changes nothing.
- **Strangers can't choose how much is written.** Every request ends up on a disk at home, so the relay takes only so many a second past a burst and holds only so many, and a month's file stops at 256 MB.
- **The dashboard looks like sloverb**, lowercase and in rose, since it is Umair's own tool. It is not part of the site, so the Style and speed rules in `CLAUDE.md` don't govern it, but nothing in it breaks them.

Not done, and Umair's to decide: telling visitors (nothing on the site says any of this is kept), how long to keep it (nothing is deleted), and whether local songs should be counted.

Not checked from where it was built: that Render passes Cloudflare's address and country headers through to the app. See Known gaps in `CLAUDE.md`.

**Revisit if:** Umair wants to look from his phone, wants visitors told, or wants less kept. Hashing or shortening addresses is one function, `visitor` in `backend/events.py`. Deleting old months is one loop in `Journal`.

## D29. A refused download is tried again before the visitor hears of it

2026-11-27 · active

While D28 was being built, Umair reported a bug: sometimes a pasted link loads and comes back `youtube blocked this import`, and the same link pasted again right after downloads.

What it is now: when the extractor fails in a way that may not happen twice, the worker runs it again, up to three goes in all, with a pause of a second and a half and then three seconds between them. Each go is a new process. The visitor's bar stays on `downloading` throughout and they are only told if all three fail. It all happens inside the same four-minute deadline as before.

Choices made along the way, the agent's, open to change:

- **It is the second paste, done for them, and not a cure.** Why YouTube refuses and then allows is not known: nothing recorded what yt-dlp said, and YouTube can't be reached from where this was written to find out. Doing by machine what was seen to work by hand was the one fix that could be made without guessing. The journal (D28) now keeps what yt-dlp said on every go that failed, so the cause can be read off the PC after a few days, and a better fix chosen then.
- **A new process for each go, not a loop inside the extractor.** A second paste is a new process, and whatever the first one got wrong (a session, a player it fetched, something it cached) is thrown away with it. A loop inside one process would be less code and might keep the very thing that made it fail.
- **The worker does it, not the site.** The site could have asked again, but each ask is a new job, a new place in the queue and a new line in the journal, and the worker is the one that knows what went wrong.
- **Only what may not happen twice.** A refusal (`sign in`, `403`, `429`, a bot check, a missing token) and anything unexplained get another go. A video that is private, gone or members only does not, nor one our own checks turned away. An age check used to count as a refusal, because it says "sign in"; it is now `that video isn't available`, which is truer and saves two pointless goes.
- **`403` and `429` have to stand alone** to count as a refusal. They were matched anywhere in the message, and a message that names a signed link is full of digits.
- **Three goes.** When YouTube really is refusing, the visitor now waits about three times as long to be told, some twelve seconds instead of two or three when it fails at the first step. Two goes would halve that and catch most of what three do.

**Revisit if:** the journal shows what the first go fails on. If it is one thing (a token, one player client), fix that and keep one retry as a net. If `needed another go` in `stats` stays near nothing, or nearly none of them come good, take the retry out, it is only making refusals slower.

## D30. The import bar follows the time each step takes

2026-11-27 · active

Umair found the YouTube import bar filled almost to the end at once and then waited while the work was done. The cause was a word used twice: the relay calls the PC looking the video up `opening`, and the browser called its own last step, decoding the MP3, `opening` too, at 97% of the bar. So the bar reached 97% within seconds of the PC taking the job, and could not go back.

What it is now: the browser turns the relay's `opening` into `finding`. Each step has a share of the bar in keeping with how long it usually takes (`STEPS` in `src/core/youtube.ts`: about a sixth for finding, under a third for the download, which has real progress, and under a third for converting and sending the MP3, then a tenth for it reaching the browser and opening). A step that reports nothing creeps on through its share, fast at first and ever slower, and never reaches its end, so the bar always moves and never runs ahead of the work.

The words were chosen with Umair the same day: `connecting` for reaching the relay and waiting for the PC (it was `starting` then `queued`), `finding`, `downloading`, `converting`, and `loading` for the MP3 arriving and opening (it was `receiving` then `opening`).

Choices made along the way, the agent's, open to change:

- **Fixed in the browser alone.** The relay and the PC keep the job protocol as it was (`"version": 1`), so nothing has to be deployed to the PC. The browser can't tell converting from sending, which is why `converting` covers both. A `sending` step from the worker would let it, but the relay refuses steps it doesn't know, so the relay would have to go first.
- **Shares and usual times are guesses**, not measured, since the journal's step times (`steps` in `backend/worker.py`) are on the PC. If `stats` shows finding or converting taking much longer or shorter than the numbers in `STEPS`, change the numbers.

**Revisit if:** the bar is seen waiting near the end of a step for long, which means that step's usual time is too short.
