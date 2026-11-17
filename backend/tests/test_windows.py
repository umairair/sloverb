import asyncio
import ctypes
import subprocess
import sys
import time

import pytest

from backend.worker import PowerStatus, main, windows_battery

windows = pytest.mark.skipif(sys.platform != "win32", reason="Windows only")


def status(ac, flag, percent):
    result = PowerStatus()
    result.ACLineStatus, result.BatteryFlag, result.BatteryLifePercent = ac, flag, percent
    return result


def test_windows_power_status():
    assert windows_battery(status(1, 128, 255)) == (100, True)  # desktop, no battery
    assert windows_battery(status(0, 8, 42)) == (42, False)
    assert windows_battery(status(1, 8, 9)) == (9, True)
    with pytest.raises(RuntimeError):
        windows_battery(status(255, 255, 255))


def test_second_worker_exits_while_first_holds_the_lock(tmp_path):
    # No config here, so a worker that got past the lock would raise.
    holder = (tmp_path / "worker.lock").open("w")
    if sys.platform == "win32":
        import msvcrt
        msvcrt.locking(holder.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
    asyncio.run(main(tmp_path))
    holder.close()


def alive(pid):
    handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
    if not handle:
        return False
    code = ctypes.c_ulong()
    ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
    ctypes.windll.kernel32.CloseHandle(handle)
    return code.value == 259


@windows
def test_job_object_kills_the_whole_tree():
    from backend.winjob import CREATE_NO_WINDOW, CREATE_SUSPENDED, ProcessGroup

    # In a venv, sys.executable is a launcher that starts the real interpreter as
    # a child, so this is three levels deep: launcher, python, grandchild.
    code = ("import subprocess, sys, time; child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)']);"
            "print(child.pid, flush=True); time.sleep(60)")
    group = ProcessGroup()
    process = subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE, text=True,
                               creationflags=CREATE_SUSPENDED | CREATE_NO_WINDOW)
    try:
        group.add(process.pid)
        grandchild = int(process.stdout.readline())
        assert alive(grandchild)
    finally:
        group.close()
    process.wait(timeout=5)
    for _ in range(50):
        if not alive(grandchild):
            break
        time.sleep(0.05)
    assert not alive(grandchild)
