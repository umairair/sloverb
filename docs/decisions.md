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

One centred column that fits a phone screen without scrolling, the page called `info` (never about), no floating pills, nothing at the bottom but `info` and, with a song open, the small `sloverb` beside it (Umair's call, 2026-11-12), a list of songs you can add to and step through, and the blue, purple and pink gradient from the original. The full rules are the Style section of `CLAUDE.md`, which is Umair's taste and his call to change.

**Revisit if:** Umair asks.

## D5. Decode one song at a time

2026-11-09 · active

Only the song that is playing is held decoded, so a long list doesn't run a phone out of memory.

**Revisit if:** memory stops being the constraint, and only with a measurement on a real phone.

## D6. YouTube imports through a separate server

2026-11-10 · active

Getting audio from a YouTube link needs yt-dlp and FFmpeg, which can't run in a browser. It runs behind a FastAPI service separate from Vercel, because Vercel functions can't return more than 4.5 MB and most songs are bigger. The MP3 goes straight from that service to the browser and enters the player through `engine.add`, like a chosen file. The visitor-facing limits (10 minutes, 20 MB, 6 an hour) keep it small enough for free hosting.

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
