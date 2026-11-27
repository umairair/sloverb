import asyncio
import contextlib
import json
import os
import secrets
import shutil
import signal
import sys
import tempfile
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from backend.events import Events, place, tag, visitor
from backend.urls import youtube_url


# Production and the Vite dev server. Render overrides this with ALLOWED_ORIGINS (render.yaml).
DEFAULT_ORIGINS = "https://sloverb.app,https://www.sloverb.app,http://localhost:5190,http://127.0.0.1:5190"


@dataclass
class Settings:
    origins: list[str] = field(default_factory=lambda: os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(","))
    max_duration: int = 600
    max_source_bytes: int = 32 * 1024 * 1024
    max_file_bytes: int = 20 * 1024 * 1024
    timeout: float = 240
    ttl: float = 600
    capacity: int = 3
    # imports an hour from one address; 0 is no limit, which is what it is for now (Umair, 2026-11-12)
    rate_limit: int = 0
    worker_public_key: str = field(default_factory=lambda: os.getenv("WORKER_PUBLIC_KEY", ""))


@dataclass
class Job:
    id: str
    url: str
    directory: Path
    status: str = "queued"
    title: str = "youtube"
    progress: float | None = None
    error: str | None = None
    finished: float | None = None
    task: asyncio.Task | None = None
    created: float = field(default_factory=time.monotonic)
    lease: str | None = None
    lease_expires: float = 0
    content_digest: str | None = None
    # What the extractor learned about the video, when each step began, and the
    # extractor's own words for what went wrong. They stay on the machine that
    # ran the download, for its journal (backend/analytics.py). `detail` can hold
    # signed URLs and addresses, so it is never public and never sent to the relay.
    meta: dict = field(default_factory=dict)
    times: dict = field(default_factory=dict)
    detail: str | None = None
    fetched: int = 0

    @property
    def tag(self):
        return tag(self.id)

    @property
    def video(self):
        return self.url[-11:]

    def public(self):
        return {"id": self.id, "status": self.status, "title": self.title, "progress": self.progress, "error": self.error}


class Imports:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.jobs: dict[str, Job] = {}
        self.requests: dict[str, deque] = defaultdict(deque)
        self.slot = asyncio.Semaphore(1)
        self.worker_seen = 0.0
        self.worker_available = False
        self.events = Events()

    def note(self, kind: str, job: Job, **fields):
        """Something became of a job that no visitor's request shows. See backend/events.py."""
        self.events.emit(kind, budget=False, job=job.tag, video=job.video, title=job.title if job.title != "youtube" else None,
                         seconds=round(time.monotonic() - job.created, 1), **fields)

    def available(self):
        return not self.settings.worker_public_key or self.worker_available and time.monotonic() - self.worker_seen < 45

    def create(self, url: str, client: str) -> Job:
        if not self.available():
            raise HTTPException(503, "imports are offline, try later", headers={"Retry-After": "30"})
        now = time.monotonic()
        for key in list(self.requests):
            while self.requests[key] and self.requests[key][0] <= now - 3600:
                self.requests[key].popleft()
            if not self.requests[key]:
                del self.requests[key]
        if self.settings.rate_limit and (len(self.requests[client]) >= self.settings.rate_limit or len(self.requests) > 10000):
            raise HTTPException(429, "too many imports, try later", headers={"Retry-After": "3600"})
        if sum(job.finished is None for job in self.jobs.values()) >= self.settings.capacity:
            raise HTTPException(503, "imports are busy, try again", headers={"Retry-After": "30"})
        self.requests[client].append(now)
        # Bound disk usage even if many distinct clients finish jobs inside the TTL.
        finished = [job for job in self.jobs.values() if job.finished is not None]
        for old in sorted(finished, key=lambda job: job.finished)[:-11]:
            self.remove(old)
        job = Job(secrets.token_urlsafe(32), url, Path(tempfile.mkdtemp(prefix="sloverb-")))
        self.jobs[job.id] = job
        if not self.settings.worker_public_key:
            job.task = asyncio.create_task(self.run(job))
        return job

    def get(self, job_id: str) -> Job:
        job = self.jobs.get(job_id)
        if not job or (job.finished is not None and time.monotonic() - job.finished >= self.settings.ttl):
            if job:
                self.expire(job)
            raise HTTPException(404, "import expired, try again")
        return job

    def expire(self, job: Job):
        # The browser deletes a job once it has the song or has given up, so one
        # that lasts this long was left behind: the tab was closed, or went offline.
        self.note("import.expired", job, status=job.status, fetched=job.fetched)
        self.remove(job)

    def remove(self, job: Job):
        self.jobs.pop(job.id, None)
        shutil.rmtree(job.directory, ignore_errors=True)

    async def run(self, job: Job):
        try:
            async with self.slot:
                job.status = "opening"
                job.times["opening"] = time.monotonic()
                await asyncio.wait_for(self.extract(job), timeout=self.settings.timeout)
                output = job.directory / "source.mp3"
                if not output.is_file() or not 0 < output.stat().st_size <= self.settings.max_file_bytes:
                    raise ValueError("that video is too large")
                job.status, job.progress = "ready", 1
                job.times["ready"] = time.monotonic()
                self.note("import.ready", job, bytes=output.stat().st_size)
        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError:
            job.status, job.error = "failed", "import took too long, try again"
            self.note("import.failed", job, error=job.error)
        except Exception as error:
            job.status = "failed"
            job.error = str(error) if type(error) is ValueError else "couldn't import that video"
            if type(error) is not ValueError and not job.detail:
                job.detail = f"{type(error).__name__}: {error}"[:1000]
            self.note("import.failed", job, error=job.error)
        finally:
            job.finished = time.monotonic()
            if job.status != "ready":
                shutil.rmtree(job.directory, ignore_errors=True)

    async def extract(self, job: Job):
        group = None
        options = {"start_new_session": True}
        if sys.platform == "win32":
            # Windows has no process groups to kill. A job object holds the
            # extractor and FFmpeg instead, entered before the extractor runs.
            from backend.winjob import CREATE_NO_WINDOW, CREATE_SUSPENDED, ProcessGroup
            group = ProcessGroup()
            options = {"creationflags": CREATE_SUSPENDED | CREATE_NO_WINDOW}
        try:
            process = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "backend.extract", job.url, str(job.directory),
                str(self.settings.max_duration), str(self.settings.max_source_bytes),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, **options,
            )
        except BaseException:
            if group:
                group.close()
            raise
        try:
            if group:
                group.add(process.pid)
        except BaseException:
            group.close()
            with contextlib.suppress(ProcessLookupError, OSError):
                process.kill()
            await process.wait()
            raise

        async def read_events():
            while line := await process.stdout.readline():
                event = json.loads(line)
                if event.get("status") in {"downloading", "converting"}:
                    job.status = event["status"]
                    job.progress = event.get("progress")
                    job.times.setdefault(job.status, time.monotonic())
                if "title" in event:
                    job.title = event["title"]
                if "error" in event:
                    job.error = event["error"]
                if isinstance(event.get("meta"), dict):
                    job.meta = event["meta"]
                if isinstance(event.get("detail"), str):
                    job.detail = event["detail"][:1000]

        reader = asyncio.create_task(read_events())
        try:
            while process.returncode is None:
                # Also catches unexpectedly large fragments and intermediate video files.
                size = sum(path.stat().st_size for path in job.directory.glob("*") if path.is_file())
                if size > self.settings.max_source_bytes + self.settings.max_file_bytes:
                    raise ValueError("that video is too large")
                await asyncio.sleep(0.25)
            await reader
            if process.returncode:
                raise ValueError(job.error or "couldn't download that video")
        finally:
            # The extractor and FFmpeg share a new process group (a job object on
            # Windows). Kill the group even if the Python parent already exited,
            # so no child survives.
            if group:
                group.close()
            else:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
            await process.wait()
            reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await reader

    async def sweep(self):
        while True:
            await asyncio.sleep(5)
            for job in list(self.jobs.values()):
                if self.settings.worker_public_key and job.finished is None and (
                    job.lease and time.monotonic() > job.lease_expires or not job.lease and time.monotonic() - job.created > 60
                ):
                    job.status, job.error, job.finished = "failed", "import took too long, try again", time.monotonic()
                    self.note("import.failed", job, error=job.error)
                if job.finished is not None and time.monotonic() - job.finished >= self.settings.ttl:
                    self.expire(job)

    async def cancel(self, job: Job):
        if job.task:
            job.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await job.task
        self.remove(job)


class ImportBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=1, max_length=2048)


def create_app(settings: Settings | None = None):
    settings = settings or Settings()
    imports = Imports(settings)

    @asynccontextmanager
    async def lifespan(_app):
        sweep = asyncio.create_task(imports.sweep())
        yield
        sweep.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sweep
        for job in list(imports.jobs.values()):
            await imports.cancel(job)

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.imports = imports
    app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"])

    def notice(request: Request, status: int, started: float):
        """One event for each thing a visitor asks. Left out: the worker's own
        requests (unless it was refused, which is someone else trying the door),
        the browser asking permission before a request, Render's health check
        every few seconds, and whatever a handler marks as quiet."""
        path, state = request.url.path, request.state
        if request.method == "OPTIONS" or getattr(state, "quiet", False):
            return
        if path.startswith("/internal/") and status != 401:
            return
        if path == "/healthz" and not request.headers.get("origin"):
            return
        try:
            imports.events.emit(getattr(state, "kind", "request"), **{"method": request.method, "path": place(path), "status": status,
                                "ms": round((time.monotonic() - started) * 1000), **visitor(request), **getattr(state, "note", {})})
        except Exception:
            pass  # writing a request down must never be what fails it

    @app.middleware("http")
    async def guard(request: Request, call_next):
        started, status = time.monotonic(), 500
        try:
            response = await answer(request, call_next)
            status = response.status_code
            return response
        finally:
            notice(request, status, started)

    async def answer(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin and origin not in settings.origins:
            return JSONResponse({"detail": "origin not allowed"}, status_code=403)
        if request.method == "POST":
            # Check actual bytes too; Content-Length can be absent or dishonest.
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 4096:
                    return JSONResponse({"detail": "request too large"}, status_code=413)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/healthz")
    async def health():
        return {"status": "ok", "maxDurationSeconds": settings.max_duration, "maxFileBytes": settings.max_file_bytes,
                "mode": "relay" if settings.worker_public_key else "local", "available": imports.available()}

    # Each handler says what its request was, for `notice` above. What someone
    # typed is only kept once it has turned out to be a YouTube video link.
    @app.post("/v1/imports", status_code=202)
    async def start(body: ImportBody, request: Request):
        request.state.kind = "import.rejected"
        try:
            url = youtube_url(body.url)
        except ValueError as error:
            request.state.note = {"reason": str(error)}
            raise HTTPException(400, str(error)) from None
        try:
            job = imports.create(url, request.client.host if request.client else "unknown")
        except HTTPException as error:
            request.state.note = {"video": url[-11:], "reason": error.detail}
            raise
        request.state.kind, request.state.note = "import.queued", {"job": job.tag, "video": job.video}
        return job.public()

    @app.get("/v1/imports/{job_id}")
    async def status(job_id: str, request: Request):
        job = imports.get(job_id)
        request.state.quiet = True  # the browser asks every second while it waits
        return job.public()

    @app.get("/v1/imports/{job_id}/audio")
    async def audio(job_id: str, request: Request):
        job = imports.get(job_id)
        if job.status != "ready":
            raise HTTPException(409, "import isn't ready")
        source = job.directory / "source.mp3"
        job.fetched += 1
        request.state.kind = "import.fetched"
        request.state.note = {"job": job.tag, "video": job.video, "bytes": source.stat().st_size if source.is_file() else None}
        return FileResponse(source, media_type="audio/mpeg", filename="youtube.mp3")

    @app.delete("/v1/imports/{job_id}", status_code=204)
    async def cancel(job_id: str, request: Request):
        job = imports.get(job_id)
        if job.finished is None:
            request.state.kind = "import.cancelled"
            request.state.note = {"job": job.tag, "video": job.video, "while": job.status,
                                  "seconds": round(time.monotonic() - job.created, 1)}
        else:
            request.state.quiet = True  # the browser tidying up after itself
        await imports.cancel(job)

    if settings.worker_public_key:
        from backend.relay import attach_relay
        attach_relay(app, imports, settings.worker_public_key)
    return app


app = create_app()
