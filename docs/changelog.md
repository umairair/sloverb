# Changelog

One line for each change a visitor, Umair or a future agent would notice, newest first. Commits have the detail; this is the readable history. Put the date and, where useful, the commit or PR.

## 2026-11-12

- `back` on `info` and `settings` has a thin arrow before it and sits at the top left of the page instead of under the content.
- While a YouTube link is being fetched, the link box turns into a progress bar that fills with colour, with a light running along it and one word for the step it is on, instead of a line of small grey text.
- On the start screen opened from the player, a small play and pause sits beside the playing song at the bottom, a thin ring in the theme's colours that turns while the song plays. A long song name there is now cut short instead of pushing `settings` off a small screen.
- Each song in the list now keeps its own speed and reverb. Changing the sliders only changes the song that is playing, a song added fresh starts as recorded, and going back to an earlier song puts the sliders where they were left for it. Before, one pair of settings applied to whatever was playing.
- The YouTube link box has a `paste` button while it is empty. One press takes the copied link and starts opening it. It turns into `open` once something is typed.
- The button on the start screen says `browse files` instead of `choose song` or `add song`, so it is clear it opens the files on your own device.
- The player is softer when the page behind it is dark. Paused, in a quiet part, or with `glow` off, everything in the player is dimmed by up to 30% and comes back to full strength as the light does, because full colour on pitch black was harsh on the eye. The light theme is unchanged.
- `settings` is new, next to `info` at the bottom of every screen. It has a `glow` slider that turns the light moving with the music down, or all the way to `off`, and six themes: `dark` (as before, and still what a first visit gets), `light` (paper, with the glow as dark ink instead of light), `minimal` (black and white, no glows), and `ember`, `ocean` and `forest` in other colours. The choice is remembered on the device. Every colour in `src/styles.css` is now a theme variable, and words on the sliders and save are drawn so they read on any of them (D15).
- Taking hold of a slider no longer makes anything glow, swell or light up. The sliders only show what the sound is doing.
- Keeping sloverb fast is now a standing rule for every change, at the top of `CLAUDE.md` next to keeping the docs true, in `AGENTS.md` and in the PR template. `scripts/check-speed.mjs` runs first in `npm test` and in CI, and fails a change that adds slow transitions, animates properties that repaint, adds `backdrop-filter` or styles the whole page from script.
- Everything is snappier without looking different. Presses answer in 0.04s and hovers in 0.12s (most were 0.2 to 0.6s), screen changes take 0.2s instead of 0.7s, and play starts straight away after a long pause. Behind the scenes: the music level no longer restyles the whole page every frame, the speed slider's glow and the now-playing bars no longer repaint or relayout every frame, the sliders and save lost a blur that redrew constantly, the speed sheen runs in the browser instead of a script, the reverb glow keeps up with a finger, iPhones show pressed states, and hashed files are cached for a year.
- `sloverb` at the bottom of the player has a small plus in a circle beside it, so it reads as the way to add a song. `back` on `info` is plain grey text again. The background glow now goes nearly dark in quiet parts and follows the music a little more closely, without flashing.
- The speed slider has no name, number or middle mark any more, is the biggest control on the page, and wears its own colours (gold, lime, mint) with a glow that moves with the music. Every visit now starts with the song as recorded, 1× and 0% reverb, and `reset` goes back there. Changing screen now dissolves and refocuses instead of cutting. `sloverb` and `info` at the bottom are bigger, and `back` on `info` is a pill right under the text instead of at the bottom edge.
- The sentence about YouTube downloads and permission is gone from `info`, at Umair's request. It also said "a server" where it is really his Mac, which was listed as a known gap.
- `add song` and `youtube link` are gone from the player. Pressing `sloverb` at the bottom now opens the start screen with the song still playing, and the playing song shows at the bottom there to go back. Songs added while one is open, from the picker, a drop, a paste or YouTube, go on the end of the list instead of cutting in, with a short `added` note. Back, Escape and a reload all do the expected thing. `engine.clear` is gone, nothing empties the list now apart from a reload.
- The presets (`slowed`, `original`, `nightcore`) are gone, the two sliders are the only way to change the sound. A `reset` under them glides both back to 0.80× and 40% and only shows once one has moved. The speed slider now has a sheen that runs at the song's speed, the reverb slider's edge softens and glows with the amount, and holding a slider lifts the light behind the page.
- With a song open, the small `sloverb` moved from the top of the screen to the bottom line next to `info`, and the line under the song's name saying what this version is (`slowed + reverb`, `nightcore`) is gone. The space it freed went to a taller waveform and, on short phones, more room between the parts.
- Player spacing reworked. The four parts of the player (the name, the waveform with the transport, the presets with the sliders, save) are now further apart than the things inside them, so they read as groups instead of ten evenly spaced rows. The small `sloverb` sits at the top of the screen as `info` sits at the bottom. The presets, sliders and save share one height and the presets and sliders share one corner radius (`--r-ctl`). The song's name is now clearly bigger than the wordmark.

## 2026-11-10

- Every change now has to keep the docs current: a rule at the top of `CLAUDE.md`, a `docs` CI check, this changelog, and `docs/decisions.md`.
- `CLAUDE.md`, `README.md` and the import docs now describe the whole system, where it is hosted, troubleshooting and the known gaps (`af599b4`).
- The browser reaches the import relay at `api.sloverb.app` instead of `sloverb-import.onrender.com`, because ad blockers blocked the latter. DNS is a CNAME at Namecheap, and `VITE_IMPORT_API_URL` was changed in Vercel (`fb90020`).
- When no request gets through, the import error now says an ad blocker or the network may be stopping it, after 3 tries instead of 10 (`ef8c1f7`).
- Layout fixes so the import controls and the player footer fit short screens (`969f50d`, `f5ffbfd`).
- YouTube downloads moved to a menu bar worker on Umair's Mac, with Render as a signed relay, and the YouTube controls were switched on for everyone (PR 3, `a996616`, `9f85235`).
- YouTube imports were added with Render doing the downloads, then kept hidden when YouTube refused Render's addresses (PR 2, `205fb39` to `45548c9`).

## 2026-11-09

- sloverb was rebuilt from scratch as a phone-first player that runs entirely in the browser: plain Web Audio, a song list, MP3 save, the `info` page, the original's colours, no sample songs (PR 1). The original is kept as the branch `original` and tag `v1-original`.
