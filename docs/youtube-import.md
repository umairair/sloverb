# YouTube imports

## Production architecture

Vercel serves the frontend and Render serves an outbound-only job relay. YouTube extraction runs on the owner's Mac because real downloads were rejected from both Render regions tested. The relay accepts signed claims, progress and MP3 uploads from the Mac; visitors never connect to the Mac. See [the Mac worker](mac-worker.md) for installation, power behavior and recovery.

`WORKER_PUBLIC_KEY` in `render.yaml` selects relay mode and pins the worker's Ed25519 public key. Its private key stays in the Mac's user-only application support directory. Without the public-key setting, the same backend runs extraction locally for development. Never enable production link controls until an actual deployed relay-to-Mac import succeeds.

On November 10, 2026, the production Render relay completed a real round trip through the installed Mac worker: `jNQXAC9IVRw` returned a 457,389-byte MP3 with a measured duration of 19.005542 seconds, and the audio response allowed the exact `https://sloverb.app` origin. Production Vercel configuration now points to this relay.

## Hosting

Keep the existing Vercel Git integration and `sloverb.app` domain. Run the relay on one Render Free web service using `backend/Dockerfile`, with the repository root as its Docker context. `render.yaml` declares that setup. No database, paid background worker, persistent disk or object storage is needed.

In Render, link the private GitHub repository, choose Docker, set the Dockerfile path to `./backend/Dockerfile`, choose Free, set the health check to `/healthz`, and set `ALLOWED_ORIGINS=https://sloverb.app,https://www.sloverb.app`. Use one instance and one Uvicorn worker. After the initial deployment, set the service's branch to `main` and auto-deploy to **After CI Checks Pass**. The Blueprint uses `autoDeployTrigger: checksPass`.

The browser calls the relay at `https://api.sloverb.app`, a Render custom domain with a CNAME at Namecheap pointing to `sloverb-import.onrender.com`. Ad blockers block requests to `onrender.com` from `sloverb.app`, so keep the API on a sloverb.app subdomain. `VITE_IMPORT_API_URL` holds that address in the Vercel project's Production environment, and changing it needs a redeploy because it is baked in at build time. For Preview deployments, either explicitly allow the exact preview origin in Render and set the Preview variable, or leave imports unavailable there. The Mac worker can keep using the `onrender.com` address.

Every `main` push runs frontend type checking, tests and build, plus Python tests and a Docker build. Vercel's existing Git integration deploys the frontend. Render deploys backend changes after checks pass. The Render build filter restricts builds to backend or deployment files. Keep the JSON job contract compatible across independently timed deployments.

## Research and practical limits

Checked on November 10, 2026:

- [Render Free](https://render.com/docs/free) supplies 750 instance hours per workspace per month, sleeps after 15 idle minutes and can take about a minute to restart. The client retries health checks while displaying `starting`, then creates a job once. Temporary storage is lost on restarts, so missing jobs show a retryable expiry error. Free services also have bandwidth/build allowances and a service-initiated traffic threshold. This is suitable for a small hobby app, not an unlimited or guaranteed production service. Keep paid upgrades off and configure a spend limit if the account has a payment method.
- [Vercel function limits](https://vercel.com/docs/functions/limitations) include a 4.5 MB request/response payload limit. A normal song can exceed that, so the browser receives MP3 bytes directly from Render rather than through a function.
- [Railway pricing](https://railway.com/pricing) offers a small monthly free allowance after its trial. It is an alternative for very low usage, but it does not provide an unlimited free conversion service.
- [yt-dlp's EJS guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS) requires external JavaScript challenge support for YouTube. The image includes Node 24 and the matching EJS dependency from `yt-dlp[default]`, with the Node runtime explicitly enabled. Bare yt-dlp and FFmpeg alone are insufficient.
- [yt-dlp's known issues](https://github.com/yt-dlp/yt-dlp/issues/3766) document IP blocks and sign-in requirements. Successful local extraction does not prove that a specific cloud IP can extract a video. Test an actual import from the deployed service before enabling the feature. No free host can guarantee that YouTube will keep accepting requests from its shared IPs. The app reports a blocked import and keeps local file import available. It does not collect account cookies, use a third-party converter, or attempt private, age-restricted or members-only content.

The Docker image also includes [BgUtils POT Provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider), following the [yt-dlp PO Token guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide). It generates guest proof-of-origin tokens for the `mweb` client, in an on-demand child process. There is no exposed token server and no account-cookie setup. Its source commit and Python plugin are pinned, and its compatible patched dependency lock is stored in `backend/pot-provider`. Local development can opt in with `BGUTIL_SERVER_HOME=/absolute/path/to/bgutil-ytdlp-pot-provider/server` after building the provider as described upstream. Tokens do not guarantee that a hosting IP will be accepted.

yt-dlp is pinned to the version tested in this repository. If YouTube changes extraction, update `backend/requirements.txt` and the provider together, run tests and a real deployed smoke import, and redeploy the image. The HTTP health check confirms service availability, not YouTube extraction availability.

## Resource and privacy boundaries

- Videos only: supported YouTube hosts and strict 11-character video IDs are rebuilt into a canonical watch URL before extraction. Arbitrary URLs, custom ports and playlist-only links are rejected.
- One conversion at a time, at most three active/queued jobs, six accepted imports per IP per hour. CORS is an origin boundary for browsers, not authentication; the service remains a public, rate-limited API.
- Maximum duration 10 minutes, source download 32 MiB, MP3 20 MiB, extraction deadline four minutes. Unknown-duration and live videos are rejected before download. Conversion uses 192 kbps MP3 and one FFmpeg thread. The existing browser export remains 320 kbps.
- Job IDs are random 256-bit bearer capabilities. Anyone holding one can read or cancel that job. Access logs are disabled to keep those IDs out of routine logs, error messages are sanitized, and responses use `Cache-Control: no-store`.
- Completed jobs expire after ten minutes. The browser deletes the server job after receiving the MP3, on failure, or on cancellation. Cancellation and deadlines kill the extractor's entire process group, including FFmpeg. Only the current song is decoded in the browser, just as before.
- Memory bounds apply to one small service and are not a replacement for authentication or abuse controls if the app grows. Existing local-file playback and saving do not depend on the backend.

## API

| Request | Result |
| --- | --- |
| `GET /healthz` | Readiness, worker availability and import limits |
| `POST /v1/imports` with `{ "url": "https://www.youtube.com/watch?v=..." }` | `202` job with ID, status, progress and title |
| `GET /v1/imports/{id}` | queued, opening, downloading, converting, ready or failed |
| `GET /v1/imports/{id}/audio` | MP3 only when ready, `409` otherwise |
| `DELETE /v1/imports/{id}` | Cancel, release slot and delete temporary files |

Expired or missing jobs return `404`, rate limiting `429`, a full queue or unavailable worker `503`. Job creation is never automatically retried, preventing duplicate downloads after uncertain network responses.
