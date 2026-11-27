# The import worker

The worker downloads YouTube audio for the relay (see [YouTube imports](youtube-import.md)). It runs on an always-on Windows PC (D23). It ran on a Mac until 2026-11-16, and `macos/` can still put it back there. Both use the same `backend/worker.py`, the same relay and the same job protocol; only the installer, how it is started and the controls differ.

The worker makes signed outbound HTTPS requests to the relay at `https://sloverb-import.onrender.com` and nothing else. It opens no listening port and accepts no remote commands, and the relay holds only its public key. It uses the `onrender.com` address rather than `api.sloverb.app` because no ad blocker is in its way, and changing it would mean reinstalling. YouTube sees the machine's public IP.

Since 2026-11-27 the worker also keeps a journal of what visitors asked for, which it collects from the relay over the same signed channel, and there are commands to watch it live. That is [the journal](analytics.md). Two things there are started by hand and are not the worker: `dashboard`, which serves a page to this machine's own browser on `127.0.0.1`, and `geo`, which downloads a city database from db-ip.com.

## How it runs on Windows

A scheduled task called `Sloverb Worker` starts 30 seconds after boot, before anyone logs in, as the installing user's own account (S4U logon: no stored password, not elevated). It runs `windows/service.py run`, a small supervisor that starts `backend.worker` and restarts it 10 seconds after a crash. The task is restarted every minute if it fails, has no time limit and ignores battery and idle settings. After a restart the worker comes back by itself, no login needed.

The supervisor holds the worker in a Windows job object (`backend/winjob.py`), and each extraction (yt-dlp and FFmpeg) gets one of its own. Ending the task or cancelling an import kills everything inside, even children whose parent already exited, which is what `os.killpg` does on macOS. A venv's `python.exe` is only a launcher that starts the real interpreter as a child, so processes are started suspended and only let run once they are in the job, or the real interpreter would escape it.

While imports are on, the worker asks Windows not to sleep when idle (`SetThreadExecutionState`, the equivalent of `caffeinate -i`); the screen can still turn off. Shutdown, an explicit sleep or losing the network interrupts service: visitors get `imports are offline, try later` and an unfinished job times out.

Battery rules (`battery_policy` in `backend/worker.py`): a machine with no battery reports 100% on AC power and never pauses. On a laptop, at 10% or below while unplugged the worker cancels the current job and pauses, and resume is refused until it is plugged in or back at 20%.

## Controls

There is no tray icon. The controls are one command, none of which needs administrator rights:

```
"%LOCALAPPDATA%\Sloverb Worker\sloverb-worker.cmd" status
"%LOCALAPPDATA%\Sloverb Worker\sloverb-worker.cmd" pause
"%LOCALAPPDATA%\Sloverb Worker\sloverb-worker.cmd" resume
```

`status` prints `state.json` (`status`, `relay_online`, `enabled`, `pause_reason`, `jobs_finished`) and how long ago the worker last wrote it; over 10 seconds means it isn't running. `pause` and `resume` write `control.json`, which the worker reads every second, and the choice survives restarts.

The same command reads the journal: `watch` (each request as it arrives), `dashboard` (the same in a browser, with charts), `stats`, `songs` and `imports` (sums as text), and `geo` (fetch the city database). See [the journal](analytics.md).

`worker.log` is the first place to look when something is wrong. Each line is dated and says what the worker did: `started`, `paused (manual)`, `taking imports`, `relay online`, `relay offline (HTTPStatusError 401)`, and for each job what it was and how it ended, with the extractor's own words when a download failed. A 401 from the relay is nearly always the machine's clock being more than 90 seconds out, or a different key on Render. Nothing in the worker keeps the clock in time. On Windows that is the Windows Time service, so check it is running (`w32tm /query /status`).

Also useful: `schtasks /Query /TN "Sloverb Worker" /V /FO LIST` for whether the task is running and its last result, and `curl https://api.sloverb.app/healthz` for whether the relay can see the worker (`"available": true`).

## Install or update on Windows

Requirements: Windows 10 or 11, Python 3.12+, Node 22+ and FFmpeg. From a checkout of this repository:

```
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.venv\Scripts\python.exe windows\install.py --start
```

The task starts before login, so the installer records where it found Node and FFmpeg; if either moves, run the installer again. Windows asks once for administrator approval (UAC), which it needs to register a task that runs before login. The installer builds a fresh runtime beside the old one, then the approved step stops the running task, swaps the new runtime in, registers the task and starts it, logging to `install-task.log`. The private key and the pause setting are kept. The same step gives the journal's folder the permissions of the folder it is in (`icacls /reset`), because the first build to keep a journal made it one that only an administrator terminal could open (see `analytics\` below).

**A first install** generates a new key, prints only the public half and starts paused. Put that public key in `WORKER_PUBLIC_KEY` in `render.yaml` (and in the Render dashboard if it differs), deploy, then `resume`. Render holds one key, so whichever machine's key is there is the only worker it accepts.

**Updating.** The worker runs the copy of `backend/` taken when the installer last ran, not the checkout. A change to `backend/` reaches Render on push but reaches the worker only when the installer is run again, so keep the job protocol (`"version": 1`) backward compatible in between. The installer waits for anything still running from the old copy, a `watch` or a `dashboard` left open included, and stops it after 30 seconds.

## Installed files

All in `%LOCALAPPDATA%\Sloverb Worker`:

- `runtime\`: the copy of `backend\`, `service.py` and an isolated venv
- `worker.key`: the private signing key. The installer removes inherited permissions and leaves only the installing account and SYSTEM, the equivalent of mode 0600. Never copy it anywhere or commit it.
- `config.json`, `control.json`, `state.json`: the relay address and tool paths, the saved pause choice, the worker's status
- `worker.log`, `worker.previous.log`, `app.log`: diagnostics (`app.log` is the supervisor's). Each is moved aside once it has passed half a megabyte, the next time the worker starts, so they are for what happened lately, not history.
- `analytics\`: the journal, `events-YYYY-MM.jsonl`, a file a month. It holds visitors' addresses and what they asked for, so treat it like the key: never copy it into the checkout or commit it. An install or update leaves what is in it alone. It has the permissions of the folder it is in, which belongs to the installing account, and none of its own: the worker creates it, and what the boot task creates is owned by the Administrators group rather than the person, so a folder kept to "its owner" is one the person can't read from an ordinary terminal (`Journal.keep` in `backend/analytics.py`).
- `geo\`: the city database, if `geo` has been run
- `sloverb-worker.cmd`: the controls above
- `task.xml`, `install-task.log`: the task definition and the last approved install step

## Stopping and uninstalling

To stop it until the next boot, `pause` it, or run `schtasks /End /TN "Sloverb Worker"` as administrator. To uninstall, run `schtasks /Delete /TN "Sloverb Worker" /F` as administrator, then delete the folder. Deleting the folder deletes the key, so a reinstall needs its new public key in Render.

## On macOS

`macos/install.py` installs the same worker as a menu bar app (`macos/WorkerApp.swift`) started at login by a LaunchAgent, with pause, resume and battery notices in the menu. It needs macOS 13+, Python 3.12+, the Xcode command-line tools, and Node and FFmpeg in `/opt/homebrew/bin` or `/usr/local/bin`:

```bash
.venv/bin/python macos/install.py --relay https://sloverb-import.onrender.com --start
```

Files live in `~/Library/Application Support/Sloverb Worker` (the app, `runtime`, `worker.key` at mode 0600, the same JSON and log files, and the same `analytics` folder, read with `python3 -m backend.analytics`, see [the journal](analytics.md)) and `~/Library/LaunchAgents/app.sloverb.worker.plist`. Stop it with `launchctl bootout gui/$(id -u)/app.sloverb.worker`. It only works while the Mac is awake and logged in, which is why the worker moved to Windows. Since then Render holds the Windows key, so a Mac worker is refused until its own public key is put back in Render.
