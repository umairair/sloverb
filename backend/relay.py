import hashlib
import math
import os
import re
import secrets
import time

from fastapi import HTTPException, Request
from fastapi.responses import Response

from backend.worker_auth import WorkerAuth


def attach_relay(app, imports, public_key):
    auth = WorkerAuth(public_key)

    def current(job_id, lease):
        job = imports.get(job_id)
        if not job.lease or not isinstance(lease, str) or not secrets.compare_digest(job.lease, lease):
            raise HTTPException(409, "import lease expired")
        if job.status != "ready" and (job.finished is not None or time.monotonic() > job.lease_expires):
            raise HTTPException(409, "import lease expired")
        return job

    @app.post("/internal/worker/claim")
    async def claim(request: Request):
        data = await auth.json(request)
        imports.worker_seen = time.monotonic()
        imports.worker_available = data.get("available") is True
        if not imports.worker_available or any(job.lease and job.finished is None for job in imports.jobs.values()):
            return Response(status_code=204)
        for job in imports.jobs.values():
            if job.status == "queued" and job.finished is None:
                job.lease = secrets.token_urlsafe(32)
                job.lease_expires = time.monotonic() + imports.settings.timeout + 30
                job.status = "opening"
                return {"version": 1, "id": job.id, "url": job.url, "lease": job.lease}
        return Response(status_code=204)

    @app.post("/internal/worker/{job_id}/progress")
    async def progress(job_id: str, request: Request):
        data = await auth.json(request)
        job = current(job_id, data.get("lease"))
        imports.worker_seen = time.monotonic()
        if job.status == "ready":
            return {"status": "ready"}
        status = data.get("status")
        if status not in {"opening", "downloading", "converting", "receiving", "failed"}:
            raise HTTPException(400, "invalid progress")
        job.status = status
        value = data.get("progress")
        job.progress = float(value) if isinstance(value, (int, float)) and math.isfinite(value) and 0 <= value <= 1 else None
        title = data.get("title")
        if isinstance(title, str):
            job.title = re.sub(r"[\x00-\x1f\x7f]", "", title)[:200] or "youtube"
        if status == "failed":
            error = data.get("error", "")
            # the worker at home runs the copy of this code it was installed with, so it goes on sending the old
            # wording until the installer is rerun: both are taken, and the old one is shown as the new
            if error == "youtube blocked this import, try a file":
                error = "youtube blocked this import"
            safe_errors = {"youtube blocked this import", "that video isn't available", "couldn't download that video",
                           "live videos aren't supported", "choose a video under 10 minutes", "that video is too large",
                           "import took too long, try again", "imports are paused, try later", "couldn't import that video"}
            job.error = error if error in safe_errors else "couldn't import that video"
            job.finished = time.monotonic()
        return {"status": job.status}

    @app.put("/internal/worker/{job_id}/audio")
    async def upload(job_id: str, request: Request):
        digest = auth.verify(request)
        lease = request.headers.get("x-worker-lease")
        job = current(job_id, lease)
        if job.status == "ready":
            if job.content_digest != digest:
                raise HTTPException(409, "import already completed")
            return {"status": "ready"}
        if request.headers.get("content-type") != "audio/mpeg":
            raise HTTPException(415, "mp3 required")
        partial = job.directory / "source.uploading"
        size, received = 0, hashlib.sha256()
        try:
            with partial.open("wb") as output:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > imports.settings.max_file_bytes:
                        raise HTTPException(413, "that video is too large")
                    received.update(chunk)
                    output.write(chunk)
            if not size or not secrets.compare_digest(received.hexdigest(), digest):
                raise HTTPException(400, "invalid audio upload")
            with partial.open("rb") as output:
                head = output.read(3)
            if not (head.startswith(b"ID3") or len(head) >= 2 and head[0] == 255 and head[1] & 224 == 224):
                raise HTTPException(400, "mp3 required")
            current(job_id, lease)  # cancellation or expiry may happen during upload
            os.replace(partial, job.directory / "source.mp3")
            job.status, job.progress, job.content_digest = "ready", 1, digest
            job.finished = imports.worker_seen = time.monotonic()
            return {"status": "ready"}
        finally:
            partial.unlink(missing_ok=True)
