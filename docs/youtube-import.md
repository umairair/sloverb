# YouTube imports

## Production architecture

Vercel serves the frontend at `sloverb.app`, and Render serves a job relay at `api.sloverb.app`. YouTube extraction runs on the owner's always-on Windows PC because real downloads were rejected from both Render regions tested. It ran on his Mac until 2026-11-16. The relay accepts signed claims, progress and MP3 uploads from the worker; the worker never accepts inbound connections. See [the worker](worker.md) for installation, power behavior and recovery.

`WORKER_PUBLIC_KEY` in `render.yaml` selects relay mode and pins the worker's Ed25519 public key. Its private key stays in the PC's user-only `%LOCALAPPDATA%\Sloverb Worker` directory. Without the public-key setting, the same backend runs extraction locally for development. The YouTube controls only appear when the frontend is built with `VITE_IMPORT_API_URL`, so if imports ever have to be switched off, clear that variable in Vercel and redeploy.

How this came about (downloads on Render first, then a home worker, then the move to `api.sloverb.app` after ad blockers blocked `onrender.com`) is recorded in D6 to D9 and D23 of [decisions](decisions.md). The first production round trip through the relay was verified on 2026-11-10.

## Hosting

Keep the existing Vercel Git integration and `sloverb.app` domain. Run the relay on one Render Free web service using `backend/Dockerfile`, with the repository root as its Docker context. `render.yaml` declares that setup. No database, paid background worker, persistent disk or object storage is needed.

In Render, link the GitHub repository, choose Docker, set the Dockerfile path to `./backend/Dockerfile`, choose Free, set the health check to `/healthz`, and set `ALLOWED_ORIGINS=https://sloverb.app,https://www.sloverb.app`. Use one instance and one Uvicorn worker. After the initial deployment, set the service's branch to `main` and auto-deploy to **After CI Checks Pass**. The Blueprint uses `autoDeployTrigger: checksPass`.

The browser calls the relay at `https://api.sloverb.app`, a Render custom domain with a CNAME at Namecheap pointing to `sloverb-import.onrender.com`. Ad blockers block requests to `onrender.com` from `sloverb.app`, so keep the API on a sloverb.app subdomain. `VITE_IMPORT_API_URL` holds that address in the Vercel project's Production environment, and changing it needs a redeploy because it is baked in at build time. For Preview deployments, either explicitly allow the exact preview origin in Render and set the Preview variable, or leave imports unavailable there. The worker can keep using the `onrender.com` address.

Every `main` push runs frontend type checking, tests and build, plus Python tests and a Docker build. Vercel's existing Git integration deploys the frontend. Render deploys backend changes after checks pass. The Render build filter restricts builds to backend or deployment files. Keep the JSON job contract compatible across independently timed deployments.

## Troubleshooting

| What you see | Likely cause | What to do |
| --- | --- | --- |
| `an ad blocker may be stopping imports` | The request never got a response. The browser console shows `ERR_BLOCKED_BY_CLIENT` for a blocker. | Check the site calls `api.sloverb.app` (search the built JavaScript for it) and that https://api.sloverb.app/healthz opens without a warning. |
| `imports are offline, try later` | The worker hasn't checked in for 45 seconds: the PC is off, restarting, offline or paused. | Run `sloverb-worker.cmd status` on the PC (see [the worker](worker.md)). |
| `imports are busy, try again` or `too many imports, try later` | Three imports already in flight. The second message is the hourly limit per address, which is switched off (`rate_limit = 0` in `backend/app.py`) since 2026-11-12. | Wait. The limits live in memory and reset when Render restarts. |
| `youtube blocked this import` | YouTube refused the worker's download, three times running. Since 2026-11-27 a refusal is tried again twice before anyone is told (D29), because a link that failed often worked when pasted again. | `worker.log` on the PC, and `watch`, show what yt-dlp actually said on each go (see [the journal](analytics.md)). If it is every import, it usually needs a newer yt-dlp: update `backend/requirements.txt`, then rerun the worker installer. |
| `import expired, try again` | Render restarted or redeployed mid-import, and jobs live only in memory. | Retry. |
| No YouTube box on the site | The build has no `VITE_IMPORT_API_URL`. | Set it in Vercel for Production and redeploy. |
| Wrong certificate on `api.sloverb.app` | Render hasn't issued it yet, or the custom domain was removed. | Check Render's Custom Domains page for the service. |

## Research and practical limits

Checked on November 10, 2026:

- [Render Free](https://render.com/docs/free) supplies 750 instance hours per workspace per month, sleeps after 15 idle minutes and can take about a minute to restart. The client retries health checks while the bar says `connecting`, then creates a job once. Temporary storage is lost on restarts, so missing jobs show a retryable expiry error. Free services also have bandwidth/build allowances and a service-initiated traffic threshold. This is suitable for a small hobby app, not an unlimited or guaranteed production service. Keep paid upgrades off and configure a spend limit if the account has a payment method.
- [Vercel function limits](https://vercel.com/docs/functions/limitations) include a 4.5 MB request/response payload limit. A normal song can exceed that, so the browser receives MP3 bytes directly from Render rather than through a function.
- [Railway pricing](https://railway.com/pricing) offers a small monthly free allowance after its trial. It is an alternative for very low usage, but it does not provide an unlimited free conversion service.
- [yt-dlp's EJS guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS) requires external JavaScript challenge support for YouTube. The image includes Node 24 and the matching EJS dependency from `yt-dlp[default]`, with the Node runtime explicitly enabled. Bare yt-dlp and FFmpeg alone are insufficient.
- [yt-dlp's known issues](https://github.com/yt-dlp/yt-dlp/issues/3766) document IP blocks and sign-in requirements. Successful local extraction does not prove that a specific cloud IP can extract a video. Test an actual import from the deployed service before enabling the feature. No free host can guarantee that YouTube will keep accepting requests from its shared IPs. The app reports a blocked import and keeps local file import available. It does not collect account cookies, use a third-party converter, or attempt private, age-restricted or members-only content.

The Docker image also includes [BgUtils POT Provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider), following the [yt-dlp PO Token guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide). It generates guest proof-of-origin tokens for the `mweb` client, in an on-demand child process. There is no exposed token server and no account-cookie setup. Its source commit and Python plugin are pinned, and its compatible patched dependency lock is stored in `backend/pot-provider`. Local development can opt in with `BGUTIL_SERVER_HOME=/absolute/path/to/bgutil-ytdlp-pot-provider/server` after building the provider as described upstream. Tokens do not guarantee that a hosting IP will be accepted.

yt-dlp is pinned to the version tested in this repository. If YouTube changes extraction, update `backend/requirements.txt` and the provider together, run tests and a real deployed smoke import, and redeploy the image. The HTTP health check confirms service availability, not YouTube extraction availability.

## Resource and privacy boundaries

- Videos only: supported YouTube hosts and strict 11-character video IDs are rebuilt into a canonical watch URL before extraction. Arbitrary URLs, custom ports and playlist-only links are rejected.
- One conversion at a time, at most three active/queued jobs, and no hourly limit per IP since 2026-11-12 (`rate_limit = 0`, it was six). CORS is an origin boundary for browsers, not authentication; the service remains a public, rate-limited API.
- Maximum duration 10 minutes, source download 32 MiB, MP3 20 MiB, extraction deadline four minutes, which covers every go at a download that had to be tried again (up to three, `tries` in `backend/app.py`). Unknown-duration and live videos are rejected before download. Conversion uses 192 kbps MP3 and one FFmpeg thread. The existing browser export remains 320 kbps.
- Job IDs are random 256-bit bearer capabilities. Anyone holding one can read or cancel that job. Access logs are disabled to keep those IDs out of routine logs, error messages are sanitized, and responses use `Cache-Control: no-store`.
- Since 2026-11-27 the relay notes each visitor's request (address, country, browser, the video asked for, how it ended) in memory, and the worker collects those notes and keeps them on the PC. Nothing is written on Render, a job is named in them by a hash of its ID and never the ID, and what someone typed is only kept once it is a YouTube video link. [The journal](analytics.md) has all of it.
- Completed jobs expire after ten minutes. The browser deletes the server job after receiving the MP3, on failure, or on cancellation. Cancellation and deadlines kill the extractor's entire process group, including FFmpeg. Only the current song is decoded in the browser, just as before.
- Memory bounds apply to one small service and are not a replacement for authentication or abuse controls if the app grows. Existing local-file playback and saving do not depend on the backend.

## API

| Request | Result |
| --- | --- |
| `GET /healthz` | Readiness, worker availability and import limits |
| `POST /v1/imports` with `{ "url": "https://www.youtube.com/watch?v=..." }` | `202` job with ID, status, progress and title |
| `GET /v1/imports/{id}` | queued, opening, downloading, converting, ready or failed. `opening` is the worker looking the video up, which the site shows as `finding`; how each step is shown is under the import bar in `CLAUDE.md` |
| `GET /v1/imports/{id}/audio` | MP3 only when ready, `409` otherwise |
| `DELETE /v1/imports/{id}` | Cancel, release slot and delete temporary files |

Expired or missing jobs return `404`, rate limiting `429`, a full queue or unavailable worker `503`. Job creation is never automatically retried, preventing duplicate downloads after uncertain network responses.

The worker's side, all signed and all under `/internal/worker/` (`backend/relay.py`): `claim` (take the next job, and say whether the worker is available), `{id}/progress`, `{id}/audio` (the MP3), and `events` (collect what visitors asked for, see [the journal](analytics.md)). Each answer the worker acts on carries `"version": 1`.
