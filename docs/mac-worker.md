# Mac worker

The worker makes signed outbound HTTPS requests to `https://sloverb-import.onrender.com`. It downloads only validated public YouTube video URLs, converts with the existing extractor and uploads MP3 bytes to the relay. It opens no listening port, forwards no router ports and accepts no remote commands. The relay stores only the public signing key. App visitors receive the relay address, never the Mac address, hostname or battery details.

A successful download still depends on YouTube accepting this connection. With no VPN, YouTube sees the home connection's public IP, and the ISP or a network administrator can observe destinations and traffic patterns. HTTPS encrypts request content; this setup does not make internet activity invisible.

## Power and controls

The `sloverb` menu bar item offers pause, resume, status and quit until next login. The login app restarts a crashed Python child, and the child exits if its menu app disappears. It starts automatically after this user logs in. Screen lock and display sleep are supported. An idle-sleep assertion is held while enabled, and released when paused or stopped.

Actual sleep, a closed lid that causes sleep, logout, shutdown or loss of internet interrupts service. The Mac cannot process jobs while asleep, and startup before login is not provided. Visitors get an offline error when worker heartbeats expire; unfinished jobs time out instead of remaining queued indefinitely.

At 10% battery or below while unplugged, extraction and conversion are cancelled, new work is declined and the pause is saved across restarts. A notification offers Resume after AC power is connected or the battery recovers to 20%. Downloads wait for that action; they do not automatically restart. The menu also provides Resume. At 10% or below on battery, Resume is refused. macOS notification permission must be enabled for banners, while menu controls work independently.

## Install or update

Requirements: macOS 13+, Python 3.12+, Xcode command-line tools, Node 22+ and FFmpeg on `/opt/homebrew/bin` or `/usr/local/bin`. Install backend dependencies in the checkout first, then:

```bash
.venv/bin/python macos/install.py --relay https://sloverb-import.onrender.com --start
```

The installer preserves the private key and pause setting. A first install starts paused; resume from the menu after configuring the matching public key in Render. It prints only the public key. Keep the broker origin pinned to the configured HTTPS address.

Installed files:

- `~/Library/Application Support/Sloverb Worker/Sloverb Worker.app`: menu app
- `~/Library/Application Support/Sloverb Worker/runtime`: isolated Python runtime
- `~/Library/Application Support/Sloverb Worker/worker.key`: private signing key, mode 0600 in a mode 0700 directory
- `config.json`, `control.json`, `state.json`: relay configuration, saved pause choice and local status
- `worker.log`, `worker.previous.log`, `app.log`: local diagnostics
- `~/Library/LaunchAgents/app.sloverb.worker.plist`: login service

The worker and relay use version 1 of the job protocol. GitHub CI validates frontend tests/build, Python tests, the Docker image and the native app compilation. Vercel and Render deploy from `main` automatically. Mac runtime updates are installed with the command above; arbitrary code is never downloaded or executed from relay jobs.

## Bounds and recovery

One extraction runs at a time. Existing duration, file-size, time and public rate limits remain in force. Signed messages include timestamps, nonces and body hashes; replays and expired job leases are rejected. The worker revalidates YouTube URLs locally. Cancelling a browser import stops the next worker progress request and kills the extractor process group. Temporary audio is deleted locally after success, failure or cancellation; relay audio expires after ten minutes and is normally deleted as soon as the browser receives it.

Render uses ephemeral storage, so a deployment or restart can expire an in-progress job. Retry from the app. A lost MP3-upload acknowledgement can be retried without creating a second job. Health reports worker availability, not a guarantee that YouTube will accept a particular video. No account cookies or YouTube credentials are collected.

To stop the login service:

```bash
launchctl bootout gui/$(id -u)/app.sloverb.worker
```

To start it again:

```bash
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/app.sloverb.worker.plist"
```

To uninstall, stop it, then remove its LaunchAgent and application support directory. Removing the directory deletes its signing key, so a later reinstall needs a new public key configured in Render. Do not share that private key or include it in the repository.
