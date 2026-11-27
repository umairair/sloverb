"""Install or update the Windows worker and its boot-time scheduled task.

Run from the checkout with Python 3.12+: `python windows\\install.py --start`.
Asks once for administrator approval (UAC), which Windows needs to register a
task that runs before anyone logs in.
"""
import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

TASK = "Sloverb Worker"
SYSTEM32 = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"


def run(*args, **kwargs):
    subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def current_sid():
    output = subprocess.run([SYSTEM32 / "whoami.exe", "/user", "/fo", "csv", "/nh"], capture_output=True, text=True, check=True).stdout
    return output.strip().split(",")[-1].strip('"')


def task_xml(sid: str, runtime: Path):
    # S4U: runs as this user whether or not anyone is logged in, without storing
    # a password. LeastPrivilege: not elevated. No time limit; restart on failure.
    pythonw = runtime / ".venv" / "Scripts" / "pythonw.exe"
    return f"""<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>sloverb YouTube import worker. Outbound HTTPS to the Render relay only, no listening port.</Description></RegistrationInfo>
  <Triggers><BootTrigger><Enabled>true</Enabled><Delay>PT30S</Delay></BootTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>{escape(sid)}</UserId><LogonType>S4U</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author"><Exec>
    <Command>{escape(str(pythonw))}</Command>
    <Arguments>"{escape(str(runtime / "service.py"))}" run</Arguments>
    <WorkingDirectory>{escape(str(runtime))}</WorkingDirectory>
  </Exec></Actions>
</Task>
"""


def elevated_script(base: Path, xml: Path, start: bool):
    def quote(value):
        return "'" + str(value).replace("'", "''") + "'"

    schtasks = quote(SYSTEM32 / "schtasks.exe")
    return f"""
# Not 'Stop' for the whole script: Windows PowerShell 5.1 then treats any
# stderr from schtasks (such as "task not found" on a first install) as fatal.
$base = {quote(base)}
Start-Transcript -Path "$base\\install-task.log" -Force | Out-Null
$found = (Start-Process -FilePath {schtasks} -ArgumentList '/Query','/TN','"{TASK}"' -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$base\\query.txt" -RedirectStandardError "$base\\query-error.txt").ExitCode -eq 0
Remove-Item "$base\\query.txt","$base\\query-error.txt" -ErrorAction SilentlyContinue
if ($found) {{ & {schtasks} /End /TN {quote(TASK)} | Out-Null }}
$deadline = (Get-Date).AddSeconds(30)
while ($left = Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -and $_.CommandLine.Contains($base) }}) {{
  if ((Get-Date) -gt $deadline) {{ $left | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }} }}
  Start-Sleep -Milliseconds 500
}}
# A worker from before the fix of 2026-11-27 made the journal's folder open to
# administrators only, so an ordinary terminal read nothing from it. Give it and
# what is in it back what the folder above passes down. Only this step can.
if (Test-Path "$base\\analytics") {{ & {quote(SYSTEM32 / "icacls.exe")} "$base\\analytics" /reset /T /C /Q | Out-Null }}
if (Test-Path "$base\\runtime") {{ Remove-Item -Recurse -Force "$base\\runtime" -ErrorAction Stop }}
Rename-Item "$base\\runtime.new" 'runtime' -ErrorAction Stop
& {schtasks} /Create /TN {quote(TASK)} /XML {quote(xml)} /F
if ($LASTEXITCODE -ne 0) {{ exit 2 }}
{"& " + schtasks + " /Run /TN " + quote(TASK) if start else ""}
exit 0
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--relay", default="https://sloverb-import.onrender.com")
    parser.add_argument("--start", action="store_true", help="start the worker now, not only at the next boot")
    args = parser.parse_args()
    if sys.platform != "win32":
        parser.error("this installer is for Windows; use macos/install.py on a Mac")
    if sys.version_info < (3, 12):
        parser.error("run this with Python 3.12 or newer")
    root = Path(__file__).resolve().parent.parent
    tools = {}
    for dependency in ("node", "ffmpeg"):
        found = shutil.which(dependency)
        if not found:
            parser.error(f"{dependency} must be installed and on PATH before installing the worker")
        tools[dependency] = str(Path(found).resolve().parent)
    base = Path(os.environ["LOCALAPPDATA"]) / "Sloverb Worker"
    base.mkdir(parents=True, exist_ok=True)
    key_path = base / "worker.key"
    if not key_path.exists():
        with key_path.open("xb") as output:
            output.write(Ed25519PrivateKey.generate().private_bytes_raw())
    # Like mode 0600 on the Mac: drop what the profile folder passes down, keep
    # only this user and SYSTEM (which runs Task Scheduler).
    sid = current_sid()
    run(SYSTEM32 / "icacls.exe", key_path, "/inheritance:r", "/grant:r", f"*{sid}:F", "*S-1-5-18:F", stdout=subprocess.DEVNULL)
    key = Ed25519PrivateKey.from_private_bytes(key_path.read_bytes())
    (base / "config.json").write_text(json.dumps({"relay": args.relay, "path": sorted(set(tools.values()))}))
    control = base / "control.json"
    if not control.exists():
        control.write_text(json.dumps({"enabled": False, "reason": "setup"}))

    # Build the new runtime beside the old one; the elevated step swaps them once
    # the running worker has stopped, so a running worker never sees half a copy.
    staged = base / "runtime.new"
    shutil.rmtree(staged, ignore_errors=True)
    staged.mkdir()
    shutil.copytree(root / "backend", staged / "backend", ignore=shutil.ignore_patterns("__pycache__", "tests", "pot-provider"))
    shutil.copy2(root / "windows" / "service.py", staged / "service.py")
    run(sys.executable, "-m", "venv", staged / ".venv")
    run(staged / ".venv" / "Scripts" / "python.exe", "-m", "pip", "install", "--disable-pip-version-check", "-q",
        "-r", root / "backend" / "requirements-worker.txt")
    (base / "sloverb-worker.cmd").write_text('@"%~dp0runtime\\.venv\\Scripts\\python.exe" "%~dp0runtime\\service.py" %*\r\n')

    xml = base / "task.xml"
    xml.write_text(task_xml(sid, base / "runtime"), encoding="utf-16")
    script = base64.b64encode(elevated_script(base, xml, args.start).encode("utf-16-le")).decode()
    powershell = SYSTEM32 / "WindowsPowerShell" / "v1.0" / "powershell.exe"
    print("Windows will ask for administrator approval to register the boot task...")
    result = subprocess.run([str(powershell), "-NoProfile", "-Command",
                             f"$p = Start-Process -FilePath '{powershell}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden "
                             f"-ArgumentList '-NoProfile','-EncodedCommand','{script}'; exit $p.ExitCode"])
    if result.returncode != 0:
        sys.exit(f"Registering the task failed or was declined (exit {result.returncode}). See {base / 'install-task.log'}, then run this again.")
    print("Public worker key:", base64.b64encode(key.public_key().public_bytes_raw()).decode())
    print("Installed in:", base)
    print("Task:", TASK, "(starts at boot, before login)")
    if args.start:
        print("Started. A first install stays paused until you run:", base / "sloverb-worker.cmd", "resume")


if __name__ == "__main__":
    main()
