"""Outbound-only home downloader, on Windows or macOS. No listening socket or remote shell."""
import argparse
import asyncio
import contextlib
import ctypes
import importlib.metadata
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.analytics import Journal, Tail, line, tidy
from backend.app import Imports, Job, Settings
from backend.events import tag
from backend.geo import Geo
from backend.urls import youtube_url
from backend.worker_auth import signed_headers

WINDOWS = sys.platform == "win32"
if WINDOWS:
    import msvcrt
else:
    import fcntl


def write_json(path: Path, data):
    temporary = path.with_suffix(".new")
    with temporary.open("w") as output:
        os.chmod(temporary, 0o600)
        json.dump(data, output)
    for attempt in range(20):
        try:
            os.replace(temporary, path)
            return
        except PermissionError:
            # Windows refuses to replace a file while another process is reading it.
            if attempt == 19:
                raise
            time.sleep(0.05)


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


class PowerStatus(ctypes.Structure):
    _fields_ = [("ACLineStatus", ctypes.c_ubyte), ("BatteryFlag", ctypes.c_ubyte), ("BatteryLifePercent", ctypes.c_ubyte),
                ("SystemStatusFlag", ctypes.c_ubyte), ("BatteryLifeTime", ctypes.c_ulong), ("BatteryFullLifeTime", ctypes.c_ulong)]


def windows_battery(status: PowerStatus):
    if status.BatteryFlag != 255 and status.BatteryFlag & 128:
        # No battery at all: a desktop, so always on mains power.
        return 100, True
    if status.BatteryLifePercent > 100:
        raise RuntimeError("battery state unavailable")
    return status.BatteryLifePercent, status.ACLineStatus == 1


def battery():
    if WINDOWS:
        status = PowerStatus()
        if not ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(status)):
            raise RuntimeError("battery state unavailable")
        return windows_battery(status)
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


def steps(times: dict):
    """How long each part of a download took, from when the extractor said each began."""
    parts = (("found", "opening", "downloading"), ("download", "downloading", "converting"), ("convert", "converting", "ready"))
    return {name: round(times[end] - times[start], 1) for name, start, end in parts if start in times and end in times}


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
        self.awake_held = False
        self.stopping = False
        self.client = httpx.AsyncClient(timeout=15, follow_redirects=False, trust_env=False)
        # What visitors asked for and what became of it, kept here and nowhere else (docs/analytics.md).
        self.journal = Journal(directory / "analytics")
        self.geo = Geo(directory / "geo")
        self.online = self.taking = None  # as last written down, so each is only said when it changes

    def note(self, kind, **fields):
        """Into the journal, and into worker.log as a line a person can read. A
        journal that can't be written must never be what stops an import."""
        try:
            print(line(self.journal.note(kind, **fields), date=True), flush=True)
        except Exception:
            pass

    def reached(self, online, why=None):
        if online != self.online:
            self.online = online
            self.note("worker.relay", online=online, why=why)

    def publish(self, **change):
        self.state.update(change, updated_at=time.time())
        write_json(self.state_path, self.state)

    async def request(self, method, path, data=None, body=None, headers=None, timeout=None):
        payload = body if body is not None else json.dumps(data or {}, separators=(",", ":")).encode()
        request_headers = {"Content-Type": "audio/mpeg" if body is not None else "application/json",
                           **signed_headers(self.key, method, path, payload), **(headers or {})}
        response = await self.client.request(method, self.base + path, content=payload, headers=request_headers,
                                             timeout=timeout or (60 if body is not None else 15))
        response.raise_for_status()
        return response

    def awake(self, enabled):
        if WINDOWS:
            # ES_CONTINUOUS, plus ES_SYSTEM_REQUIRED while enabled: no idle sleep,
            # the display may still turn off. It belongs to this thread, which is
            # the event loop's, the only one that calls this.
            if enabled != self.awake_held:
                ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | (0x00000001 if enabled else 0))
                self.awake_held = enabled
            return
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
            if allowed != self.taking:
                self.taking = allowed
                self.note("worker.resumed" if allowed else "worker.paused", reason=None if allowed else reason)
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

    async def collect(self):
        """Bring home what the relay noticed about visitors' requests (backend/events.py)
        and keep it in the journal. It runs beside the imports and can't stop one:
        whatever goes wrong here is waited out and tried again."""
        boot, after = self.journal.cursor()
        dropped = 0
        while not self.stopping:
            try:
                asked = time.monotonic()
                # The relay holds the request until there is something to say, so this is one request every 20 seconds while it is quiet.
                response = await self.request("POST", "/internal/worker/events", {"boot": boot, "after": after, "wait": 20}, timeout=40)
                batch = response.json()
                if batch.get("version") != 1 or not isinstance(batch.get("boot"), str) or not isinstance(batch.get("events"), list):
                    raise ValueError("unsupported relay response")
                if batch["boot"] != boot:
                    # the relay restarted, and its numbering with it
                    boot, after, dropped = batch["boot"], 0, 0
                events = [event for event in map(tidy, batch["events"]) if event and event["seq"] > after]
                for event in events:
                    event.update(src="relay", boot=boot)
                    found = self.geo.where(event.get("ip"))
                    # the relay's country is the edge's own; a city from a file that disagrees with it is a guess
                    if found and event.get("country") in (None, found.get("country")):
                        event.update(found)
                # Past everything it sent, kept or not: an event this can't read must not be sent again for ever.
                after = max([after, *(event["seq"] for event in batch["events"] if isinstance(event, dict) and type(event.get("seq")) is int)])
                if events and not self.journal.keep(events):
                    print(line({"at": time.time(), "kind": "worker.journal", "lost": len(events)}, date=True), flush=True)
                if type(batch.get("dropped")) is int and batch["dropped"] > dropped:
                    self.note("worker.journal", dropped=batch["dropped"] - dropped)
                    dropped = batch["dropped"]
                if not events and time.monotonic() - asked < 1:
                    await asyncio.sleep(2)
            except asyncio.CancelledError:
                raise
            except httpx.HTTPStatusError as error:
                # 404 is a relay from before it kept any of this. It may be updated, so ask again now and then.
                await asyncio.sleep(300 if error.response.status_code == 404 else 30)
            except Exception:
                await asyncio.sleep(15)

    async def report(self):
        """Feed the dashboard on the relay (backend/board.py) while somebody signed in
        has it open, and nothing at all while nobody has. The relay holds each request
        until somebody starts looking, so this is one request every 20 seconds while
        nobody is. Like `collect`, it runs beside the imports and can't stop one."""
        from backend.dashboard import RANGES, outward, shown, sums
        tail = await asyncio.to_thread(Tail, self.journal)
        watching, backlog, wanted, summed = False, False, [], {}
        while not self.stopping:
            try:
                new = await asyncio.to_thread(tail.poll)
                body = {"version": 1, "wait": 0 if watching else 20}
                if watching:
                    if backlog:
                        new = await asyncio.to_thread(self.journal.recent, 120)
                        body["backlog"] = True
                    body["lines"] = [shown(event, home=False) for event in new]
                    due = [name for name in wanted if time.monotonic() - summed.get(name, 0) >= 3]
                    if due:
                        body["summaries"] = {name: outward(await asyncio.to_thread(sums, self.journal, self.directory, name)) for name in due}
                        summed.update({name: time.monotonic() for name in due})
                response = await self.request("POST", "/internal/worker/board", body, timeout=40)
                answer = response.json()
                if not isinstance(answer, dict) or answer.get("version") != 1:
                    raise ValueError("unsupported relay response")
                watching, backlog = answer.get("watching") is True, answer.get("backlog") is True
                wanted = [name for name in answer.get("ranges", []) if name in RANGES] if isinstance(answer.get("ranges"), list) else []
                if not watching:
                    summed = {}
                await asyncio.sleep(1 if watching else 0.1)
            except asyncio.CancelledError:
                raise
            except httpx.HTTPStatusError as error:
                # 404 is a relay without a dashboard: one from before it, or one with no password set on Render
                watching = False
                await asyncio.sleep(300 if error.response.status_code == 404 else 30)
            except httpx.TransportError:
                # the relay restarting, which is every deploy: back as soon as it is
                watching = False
                await asyncio.sleep(3)
            except Exception:
                watching = False
                await asyncio.sleep(15)

    async def download(self, remote):
        if remote.get("version") != 1 or not re.fullmatch(r"[A-Za-z0-9_-]{43}", remote.get("id", "")) or not isinstance(remote.get("lease"), str):
            raise ValueError("unsupported relay response")
        # Re-validate at the machine boundary; a broker cannot send arbitrary URLs.
        url = youtube_url(remote["url"])
        settings = Settings(worker_public_key="")
        local = Job(remote["id"], url, Path(tempfile.mkdtemp(prefix="sloverb-worker-")))
        manager = Imports(settings)
        task = asyncio.create_task(manager.run(local))
        # The journal knows a job by the same stand-in for its id as the relay's events do.
        about, began, told, heard = {"job": tag(remote["id"]), "video": url[-11:]}, time.monotonic(), False, 0
        spent = lambda: round(time.monotonic() - began, 1)  # noqa: E731
        self.note("job.claimed", **about)

        def introduce():
            nonlocal told, heard
            if not told and (local.meta or local.title != "youtube"):
                told = True
                known = {name: value for name, value in local.meta.items() if name in {"channel", "artist", "track", "album", "category", "duration", "views", "uploaded"}
                         and type(value) in {str, int, float}}
                self.note("job.info", **about, title=local.title, **known)
            # each go at the download that failed and was tried again (`attempts` in app.py), with what the extractor said
            for failed in local.tries[heard:]:
                self.note("job.retried", **about, error=failed.get("error"), detail=failed.get("detail"))
            heard = len(local.tries)
        try:
            while not task.done():
                if not self.allowed:
                    raise asyncio.CancelledError
                self.publish(status=local.status)
                introduce()
                await self.request("POST", f"/internal/worker/{remote['id']}/progress",
                                   {"lease": remote["lease"], "status": local.status if local.status != "queued" else "opening",
                                    "progress": local.progress, "title": local.title})
                await asyncio.sleep(1)
            await task
            introduce()
            if not self.allowed:
                raise asyncio.CancelledError
            if local.status != "ready":
                # `detail` is the extractor's own account. It stays in this machine's journal: only `error` goes back.
                self.note("job.failed", **about, error=local.error or "couldn't download that video", detail=local.detail, seconds=spent(),
                          tries=len(local.tries) + 1 if local.tries else None)
                await self.fail(remote, local.error or "couldn't download that video")
                return
            self.publish(status="sending")
            data = (local.directory / "source.mp3").read_bytes()
            sending = time.monotonic()
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
            self.note("job.done", **about, bytes=len(data), seconds=spent(), **steps(local.times), upload=round(time.monotonic() - sending, 1),
                      tries=len(local.tries) + 1 if local.tries else None)
        except asyncio.CancelledError:
            # Stop yt-dlp/FFmpeg before any network acknowledgement, which can
            # stall when the machine is losing connectivity or power.
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            self.note("job.stopped", **about, reason="the worker is stopping" if self.stopping else "imports were paused", seconds=spent())
            await self.fail(remote, "imports are paused, try later")
            raise
        except Exception as error:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            if isinstance(error, httpx.HTTPStatusError) and error.response.status_code in {404, 409}:
                # the relay no longer has the job: the visitor cancelled, or it ran out of time there
                self.note("job.stopped", **about, reason="cancelled or expired at the relay", seconds=spent())
            else:
                # an httpx error names the address it was for, and that address holds the job's id
                detail = type(error).__name__ if isinstance(error, httpx.HTTPError) else f"{type(error).__name__}: {error}"[:300]
                self.note("job.failed", **about, error="couldn't import that video", detail=detail, seconds=spent())
            await self.fail(remote, "couldn't import that video")
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            shutil.rmtree(local.directory, ignore_errors=True)

    async def run(self):
        try:
            extractor = importlib.metadata.version("yt-dlp")
        except importlib.metadata.PackageNotFoundError:
            extractor = None
        self.note("worker.started", extractor=extractor, python=sys.version.split()[0], system=sys.platform)
        policy = asyncio.create_task(self.policy())
        collector = asyncio.create_task(self.collect())
        reporter = asyncio.create_task(self.report())
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
                        self.reached(True)
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
                    except (httpx.HTTPError, ValueError, KeyError) as error:
                        # 401 here is nearly always this machine's clock being more than 90 seconds out, or the wrong key on Render
                        self.reached(False, f"{type(error).__name__} {error.response.status_code}" if isinstance(error, httpx.HTTPStatusError) else type(error).__name__)
                        self.publish(relay_online=False, **({"status": "connecting"} if self.allowed else {}))
                        await asyncio.sleep(5)
                await asyncio.sleep(3 if self.allowed else 1)
        finally:
            self.stopping = True
            if self.active:
                self.active.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self.active
            for task in (policy, collector, reporter):
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
            self.awake(False)
            with contextlib.suppress(httpx.HTTPError, asyncio.TimeoutError):
                await asyncio.wait_for(self.request("POST", "/internal/worker/claim", {"available": False}), 3)
            self.publish(status="stopped", enabled=False)
            self.note("worker.stopped")
            self.geo.close()
            await self.client.aclose()


async def main(directory, parent_pid=None):
    for stream in (sys.stdout, sys.stderr):
        # worker.log, wherever it is being written. Windows would otherwise use
        # its own code page there, and a title in another alphabet would raise.
        with contextlib.suppress(AttributeError, ValueError, OSError):
            stream.reconfigure(encoding="utf-8", errors="replace")
    lock = (directory / "worker.lock").open("w")
    try:
        if WINDOWS:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return
    worker = Worker(directory)
    task = asyncio.create_task(worker.run())
    loop = asyncio.get_running_loop()
    def stop():
        worker.stopping = True
        task.cancel()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, stop)
        except NotImplementedError:
            # Windows: only Ctrl+C arrives this way. The service stops the worker
            # by closing the job object it runs in (windows/service.py).
            signal.signal(sig, lambda *_: loop.call_soon_threadsafe(stop))
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
