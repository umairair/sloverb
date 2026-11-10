"""Outbound-only macOS downloader. No listening socket or remote shell."""
import argparse
import asyncio
import contextlib
import fcntl
import json
import os
import re
import signal
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app import Imports, Job, Settings
from backend.urls import youtube_url
from backend.worker_auth import signed_headers


def write_json(path: Path, data):
    temporary = path.with_suffix(".new")
    with temporary.open("w") as output:
        os.chmod(temporary, 0o600)
        json.dump(data, output)
    os.replace(temporary, path)


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def battery():
    result = subprocess.run(["/usr/bin/pmset", "-g", "batt"], capture_output=True, text=True, timeout=3, check=True)
    match = re.search(r"(\d+)%;", result.stdout)
    if not match:
        raise RuntimeError("battery state unavailable")
    return int(match[1]), "Now drawing from 'AC Power'" in result.stdout


def battery_policy(percent: int, on_ac: bool, control: dict):
    enabled = control.get("enabled") is True
    low = not on_ac and percent <= 10
    reason = "low_battery" if low else control.get("reason", "manual") if not enabled else None
    return enabled and not low, reason, on_ac or percent >= 20


class Worker:
    def __init__(self, directory: Path):
        self.directory = directory
        self.config = read_json(directory / "config.json", {})
        self.base = self.config["relay"].rstrip("/")
        parsed = urlsplit(self.base)
        # The installer pins this origin. Responses never select the next host.
        if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}):
            raise ValueError("relay must use HTTPS")
        if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
            raise ValueError("invalid relay origin")
        self.key = Ed25519PrivateKey.from_private_bytes((directory / "worker.key").read_bytes())
        self.control_path = directory / "control.json"
        self.state_path = directory / "state.json"
        self.state = {"status": "connecting", "relay_online": False, "jobs_finished": 0, "last_success": None}
        self.allowed = False
        self.active: asyncio.Task | None = None
        self.active_remote = None
        self.keep_awake: subprocess.Popen | None = None
        self.stopping = False
        self.client = httpx.AsyncClient(timeout=15, follow_redirects=False, trust_env=False)

    def publish(self, **change):
        self.state.update(change, updated_at=time.time())
        write_json(self.state_path, self.state)

    async def request(self, method, path, data=None, body=None, headers=None):
        payload = body if body is not None else json.dumps(data or {}, separators=(",", ":")).encode()
        request_headers = {"Content-Type": "audio/mpeg" if body is not None else "application/json",
                           **signed_headers(self.key, method, path, payload), **(headers or {})}
        response = await self.client.request(method, self.base + path, content=payload, headers=request_headers, timeout=60 if body is not None else 15)
        response.raise_for_status()
        return response

    def awake(self, enabled):
        if self.keep_awake and (not enabled or self.keep_awake.poll() is not None):
            with contextlib.suppress(ProcessLookupError):
                self.keep_awake.terminate()
            with contextlib.suppress(subprocess.TimeoutExpired):
                self.keep_awake.wait(timeout=2)
            self.keep_awake = None
        if enabled and not self.keep_awake:
            # Prevent idle system sleep, while allowing screen lock/display sleep.
            # Closing the lid or explicitly sleeping the Mac still pauses work.
            self.keep_awake = subprocess.Popen(["/usr/bin/caffeinate", "-i", "-w", str(os.getpid())],
                                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    async def policy(self):
        while not self.stopping:
            control = read_json(self.control_path, {"enabled": False, "reason": "manual"})
            try:
                percent, on_ac = await asyncio.to_thread(battery)
                allowed, reason, ready = battery_policy(percent, on_ac, control)
                if reason == "low_battery" and control.get("enabled"):
                    write_json(self.control_path, {"enabled": False, "reason": "low_battery"})
            except Exception:
                percent, on_ac, allowed, reason, ready = None, False, False, "battery_unavailable", False
            self.allowed = allowed
            self.awake(allowed)
            if not allowed and self.active and not self.active.done() and not self.active.cancelling():
                self.active.cancel()
            self.publish(battery_percent=percent, on_ac=on_ac, enabled=allowed, pause_reason=reason,
                         resume_ready=ready, **({"status": "paused"} if not allowed else {}))
            await asyncio.sleep(1)

    async def fail(self, remote, error):
        with contextlib.suppress(httpx.HTTPError, asyncio.TimeoutError):
            await asyncio.wait_for(self.request("POST", f"/internal/worker/{remote['id']}/progress",
                                               {"lease": remote["lease"], "status": "failed", "error": error}), 3)

    async def download(self, remote):
        if remote.get("version") != 1 or not re.fullmatch(r"[A-Za-z0-9_-]{43}", remote.get("id", "")) or not isinstance(remote.get("lease"), str):
            raise ValueError("unsupported relay response")
        # Re-validate at the machine boundary; a broker cannot send arbitrary URLs.
        url = youtube_url(remote["url"])
        settings = Settings(worker_public_key="")
        local = Job(remote["id"], url, Path(tempfile.mkdtemp(prefix="sloverb-worker-")))
        manager = Imports(settings)
        task = asyncio.create_task(manager.run(local))
        try:
            while not task.done():
                if not self.allowed:
                    raise asyncio.CancelledError
                self.publish(status=local.status)
                await self.request("POST", f"/internal/worker/{remote['id']}/progress",
                                   {"lease": remote["lease"], "status": local.status if local.status != "queued" else "opening",
                                    "progress": local.progress, "title": local.title})
                await asyncio.sleep(1)
            await task
            if not self.allowed:
                raise asyncio.CancelledError
            if local.status != "ready":
                await self.fail(remote, local.error or "couldn't download that video")
                return
            self.publish(status="sending")
            data = (local.directory / "source.mp3").read_bytes()
            # A lost acknowledgement may be retried, with a fresh signature.
            for attempt in range(2):
                if not self.allowed:
                    raise asyncio.CancelledError
                try:
                    await self.request("PUT", f"/internal/worker/{remote['id']}/audio", body=data,
                                       headers={"X-Worker-Lease": remote["lease"]})
                    break
                except (httpx.TransportError, httpx.TimeoutException):
                    if attempt:
                        raise
                    await asyncio.sleep(2)
            self.publish(jobs_finished=self.state["jobs_finished"] + 1, last_success=time.time())
        except asyncio.CancelledError:
            # Stop yt-dlp/FFmpeg before any network acknowledgement, which can
            # stall when the Mac is losing connectivity or power.
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            await self.fail(remote, "imports are paused, try later")
            raise
        except Exception:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            await self.fail(remote, "couldn't import that video")
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            import shutil
            shutil.rmtree(local.directory, ignore_errors=True)

    async def run(self):
        policy = asyncio.create_task(self.policy())
        await asyncio.sleep(0.1)
        last_heartbeat = 0
        last_available = None
        try:
            while not self.stopping:
                if self.allowed or self.allowed != last_available or time.monotonic() - last_heartbeat > 20:
                    last_heartbeat = time.monotonic()
                    last_available = self.allowed
                    try:
                        response = await self.request("POST", "/internal/worker/claim", {"available": self.allowed})
                        self.publish(relay_online=True, **({"status": "ready"} if self.allowed else {}))
                        if response.status_code == 200:
                            remote = response.json()
                            if not self.allowed:
                                await self.fail(remote, "imports are paused, try later")
                            else:
                                self.active = asyncio.create_task(self.download(remote))
                                with contextlib.suppress(asyncio.CancelledError):
                                    await self.active
                                self.active = None
                                if self.stopping:
                                    break
                    except (httpx.HTTPError, ValueError, KeyError):
                        self.publish(relay_online=False, **({"status": "connecting"} if self.allowed else {}))
                        await asyncio.sleep(5)
                await asyncio.sleep(3 if self.allowed else 1)
        finally:
            self.stopping = True
            if self.active:
                self.active.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self.active
            policy.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await policy
            self.awake(False)
            with contextlib.suppress(httpx.HTTPError, asyncio.TimeoutError):
                await asyncio.wait_for(self.request("POST", "/internal/worker/claim", {"available": False}), 3)
            self.publish(status="stopped", enabled=False)
            await self.client.aclose()


async def main(directory, parent_pid=None):
    lock = (directory / "worker.lock").open("w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return
    worker = Worker(directory)
    task = asyncio.create_task(worker.run())
    loop = asyncio.get_running_loop()
    def stop():
        worker.stopping = True
        task.cancel()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop)
    async def watch_parent():
        while True:
            await asyncio.sleep(1)
            if parent_pid and os.getppid() != parent_pid:
                stop()
                return
    watcher = asyncio.create_task(watch_parent())
    try:
        with contextlib.suppress(asyncio.CancelledError):
            await task
    finally:
        watcher.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await watcher


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-directory", type=Path, required=True)
    parser.add_argument("--parent-pid", type=int)
    args = parser.parse_args()
    asyncio.run(main(args.state_directory, args.parent_pid))
