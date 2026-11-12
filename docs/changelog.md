# Changelog

One line for each change a visitor, Umair or a future agent would notice, newest first. Commits have the detail; this is the readable history. Put the date and, where useful, the commit or PR.

## 2026-11-12

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
