"""The Windows worker's supervisor and controls. Copied into the runtime by windows/install.py.

`run` is what the "Sloverb Worker" scheduled task starts at boot: it keeps
`backend.worker` running, restarting it if it crashes. `pause`, `resume` and
`status` stand in for the Mac's menu bar item. `watch`, `stats`, `songs`,
`imports`, `dashboard` and `geo` read the journal the worker keeps of what
visitors asked for (backend/analytics.py, docs/analytics.md).
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

RUNTIME = Path(__file__).resolve().parent
BASE = RUNTIME.parent
sys.path.insert(0, str(RUNTIME))

from backend.worker import read_json, write_json  # noqa: E402

JOURNAL = ("watch", "stats", "songs", "imports", "dashboard", "geo")


def note(message: str):
    with (BASE / "app.log").open("a", encoding="utf-8") as log:
        log.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}\n")


def rotate(path: Path, limit=524288):
    try:
        if path.stat().st_size > limit:
            os.replace(path, path.with_name(path.stem + ".previous.log"))
    except OSError:
        pass


def run():
    from backend.winjob import CREATE_NO_WINDOW, CREATE_SUSPENDED, ProcessGroup

    config = read_json(BASE / "config.json", {})
    env = dict(os.environ)
    # The task starts before login, so give the worker its tools explicitly.
    env["PATH"] = os.pathsep.join([str(RUNTIME / ".venv" / "Scripts"), *config.get("path", []), env.get("PATH", "")])
    env.update(PYTHONUNBUFFERED="1", PYTHONDONTWRITEBYTECODE="1")
    env.pop("WORKER_PUBLIC_KEY", None)
    python = RUNTIME / ".venv" / "Scripts" / "python.exe"
    # Ending the task kills this process, which closes the job and takes the
    # worker, yt-dlp and FFmpeg with it.
    group = ProcessGroup()
    note("supervisor started")
    while True:
        rotate(BASE / "worker.log")
        rotate(BASE / "app.log")
        started = time.monotonic()
        with (BASE / "worker.log").open("ab") as log:
            child = subprocess.Popen([str(python), "-m", "backend.worker", "--state-directory", str(BASE)],
                                     cwd=RUNTIME, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                     creationflags=CREATE_SUSPENDED | CREATE_NO_WINDOW)
            try:
                group.add(child.pid)
            except OSError as error:
                child.kill()
                note(f"couldn't start worker: {error}")
            code = child.wait()
        note(f"worker exited with {code}, restarting")
        time.sleep(max(0.0, 10 - (time.monotonic() - started)))


def status():
    state = read_json(BASE / "state.json", None)
    if state is None:
        print("no state yet: the worker hasn't run")
        return
    age = time.time() - state.get("updated_at", 0)
    print(json.dumps(state, indent=2))
    print(f"updated {age:.0f}s ago" + ("  (stale: the worker isn't running)" if age > 10 else ""))


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "status"
    if command == "run":
        run()
    elif command == "pause":
        write_json(BASE / "control.json", {"enabled": False, "reason": "manual"})
        print("paused")
    elif command == "resume":
        state = read_json(BASE / "state.json", {})
        if state.get("pause_reason") == "low_battery" and not state.get("resume_ready"):
            sys.exit("battery is too low to resume, plug in first")
        write_json(BASE / "control.json", {"enabled": True})
        print("resumed")
    elif command == "status":
        status()
    elif command in JOURNAL:
        from backend import analytics
        analytics.main([command, "--state-directory", str(BASE), *sys.argv[2:]])
    else:
        sys.exit("usage: sloverb-worker [status | pause | resume | " + " | ".join(JOURNAL) + "]")


if __name__ == "__main__":
    main()
