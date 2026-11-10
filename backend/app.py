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

from backend.urls import youtube_url


@dataclass
class Settings:
    origins: list[str] = field(default_factory=lambda: os.getenv("ALLOWED_ORIGINS", "https://sloverb.app,https://www.sloverb.app,http://localhost:5190,http://127.0.0.1:5190").split(","))
    max_duration: int = 600
    max_source_bytes: int = 32 * 1024 * 1024
    max_file_bytes: int = 20 * 1024 * 1024
    timeout: float = 240
    ttl: float = 600
    capacity: int = 3
    rate_limit: int = 6


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

    def public(self):
        return {"id": self.id, "status": self.status, "title": self.title, "progress": self.progress, "error": self.error}


class Imports:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.jobs: dict[str, Job] = {}
        self.requests: dict[str, deque] = defaultdict(deque)
        self.slot = asyncio.Semaphore(1)

    def create(self, url: str, client: str) -> Job:
        now = time.monotonic()
        for key in list(self.requests):
            while self.requests[key] and self.requests[key][0] <= now - 3600:
                self.requests[key].popleft()
            if not self.requests[key]:
                del self.requests[key]
        if len(self.requests[client]) >= self.settings.rate_limit or len(self.requests) > 10000:
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
        job.task = asyncio.create_task(self.run(job))
        return job

    def get(self, job_id: str) -> Job:
        job = self.jobs.get(job_id)
        if not job or (job.finished is not None and time.monotonic() - job.finished >= self.settings.ttl):
            if job:
                self.remove(job)
            raise HTTPException(404, "import expired, try again")
        return job

    def remove(self, job: Job):
        self.jobs.pop(job.id, None)
        shutil.rmtree(job.directory, ignore_errors=True)

    async def run(self, job: Job):
        try:
            async with self.slot:
                job.status = "opening"
                await asyncio.wait_for(self.extract(job), timeout=self.settings.timeout)
                output = job.directory / "source.mp3"
                if not output.is_file() or not 0 < output.stat().st_size <= self.settings.max_file_bytes:
                    raise ValueError("that video is too large")
                job.status, job.progress = "ready", 1
        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError:
            job.status, job.error = "failed", "import took too long, try again"
        except Exception as error:
            job.status = "failed"
            job.error = str(error) if type(error) is ValueError else "couldn't import that video"
        finally:
            job.finished = time.monotonic()
            if job.status != "ready":
                shutil.rmtree(job.directory, ignore_errors=True)

    async def extract(self, job: Job):
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "backend.extract", job.url, str(job.directory),
            str(self.settings.max_duration), str(self.settings.max_source_bytes),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            start_new_session=True,
        )

        async def read_events():
            while line := await process.stdout.readline():
                event = json.loads(line)
                if event.get("status") in {"downloading", "converting"}:
                    job.status = event["status"]
                    job.progress = event.get("progress")
                if "title" in event:
                    job.title = event["title"]
                if "error" in event:
                    job.error = event["error"]

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
            # The extractor and FFmpeg share a new process group. Kill the group
            # even if the Python parent already exited, so no child survives.
            with contextlib.suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
            await process.wait()
            reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await reader

    async def sweep(self):
        while True:
            await asyncio.sleep(30)
            for job in list(self.jobs.values()):
                if job.finished is not None and time.monotonic() - job.finished >= self.settings.ttl:
                    self.remove(job)

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

    @app.middleware("http")
    async def guard(request: Request, call_next):
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
        return {"status": "ok", "maxDurationSeconds": settings.max_duration, "maxFileBytes": settings.max_file_bytes}

    @app.post("/v1/imports", status_code=202)
    async def start(body: ImportBody, request: Request):
        try:
            url = youtube_url(body.url)
        except ValueError as error:
            raise HTTPException(400, str(error)) from None
        return imports.create(url, request.client.host if request.client else "unknown").public()

    @app.get("/v1/imports/{job_id}")
    async def status(job_id: str):
        return imports.get(job_id).public()

    @app.get("/v1/imports/{job_id}/audio")
    async def audio(job_id: str):
        job = imports.get(job_id)
        if job.status != "ready":
            raise HTTPException(409, "import isn't ready")
        return FileResponse(job.directory / "source.mp3", media_type="audio/mpeg", filename="youtube.mp3")

    @app.delete("/v1/imports/{job_id}", status_code=204)
    async def cancel(job_id: str):
        await imports.cancel(imports.get(job_id))

    return app


app = create_app()
