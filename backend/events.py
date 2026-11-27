"""What the relay notices about each request, held in memory until the worker at home collects it.

Render keeps none of it. Nothing here is written to its disk or its logs, it is
capped in size, and it is gone when the process restarts. Only the worker can
read it, over the signed channel it already claims jobs with
(`/internal/worker/events` in relay.py), and the worker keeps it on the PC
(backend/analytics.py). See docs/analytics.md.
"""
import hashlib
import ipaddress
import re
import secrets
import time
from collections import deque
from itertools import islice

# Control characters, line separators, and the invisible ones that turn text round
# to show it as something it isn't. Whoever sends a request writes its headers,
# and they end up in a terminal and on a page. Joiners are left alone: emoji and
# several alphabets need them.
CONTROL = re.compile("[\x00-\x1f\x7f-\x9f\N{LINE SEPARATOR}-\N{RIGHT-TO-LEFT OVERRIDE}"
                     "\N{LEFT-TO-RIGHT ISOLATE}-\N{POP DIRECTIONAL ISOLATE}\N{ZERO WIDTH NO-BREAK SPACE}]")
ID = re.compile(r"(?<=/)[A-Za-z0-9_-]{32,}(?=/|$)")


def clean(value, limit=200):
    if not isinstance(value, str):
        return None
    # a lone surrogate can't be written to a file as UTF-8
    return CONTROL.sub("", value.encode("utf-8", "replace").decode("utf-8"))[:limit] or None


def tag(job_id: str) -> str:
    """A job's id lets anyone holding it read or cancel that job, so it never goes
    in an event. This stands in for it, and can't be turned back into one."""
    return hashlib.sha256(job_id.encode()).hexdigest()[:10]


def place(path: str) -> str:
    return clean(ID.sub(":id", path), 200) or "/"


def visitor(request) -> dict:
    """Who is asking, as far as the request says. Render's edge is Cloudflare, which
    writes the address it saw and the country that address is in. Without those
    (development, or if Render stops passing them on) the address is uvicorn's,
    the first `X-Forwarded-For` entry, which a visitor can write themselves, so
    the whole chain is kept beside it whenever the two don't agree."""
    headers = request.headers
    ip = headers.get("cf-connecting-ip") or headers.get("true-client-ip") or (request.client.host if request.client else "")
    try:
        ip = str(ipaddress.ip_address(ip.strip()))
    except ValueError:
        ip = clean(ip, 45)
    chain = clean(headers.get("x-forwarded-for"), 200)
    country = headers.get("cf-ipcountry", "")
    edge = headers.get("cf-ray", "").rpartition("-")[2]
    return {
        "ip": ip,
        "forwarded": chain if chain and chain != ip else None,
        # XX is Cloudflare's word for "unknown". T1 is Tor, which is worth seeing.
        "country": country if re.fullmatch(r"[A-Z][A-Z0-9]", country) and country != "XX" else None,
        # the airport code of the Cloudflare site that took the request, usually the nearest one to the visitor
        "edge": edge if re.fullmatch(r"[A-Z]{3}", edge) else None,
        "agent": clean(headers.get("user-agent"), 300),
        "language": clean(headers.get("accept-language", "").split(",")[0].split(";")[0].strip(), 20),
        "origin": clean(headers.get("origin"), 100),
        "referer": clean(headers.get("referer"), 200),
    }


class Events:
    """A numbered list with a ceiling. The worker says how far it has read and gets
    what came after, so an answer lost on the way home is simply sent again."""

    def __init__(self, limit=5000, rate=5.0, burst=300):
        # a new name each time the process starts, so the worker can tell the numbering began again
        self.boot = secrets.token_hex(8)
        self.limit, self.rate, self.burst = limit, rate, burst
        self.held: deque[dict] = deque()
        self.seq = 0
        self.dropped = 0
        self.allowance, self.stamp = float(burst), time.monotonic()

    def emit(self, kind: str, budget=True, **fields):
        if budget:
            # Anyone can make requests as fast as they like, and every one kept
            # here ends up on a disk at home. Past a burst, only so many a second are kept.
            now = time.monotonic()
            self.allowance = min(float(self.burst), self.allowance + (now - self.stamp) * self.rate)
            self.stamp = now
            if self.allowance < 1:
                self.dropped += 1
                return
            self.allowance -= 1
        if len(self.held) >= self.limit:
            self.held.popleft()
            self.dropped += 1
        self.seq += 1
        self.held.append({"seq": self.seq, "at": round(time.time(), 3), "kind": kind,
                          **{name: value for name, value in fields.items() if value is not None}})

    def since(self, boot, after, limit=500):
        if boot == self.boot and type(after) is int:
            while self.held and self.held[0]["seq"] <= after:
                self.held.popleft()
        return {"boot": self.boot, "events": list(islice(self.held, limit)), "dropped": self.dropped}
