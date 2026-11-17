"""Windows job objects: stop a process and everything it started, together.

Windows has no process groups to signal (`os.killpg`). A job object holds a
process and every process it starts, and closing the job kills them all, even
if the process in the middle has already exited. A venv's `python.exe` is only
a launcher that starts the real interpreter as a child, so a process has to be
started suspended and put in the job before it runs, or that child escapes.
"""
import ctypes
from ctypes import wintypes

CREATE_SUSPENDED = 0x00000004
CREATE_NO_WINDOW = 0x08000000
_KILL_ON_JOB_CLOSE = 0x00002000
_EXTENDED_LIMITS = 9
_PROCESS_ACCESS = 0x0001 | 0x0100 | 0x0800  # terminate, set quota, suspend/resume


class _Basic(ctypes.Structure):
    _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]


class _Extended(ctypes.Structure):
    _fields_ = [("BasicLimitInformation", _Basic), ("IoInfo", ctypes.c_uint64 * 6),
                ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]


_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
_ntdll = ctypes.WinDLL("ntdll")
_kernel32.CreateJobObjectW.restype = wintypes.HANDLE
_kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
_kernel32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
_kernel32.OpenProcess.restype = wintypes.HANDLE
_kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
_kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
_kernel32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
_kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
_ntdll.NtResumeProcess.argtypes = [wintypes.HANDLE]


def _check(result):
    if not result:
        raise ctypes.WinError(ctypes.get_last_error())
    return result


class ProcessGroup:
    """Every process added here, and all of their children, die with `close()`
    or when this process exits, whichever comes first."""

    def __init__(self):
        self.handle = _check(_kernel32.CreateJobObjectW(None, None))
        limits = _Extended()
        limits.BasicLimitInformation.LimitFlags = _KILL_ON_JOB_CLOSE
        _check(_kernel32.SetInformationJobObject(self.handle, _EXTENDED_LIMITS, ctypes.byref(limits), ctypes.sizeof(limits)))

    def add(self, pid: int):
        """Put a process started with CREATE_SUSPENDED in the job, then let it run."""
        process = _check(_kernel32.OpenProcess(_PROCESS_ACCESS, False, pid))
        try:
            _check(_kernel32.AssignProcessToJobObject(self.handle, process))
            if _ntdll.NtResumeProcess(process) != 0:
                raise OSError("couldn't resume process")
        finally:
            _kernel32.CloseHandle(process)

    def close(self):
        if self.handle:
            _kernel32.TerminateJobObject(self.handle, 1)
            _kernel32.CloseHandle(self.handle)
            self.handle = None
