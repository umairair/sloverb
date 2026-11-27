# The journal: logs and analytics

Umair asked on 2026-11-27 for logs and analytics on the worker at home: to watch live what people ask for and where from, and to keep track of the songs (D28 in [decisions](decisions.md)). This page says what is kept, where, how it gets there, how to look at it, and what was left out on purpose.

It covers YouTube imports and nothing else, because that is all the backend ever sees. A song someone opens from their own device never leaves it (D2), so the journal knows nothing about those, and the site itself runs no analytics script (see `docs/seo.md`).

## How it gets home

```
visitor's browser ──► relay on Render ──► an event, held in memory (backend/events.py)
                                             │
worker on the PC ── signed POST /internal/worker/events, which waits up to 20s for news
        │
        ▼
%LOCALAPPDATA%\Sloverb Worker\analytics\events-2026-11.jsonl   (backend/analytics.py)
        │
        ▼
sloverb-worker.cmd watch | stats | songs | imports | dashboard
```

- **The relay only passes it on.** `notice` in `backend/app.py` makes one event for each thing a visitor asks, and `Imports.note` one for each thing that becomes of a job. They sit in a list in memory (`Events` in `backend/events.py`), never on Render's disk and never in its logs, and are gone when the process restarts. Uvicorn's access log stays off.
- **Only the worker can read it**, over the Ed25519-signed channel it already claims jobs with. It says how far it has read (`boot`, the name of this run of the relay, and `after`, the last number it kept), and the relay answers with what came after and forgets what was read. An answer lost on the way is simply sent again. The request waits on the relay until there is something to say, so a visitor's request is on the PC's screen in under a second (0.6s from the request to the dashboard's live list, measured on 2026-11-27 with relay, worker and dashboard on one machine) for about one request every 20 seconds while it is quiet.
- **The worker keeps it**, one JSON object a line, a file a month, in `analytics\` beside its key (`Journal` in `backend/analytics.py`). It adds events of its own to the same file: what the video said about itself, how long each step took, and why a download really failed. On macOS the folder is kept to the person (mode `0o700`). On Windows it has the permissions of the worker's own folder round it instead, because a mode there shut out the very person it was for (see `analytics\` in [the worker](worker.md)).
- **Nobody connects to the PC for any of this.** The worker still only makes outgoing requests.

The relay and the worker are updated at different times, so each works without the other: an older worker never asks for events and the relay's list just stays at its ceiling, and a newer worker that gets a 404 asks again every five minutes. The answer carries `"version": 1`, like the job protocol.

## What is kept

Every line has `at` (seconds since 1970), `kind` and `src` (`relay` or `worker`). Lines from the relay also have `boot` and `seq`, which is how a restarted worker knows where it had got to (`Journal.cursor`).

| `kind` | When | What it carries |
| --- | --- | --- |
| `import.queued` | someone asked for a song and it was taken | the visitor (below), `job`, `video` |
| `import.rejected` | someone asked and was refused | the visitor, `reason` (`imports are offline, try later` and so on), `video` if the link was a real one |
| `import.claimed` | the worker took the job | `job`, `seconds` it waited |
| `import.ready` | the MP3 reached the relay | `job`, `title`, `bytes`, `seconds` since it was asked for |
| `import.failed` | it didn't work | `job`, `error` (the same fixed message the visitor saw), `seconds` |
| `import.fetched` | the browser collected the MP3 | the visitor, `job`, `bytes` |
| `import.cancelled` | the visitor pressed `cancel` | the visitor, `job`, `while` (what it was doing), `seconds` |
| `import.expired` | a finished job was never tidied up by its browser | `job`, `status`, `fetched` |
| `request` | anything else: the site waking the relay, a stranger trying `/wp-login.php`, a refused origin | the visitor, `method`, `path`, `status`, `ms` |
| `job.claimed`, `job.info`, `job.retried`, `job.done`, `job.failed`, `job.stopped` | the worker's own account of a download | `job`, `video`, `title`, and by kind: `channel`, `artist`, `track`, `album`, `category`, `duration`, `views`, `uploaded`; `bytes`, `seconds`, `found`, `download`, `convert`, `upload`, `tries`; `error`, `detail`; `reason` |
| `worker.started`, `worker.stopped`, `worker.paused`, `worker.resumed`, `worker.relay`, `worker.journal` | the worker itself | the yt-dlp version, why it paused, whether the relay answered and what kind of error if not, how many events were lost |

**The visitor** is `ip`, `country` (two letters), `edge` (the airport code of the Cloudflare site that took the request, usually the nearest to them), `agent` (their browser's own description of itself), `language`, `origin`, `referer`, and `forwarded` (the whole `X-Forwarded-For` chain, only when it says something the address doesn't). With the city database installed (below) the worker adds `city` and `region`.

Render's edge is Cloudflare (`server: cloudflare` and a `cf-ray` on every answer from `api.sloverb.app`, checked 2026-11-27), which writes the address it saw in `CF-Connecting-IP` and that address's country in `CF-IPCountry`. `visitor` in `backend/events.py` prefers those to uvicorn's idea of the address, which is the first `X-Forwarded-For` entry and can be written by the visitor (see Known gaps in `CLAUDE.md`).

**`job` is not the job's id.** The id lets anyone holding it read or cancel that job, so it never goes in an event. `tag` in `backend/events.py` is the first ten letters of its SHA-256, the same on the relay and the worker, which is how the two accounts of one import are joined. Paths have ids replaced with `:id`.

## What is never kept

- **What someone typed, unless it is a YouTube video link.** A refused link is recorded as `enter a youtube video link` and nothing more.
- **The browser asking every second whether its song is ready**, the browser tidying up after itself, CORS preflights, Render's own health check, and the worker's own requests. A request to `/internal/` is kept only when it was refused (401), which is either someone trying the door or the PC's clock being wrong.
- **Anything on Render** beyond the few seconds an event waits for the worker.
- **Any of it in this repository**, which is public. `.gitignore` refuses `events-*.jsonl` and `*.mmdb`.

A download that is refused is tried again before the visitor hears of it (D29), and each go that failed is a `job.retried` line with its own `error` and `detail`. `stats` counts them as `needed another go`, with how many of those came good, and the dashboard has `saved by another go`. That count is how to tell whether the retry is earning its keep, and the `detail` on those lines is what will say why YouTube refuses the first go.

`detail` on a `job.failed` or `job.retried` line is the extractor's own account of what went wrong, which can contain signed links and the PC's own address. It is why `youtube blocked this import` can now be diagnosed, and it stays on the PC: `backend/extract.py` hands it to its parent, `Job.detail` holds it, `public()` leaves it out, and the worker sends the relay only the fixed message. Tests in `backend/tests/test_analytics.py` hold all three.

## Looking at it

On the PC, with the same command as `status`, `pause` and `resume`. None needs administrator rights.

```
"%LOCALAPPDATA%\Sloverb Worker\sloverb-worker.cmd" watch
"%LOCALAPPDATA%\Sloverb Worker\sloverb-worker.cmd" dashboard
"%LOCALAPPDATA%\Sloverb Worker\sloverb-worker.cmd" stats --days 7
"%LOCALAPPDATA%\Sloverb Worker\sloverb-worker.cmd" songs
"%LOCALAPPDATA%\Sloverb Worker\sloverb-worker.cmd" imports --days 1
```

- **`watch`** prints each event as it arrives, one line each, after the last twenty. It shows a song from asked to fetched and anything odd on the API. `watch --all` adds every other request, strangers and all.
- **`dashboard`** opens a page in the browser on the PC at `http://127.0.0.1:8377/`: the same live list, totals, columns for each day and each hour of the day, the songs, places, outcomes and devices ranked, other requests, and the latest imports with address, place, device, outcome, time and size. `today`, `7 days`, `30 days` and `everything` at the top set the period for all of it. It runs for as long as its window stays open, and Ctrl+C stops it. `--port` picks another port, `--no-browser` doesn't open one.
- **`stats`**, **`songs`** and **`imports`** print the same sums as text, for everything kept or the last `--days`.
- **`worker.log`** now says what the worker is doing in the same words, with the date: started, paused and why, relay online or offline and why, each job and how it ended. It has no visitor's address in it, only the worker's own side.

On a Mac the commands are the same module run directly, from the runtime folder: `.venv/bin/python3 -m backend.analytics watch --state-directory "$HOME/Library/Application Support/Sloverb Worker"`.

The sums are `Summary` in `backend/analytics.py`, one pass over the events in the order they were written. An import is every line with the same `job`. The relay's word on how it ended is the one that counts, and the worker's own stands in only until it arrives, so a relay from before any of this still gives a usable picture. A job nobody ever said the end of is `lost` after 15 minutes, which is what a relay restart looks like. `visitors` is distinct addresses that asked for a song.

### The dashboard is for the PC only

`backend/dashboard.py` listens on `127.0.0.1`, so nothing off the machine can reach it, answers nothing but GET, and only reads. The worker service itself still listens on nothing. Because any page open in the same browser can make it ask `127.0.0.1` for things, a request is refused unless its `Host` is the dashboard's own address and its `Sec-Fetch-Site`, when the browser sends one, says it came from the dashboard itself. The page is one file, `backend/dashboard.html`, with no libraries and nothing loaded from anywhere.

Titles, browsers and addresses are other people's words. The relay strips control characters and the invisible ones that turn text round (`CONTROL` in `backend/events.py`), the worker does it again to whatever the relay sends (`tidy`), every printed line goes through it once more (`line`), and the page puts everything on screen with `textContent` under a policy that lets no script run but its own. Don't add `innerHTML` to that page, a test fails if the word appears in it. `tidy` also drops anything from the relay it can't make sense of (a kind or a field name that isn't lowercase letters, a time outside the years 2000 to 2100, a value that is a list or an object) and steps past it, so one bad event can neither stop a command nor be sent again for ever. A new kind of event has to be named in lowercase letters and dots, or the worker will drop it.

The charts follow a few fixed rules so they stay readable: one colour (the site's rose, `#e8457a` on paper and `#f06a90` on black, checked for contrast on both), columns from one baseline with thin bars, ranked rows with the figure at the end of each bar, no legend since there is one series, a `table` button beside each chart, and the arrow keys move through a chart the way a mouse does.

## Cities

A country comes free with every request. A city needs a database, and it is looked up on the PC so that no visitor's address is ever sent anywhere:

```
"%LOCALAPPDATA%\Sloverb Worker\sloverb-worker.cmd" geo
```

fetches this month's free city database from DB-IP (`https://db-ip.com`, CC BY 4.0, about 130 MB) into `geo\`, and the worker starts using it within ten minutes (`backend/geo.py`, read with `maxminddb`). Run it again every month or two, addresses move. It is fetched by hand on purpose: the worker itself talks to the relay and to YouTube and nothing else. Any other `.mmdb` city file put in `geo\` works too, the newest one is used. Events from before the file was there keep only their country. When the file and Cloudflare disagree about the country, the city is left out as a guess.

Run for real on 2026-11-27 on Linux: the November file came down as 127 MB, `8.8.8.8` came back as Mountain View, California, US, an IPv6 address worked, private and documentation addresses came back empty, and 2,000 lookups took 15 milliseconds. Not yet run on the PC itself. If it fails there the rest is unaffected, and the address it downloads from is `SOURCE` in `backend/geo.py`.

## Limits

- The relay holds at most 5,000 events, and past a burst of 300 takes at most 5 a second from visitors' requests (`Events`). What becomes of a job is always taken. Anything let go is counted, and the worker writes the count down as `worker.journal`. Every request a stranger makes ends up on a disk at home, and this is what stops them choosing how fast.
- A month's file stops growing at 256 MB (`Journal.LIMIT`).
- Nothing is ever deleted. A busy day is a few hundred kilobytes. To forget a month, delete its file; to forget everything, delete `analytics\`.
- The dashboard reads the whole period each time it sums. That is instant for a hobby site's months and would want a running total at hundreds of thousands of events.

## Things only Umair can decide

- **Visitors aren't told.** An address, a rough place and which video someone asked for are personal data under laws like the GDPR, and sloverb says nothing about keeping them. Server logs like this are ordinary, but a line on `info` or a short privacy page would be the straightforward thing if this is kept for long. `info`'s words are Umair's (Style in `CLAUDE.md`), so nothing was added.
- **How long to keep it.** Forever, at the moment.
- **Songs opened from a device.** They never reach the backend. Counting them would mean the site reporting each one, which changes D2, so it was not done.
