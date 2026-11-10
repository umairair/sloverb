"""Install the user-requested menu-bar worker and login LaunchAgent."""
import argparse
import base64
import json
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

LABEL = "app.sloverb.worker"


def run(*args, **kwargs):
    subprocess.run(list(args), check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--relay", default="https://sloverb-import.onrender.com")
    parser.add_argument("--start", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    for dependency in ("node", "ffmpeg"):
        if not shutil.which(dependency):
            parser.error(f"{dependency} must be installed before starting the worker")
    if args.start:
        # Stop our existing login job before replacing its runtime or app.
        subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{LABEL}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = Path.home() / "Library/Application Support/Sloverb Worker"
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(base, 0o700)
    key_path = base / "worker.key"
    if not key_path.exists():
        key = Ed25519PrivateKey.generate()
        fd = os.open(key_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "wb") as output:
            output.write(key.private_bytes_raw())
    key = Ed25519PrivateKey.from_private_bytes(key_path.read_bytes())
    os.chmod(key_path, 0o600)
    config = base / "config.json"
    config.write_text(json.dumps({"relay": args.relay}))
    os.chmod(config, 0o600)
    control = base / "control.json"
    if not control.exists():
        control.write_text(json.dumps({"enabled": False, "reason": "setup"}))
        os.chmod(control, 0o600)
    runtime = base / "runtime"
    runtime.mkdir(exist_ok=True)
    shutil.copytree(root / "backend", runtime / "backend", dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "tests", "pot-provider"))
    if not (runtime / ".venv").exists():
        run(sys.executable, "-m", "venv", str(runtime / ".venv"))
    run(str(runtime / ".venv/bin/python3"), "-m", "pip", "install", "-r", str(root / "backend/requirements-worker.txt"), stdout=subprocess.DEVNULL)
    app = base / "Sloverb Worker.app"
    contents = app / "Contents"
    binary = contents / "MacOS/SloverbWorker"
    binary.parent.mkdir(parents=True, exist_ok=True)
    info = {"CFBundleIdentifier": LABEL, "CFBundleName": "Sloverb Worker", "CFBundleDisplayName": "sloverb worker",
            "CFBundleExecutable": "SloverbWorker", "CFBundlePackageType": "APPL", "CFBundleVersion": "1", "CFBundleShortVersionString": "1.0",
            "LSUIElement": True, "NSHighResolutionCapable": True, "LSMinimumSystemVersion": "13.0"}
    (contents / "Info.plist").write_bytes(plistlib.dumps(info))
    run("/usr/bin/swiftc", str(root / "macos/WorkerApp.swift"), "-o", str(binary), "-framework", "AppKit", "-framework", "UserNotifications")
    run("/usr/bin/codesign", "--force", "--sign", "-", str(app), stdout=subprocess.DEVNULL)
    agent = Path.home() / "Library/LaunchAgents" / f"{LABEL}.plist"
    agent.parent.mkdir(parents=True, exist_ok=True)
    definition = {"Label": LABEL, "ProgramArguments": [str(binary)], "RunAtLoad": True,
                  "KeepAlive": {"SuccessfulExit": False}, "ThrottleInterval": 10, "ExitTimeOut": 45,
                  "ProcessType": "Background", "LimitLoadToSessionType": "Aqua",
                  "StandardOutPath": str(base / "app.log"), "StandardErrorPath": str(base / "app.log")}
    agent.write_bytes(plistlib.dumps(definition))
    os.chmod(agent, 0o600)
    print("Public worker key:", base64.b64encode(key.public_key().public_bytes_raw()).decode())
    print("Installed app:", app)
    if args.start:
        run("launchctl", "bootstrap", f"gui/{os.getuid()}", str(agent))
        print("Login service started; initial setup is paused until enabled.")


if __name__ == "__main__":
    main()
