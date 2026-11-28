"""The worker's journal: what visitors asked for and what became of it, kept on the machine at home.

backend/worker.py writes it, one JSON object a line, a file a month, in
`analytics/` beside the worker's key. The commands at the foot of this file
(`watch`, `stats`, `songs`, `imports`, `geo`) and backend/dashboard.py read it.
Nothing here needs anything but Python, and only `geo` touches the network.
What each kind of event is, and what is and isn't kept, is in docs/analytics.md.
"""
import argparse
import json
import math
import os
import re
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from backend.events import CONTROL

KIND = re.compile(r"[a-z][a-z.]{0,39}\Z")
NAME = re.compile(r"[a-z_]{1,20}\Z")
# The years 2000 to 2100, in seconds. A time outside them is damage, and Windows
# refuses to turn some of them into a date at all, which would stop every command.
SANE = (946684800, 4102444800)


def tidy(event):
    """An event as the relay sent it, cut down to what is safe to keep and print.
    The relay is ours, but it is also the one part of this on the open internet."""
    if not isinstance(event, dict) or type(event.get("seq")) is not int or not isinstance(event.get("kind"), str):
        return None
    if not KIND.match(event["kind"]) or type(event.get("at")) not in {int, float} or not SANE[0] < event["at"] < SANE[1]:
        return None
    kept = {}
    for name, value in list(event.items())[:40]:
        if not isinstance(name, str) or not NAME.match(name):
            continue
        if isinstance(value, str):
            kept[name] = CONTROL.sub("", value.encode("utf-8", "replace").decode("utf-8"))[:400]
        elif isinstance(value, bool) or type(value) is int or type(value) is float and math.isfinite(value):
            kept[name] = value
    return kept


class Journal:
    # A month's file stops growing here, so nothing a stranger sends can fill the disk.
    LIMIT = 256 * 1024 * 1024

    def __init__(self, directory: Path):
        self.directory = Path(directory)

    def keep(self, events) -> bool:
        if not events:
            return True
        try:
            # 0o700 keeps the folder to the person on macOS. On Windows Python makes of
            # that mode a list of its own, open to "the owner", and what a task started
            # at boot creates is owned by the Administrators group, not by the person:
            # they could not read their own journal from an ordinary terminal. So there
            # it takes after the folder it is in, which is theirs alone already.
            self.directory.mkdir(parents=True, exist_ok=True, **({} if sys.platform == "win32" else {"mode": 0o700}))
            path = self.directory / time.strftime("events-%Y-%m.jsonl", time.gmtime())
            fresh = not path.exists()
            if not fresh and path.stat().st_size > self.LIMIT:
                return False
            with path.open("a", encoding="utf-8", errors="replace", newline="\n") as output:
                if fresh:
                    os.chmod(path, 0o600)
                output.write("".join(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n" for event in events))
            return True
        except (OSError, ValueError):
            return False

    def note(self, kind: str, **fields):
        """Something the worker itself did or saw."""
        event = {"at": round(time.time(), 3), "kind": kind, "src": "worker",
                 **{name: value for name, value in fields.items() if value is not None}}
        self.keep([event])
        return event

    def files(self):
        return sorted(self.directory.glob("events-*.jsonl"))

    def read(self, since: float = 0):
        """Every event from `since` on, oldest first."""
        month = time.strftime("events-%Y-%m.jsonl", time.gmtime(since)) if since else ""
        for path in self.files():
            if path.name < month:
                continue
            try:
                with path.open("r", encoding="utf-8", errors="replace") as lines:
                    for line in lines:
                        event = parse(line)
                        if event and event["at"] >= since:
                            yield event
            except OSError:
                continue

    def recent(self, count: int, reach=262144):
        """The last `count` events, read from the end of the newest files."""
        found: list[dict] = []
        for path in reversed(self.files()):
            try:
                with path.open("rb") as data:
                    size = data.seek(0, os.SEEK_END)
                    data.seek(max(0, size - reach))
                    lines = data.read().split(b"\n")
            except OSError:
                continue
            if size > reach:
                lines = lines[1:]  # the first is the back half of a line
            events = [event for event in map(parse, lines) if event]
            found = events[-(count - len(found)):] + found if count > len(found) else found
            if len(found) >= count:
                break
        return found

    def cursor(self):
        """How far the relay's list had been read when the worker last wrote, so a
        restart carries on from there instead of keeping the same events twice."""
        for event in reversed(self.recent(2000)):
            if event.get("src") == "relay" and isinstance(event.get("boot"), str) and type(event.get("seq")) is int:
                return event["boot"], event["seq"]
        return None, 0


def parse(line):
    try:
        event = json.loads(line)
    except ValueError:
        return None
    if isinstance(event, dict) and isinstance(event.get("kind"), str) and type(event.get("at")) in {int, float} and SANE[0] < event["at"] < SANE[1]:
        return event
    return None


class Tail:
    """New events since the last look, for something that shows them as they come."""

    def __init__(self, journal: Journal):
        self.journal = journal
        files = journal.files()
        self.path = files[-1] if files else None
        try:
            self.offset = self.path.stat().st_size if self.path else 0
        except OSError:
            self.offset = 0
        self.rest = b""

    def poll(self):
        events = []
        paths = ([self.path] if self.path else []) + [path for path in self.journal.files() if not self.path or path.name > self.path.name]
        for path in paths:
            if path != self.path:
                self.path, self.offset, self.rest = path, 0, b""
            try:
                with path.open("rb") as data:
                    data.seek(self.offset)
                    more = data.read()
            except OSError:
                continue
            self.offset += len(more)
            *lines, self.rest = (self.rest + more).split(b"\n")
            events += [event for event in map(parse, lines) if event]
        return events


# How things are said, to a person.

def clock(at, date=False):
    return time.strftime("%Y-%m-%d %H:%M:%S" if date else "%H:%M:%S", time.localtime(at))


def size(count):
    if type(count) not in {int, float}:
        return ""
    return f"{count / 1048576:.1f} MB" if count >= 104858 else f"{count / 1024:.0f} KB"


def took(seconds):
    if type(seconds) not in {int, float}:
        return ""
    return f"{seconds:.1f}s" if seconds < 60 else f"{int(seconds // 60)}m {int(seconds % 60):02d}s"


def device(agent):
    """Roughly what someone is on. A browser says a great deal more than this, and most of it is noise."""
    if not isinstance(agent, str) or not agent:
        return "unknown"
    text = agent.lower()
    # every browser calls itself Mozilla, and so do the better mannered crawlers
    if "mozilla" not in text or any(word in text for word in ("bot", "crawl", "spider", "scan", "headless", "monitor")):
        return "bot"
    system = next((name for word, name in (("iphone", "iPhone"), ("ipad", "iPad"), ("android", "Android"), ("windows", "Windows"),
                                           ("cros", "ChromeOS"), ("mac os", "Mac"), ("linux", "Linux")) if word in text), "other")
    browser = next((name for word, name in (("edg", "Edge"), ("opr/", "Opera"), ("samsungbrowser", "Samsung"), ("firefox", "Firefox"),
                                            ("fxios", "Firefox"), ("crios", "Chrome"), ("chrome", "Chrome"), ("safari", "Safari")) if word in text), "other")
    return f"{system} {browser}"


def where(event):
    parts = [event.get("city"), event.get("region") if event.get("region") != event.get("city") else None, event.get("country")]
    return ", ".join(part for part in parts if isinstance(part, str) and part)


def who(event):
    parts = [event.get("ip"), where(event) or (f"via {event['edge']}" if event.get("edge") else None),
             device(event.get("agent")) if event.get("agent") else None]
    return "  ".join(part for part in parts if part)


def titled(event):
    name = event.get("title") or event.get("video") or ""
    return f"\"{name}\"" if event.get("title") else name


def said(event):
    """What to call an event, and what happened, in a few words."""
    kind, job = event["kind"], event.get("job")
    seconds = took(event.get("seconds"))
    say = lambda *parts: "  ".join(str(part) for part in parts if part not in (None, ""))  # noqa: E731
    if kind == "import.queued":
        return "asked", say(job, event.get("video"), who(event))
    if kind == "import.rejected":
        return "refused", say(event.get("reason"), event.get("video"), who(event))
    if kind == "import.claimed":
        return "claimed", say(job, f"after {seconds}")
    if kind == "import.ready":
        return "ready", say(job, titled(event), f"{size(event.get('bytes'))} in {seconds}")
    if kind == "import.failed":
        return "failed", say(job, event.get("error"), titled(event), f"after {seconds}")
    if kind == "import.cancelled":
        return "cancelled", say(job, f"while {event.get('while', 'waiting')}, after {seconds}", who(event))
    if kind == "import.fetched":
        return "fetched", say(job, size(event.get("bytes")), who(event))
    if kind == "import.expired":
        return "expired", say(job, "never collected" if event.get("status") == "ready" and not event.get("fetched") else "left behind")
    if kind == "request":
        return "request", say(f"{event.get('method', '')} {event.get('path', '')} {event.get('status', '')}", who(event))
    if kind == "job.claimed":
        return "job", say(job, f"started {event.get('video', '')}")
    if kind == "job.info":
        by = event.get("artist") or event.get("channel")
        return "job", say(job, f"is {titled(event)}" + (f" by {by}" if by else "") + (f", {took(event['duration'])}" if event.get("duration") else ""))
    if kind == "job.done":
        steps = ", ".join(f"{name} {took(event[name])}" for name in ("found", "download", "convert", "upload") if name in event)
        return "job", say(job, f"sent {size(event.get('bytes'))} in {seconds}" + (f" ({steps})" if steps else "")
                          + (f", on go {event['tries']}" if event.get("tries") else ""))
    if kind == "job.retried":
        return "job", say(job, f"trying again after: {event.get('error', '')}" + (f" ({event['detail']})" if event.get("detail") else ""))
    if kind == "job.failed":
        return "job", say(job, f"failed{' after ' + str(event['tries']) + ' goes' if event.get('tries') else ''}: {event.get('error', '')}"
                          + (f" ({event['detail']})" if event.get("detail") else ""))
    if kind == "job.stopped":
        return "job", say(job, f"stopped: {event.get('reason', '')}")
    if kind == "board.opened":
        return "board", say("signed in to the dashboard", who(event))
    if kind == "board.refused":
        return "board", say(f"dashboard refused: {event.get('why', '')}", who(event))
    if kind == "worker.started":
        return "worker", "started" + (f", yt-dlp {event['extractor']}" if event.get("extractor") else "")
    if kind == "worker.paused":
        return "worker", f"paused ({str(event.get('reason', 'manual')).replace('_', ' ')})"
    if kind == "worker.resumed":
        return "worker", "taking imports"
    if kind == "worker.relay":
        return "worker", "relay online" if event.get("online") else "relay offline" + (f" ({event['why']})" if event.get("why") else "")
    if kind == "worker.journal":
        if event.get("lost"):
            return "worker", f"couldn't write {event['lost']} events to the journal, the disk or this month's file is full"
        return "worker", f"the relay let go of {event.get('dropped', 'some')} requests it had no room for"
    rest = " ".join(f"{name} {value}" for name, value in event.items() if name not in {"at", "kind", "src", "seq", "boot"})
    return ("worker", f"{kind[7:]} {rest}".strip()) if kind.startswith("worker.") else (kind, rest)


COLOURS = {"ready": "32", "fetched": "32", "failed": "31", "refused": "33", "cancelled": "33", "expired": "33",
           "asked": "36", "request": "2", "worker": "35", "job": "2", "board": "33"}


def line(event, date=False, colour=False):
    label, rest = said(event)
    # what came from outside is printed, never obeyed: no escape sequence survives this
    rest = CONTROL.sub("", " ".join(rest.split("\n")))
    text = f"{clock(event['at'], date)}  {label:<9}  {rest}".rstrip()
    return f"\x1b[{COLOURS[label]}m{text}\x1b[0m" if colour and label in COLOURS else text


# The sums.

class Summary:
    """Everything worth counting, from events fed in the order they happened."""

    def __init__(self):
        self.jobs: dict[str, dict] = {}
        self.songs: dict[str, dict] = {}
        self.refused: Counter = Counter()
        self.places: dict[str, dict] = {}
        self.devices: Counter = Counter()
        self.days: dict[str, dict] = defaultdict(lambda: {"asked": 0, "ready": 0})  # `ready` is counted in result()
        self.hours = [0] * 24
        self.visitors: set = set()
        self.countries: set = set()
        self.others: Counter = Counter()
        self.asked = self.requests = 0
        self.first = self.last = None

    def song(self, video, at=None):
        song = self.songs.setdefault(video, {"video": video, "asked": 0, "visitors": set(), "last": 0})
        if at:
            song["last"] = max(song["last"], at)
        return song

    def ask(self, event):
        """Someone pressed open, whether or not it came to anything."""
        self.asked += 1
        moment = datetime.fromtimestamp(event["at"])
        self.days[moment.strftime("%Y-%m-%d")]["asked"] += 1
        self.hours[moment.hour] += 1
        self.devices[device(event.get("agent"))] += 1
        ip = event.get("ip")
        if ip:
            self.visitors.add(ip)
        if event.get("country"):
            self.countries.add(event["country"])
        name = where(event) or "unknown"
        spot = self.places.setdefault(name, {"place": name, "country": event.get("country"), "asked": 0, "visitors": set()})
        spot["asked"] += 1
        spot["visitors"].add(ip)
        if event.get("video"):
            song = self.song(event["video"], event["at"])
            song["asked"] += 1
            song["visitors"].add(ip)

    def add(self, event):
        kind, at = event["kind"], event["at"]
        self.first, self.last = min(self.first or at, at), max(self.last or at, at)
        if kind == "request":
            self.requests += 1
            self.others[f"{event.get('method', '')} {event.get('path', '')} {event.get('status', '')}"] += 1
            return
        if kind == "import.rejected":
            self.ask(event)
            self.refused[event.get("reason") or "refused"] += 1
            return
        if not (kind.startswith("import.") or kind.startswith("job.")) or not event.get("job"):
            return
        row = self.jobs.setdefault(event["job"], {"job": event["job"], "at": at, "outcome": "open"})
        for name in ("video", "title"):
            if event.get(name):
                row[name] = event[name]
        # The relay's word on how a job ended is the one that counts. The worker's
        # own (`job.`) only fills in while the relay's hasn't arrived, or never will.
        unsettled = row["outcome"] == "open"
        if kind == "import.queued":
            self.ask(event)
            row.update(at=at, ip=event.get("ip"), where=where(event), country=event.get("country"), device=device(event.get("agent")),
                       language=event.get("language"))
        elif kind == "import.claimed":
            row["wait"] = event.get("seconds")
        elif kind == "import.ready":
            row.update(outcome="ready", seconds=event.get("seconds"), bytes=event.get("bytes"))
        elif kind == "import.failed":
            row.update(outcome="failed", error=event.get("error"), seconds=event.get("seconds"))
        elif kind == "import.cancelled" and unsettled:
            row.update(outcome="cancelled", seconds=event.get("seconds"))
        elif kind == "import.fetched":
            row["fetched"] = True
        elif kind == "import.expired" and unsettled:
            row["outcome"] = "expired"
        elif kind == "job.info":
            row.update({name: event[name] for name in ("channel", "artist", "track", "album", "duration", "views") if name in event})
        elif kind == "job.retried":
            row["tries"] = row.get("tries", 1) + 1
        elif kind == "job.done":
            row.update({name: event[name] for name in ("found", "download", "convert", "upload") if name in event})
            if unsettled:
                row.update(outcome="ready", seconds=event.get("seconds"), bytes=event.get("bytes"))
        elif kind == "job.failed":
            if event.get("detail"):
                row["detail"] = event["detail"]
            if unsettled:
                row.update(outcome="failed", error=event.get("error"), seconds=event.get("seconds"))
        elif kind == "job.stopped" and unsettled:
            row.update(outcome="cancelled", seconds=event.get("seconds"))
        if row.get("video"):
            song = self.song(row["video"], row["at"])
            song.update({name: row[name] for name in ("title", "channel", "artist", "duration") if row.get(name)})

    def result(self, recent=100, now=None):
        now = now or time.time()
        rows = list(self.jobs.values())
        days = {day: dict(counts) for day, counts in self.days.items()}
        ready: Counter = Counter()
        for row in rows:
            # a job nobody ever said the end of: the relay restarted under it
            if row["outcome"] == "open" and now - row["at"] > 900:
                row["outcome"] = "lost"
            if row["outcome"] == "ready":
                days.setdefault(datetime.fromtimestamp(row["at"]).strftime("%Y-%m-%d"), {"asked": 0, "ready": 0})["ready"] += 1
                ready[row.get("video")] += 1
        outcomes = Counter(row["outcome"] if row["outcome"] != "failed" else row.get("error") or "failed" for row in rows)
        outcomes.update(self.refused)
        times = [row["seconds"] for row in rows if row["outcome"] == "ready" and type(row.get("seconds")) in {int, float}]
        count = lambda name: sum(row["outcome"] == name for row in rows)  # noqa: E731
        return {
            "first": self.first, "last": self.last,
            "totals": {"asked": self.asked, "imports": len(rows), "ready": count("ready"), "failed": count("failed"),
                       "cancelled": count("cancelled"), "open": count("open"), "refused": sum(self.refused.values()),
                       "visitors": len(self.visitors), "countries": len(self.countries), "songs": len(self.songs),
                       "bytes": sum(row["bytes"] for row in rows if row.get("fetched") and type(row.get("bytes")) is int),
                       "seconds": round(statistics.median(times), 1) if times else None, "requests": self.requests,
                       # imports the worker had to run more than once, and how many of those came good
                       "retried": sum(row.get("tries", 1) > 1 for row in rows),
                       "rescued": sum(row.get("tries", 1) > 1 and row["outcome"] == "ready" for row in rows)},
            "outcomes": outcomes.most_common(),
            "songs": [{**song, "ready": ready[song["video"]], "visitors": len(song["visitors"])}
                      for song in sorted(self.songs.values(), key=lambda song: (-song["asked"], -song["last"]))[:200]],
            "places": [{**spot, "visitors": len(spot["visitors"])}
                       for spot in sorted(self.places.values(), key=lambda spot: -spot["asked"])[:50]],
            "devices": self.devices.most_common(12),
            "days": [{"day": day, **days[day]} for day in sorted(days)],
            "hours": self.hours,
            "others": self.others.most_common(20),
            "recent": sorted(rows, key=lambda row: -row["at"])[:recent],
        }


def summarise(journal: Journal, days: float | None = None, since: float = 0):
    summary = Summary()
    for event in journal.read(time.time() - days * 86400 if days else since):
        summary.add(event)
    return summary.result()


# The commands. `windows/service.py` passes these on, so on the PC they are
# `sloverb-worker.cmd watch` and so on.

def table(rows, headings):
    rows = [[CONTROL.sub("", str(cell if cell is not None else "")) for cell in row] for row in rows]
    widths = [max(len(heading), *(len(row[i]) for row in rows)) if rows else len(heading) for i, heading in enumerate(headings)]
    for row in ([list(headings)] if any(headings) else []) + rows:
        print("  ".join(cell[:60].ljust(min(width, 60)) for cell, width in zip(row, widths)).rstrip())


def console():
    """Windows consoles need asking before they take colour, and a title in any
    alphabet must never be what stops a command."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    if not sys.stdout.isatty():
        return False
    if sys.platform == "win32":
        try:
            import ctypes
            kernel32 = ctypes.WinDLL("kernel32")
            kernel32.GetStdHandle.restype = ctypes.c_void_p
            handle, mode = ctypes.c_void_p(kernel32.GetStdHandle(-11)), ctypes.c_ulong()
            # 4 is ENABLE_VIRTUAL_TERMINAL_PROCESSING: without it cmd prints the colour codes as text
            return bool(kernel32.GetConsoleMode(handle, ctypes.byref(mode)) and kernel32.SetConsoleMode(handle, mode.value | 4))
        except Exception:
            return False
    return True


def watch(journal: Journal, everything=False, back=20):
    colour = console()
    # Without --all: a song from the moment it is asked for to the moment it is
    # fetched, and anything odd on the API. Not every stranger trying /wp-login.php.
    quiet = lambda event: event["kind"] in {"import.claimed", "job.claimed"} or (  # noqa: E731
        event["kind"] == "request" and (not str(event.get("path", "")).startswith("/v1/") or event.get("status") == 200))
    shown = lambda event: everything or not quiet(event)  # noqa: E731
    tail = Tail(journal)
    for event in [event for event in journal.recent(400) if shown(event)][-back:]:
        print(line(event, colour=colour))
    print("watching, Ctrl+C to stop" + ("" if everything else " (add --all for every request, not only songs)"), flush=True)
    try:
        while True:
            for event in tail.poll():
                if shown(event):
                    print(line(event, colour=colour), flush=True)
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass


def stats(journal: Journal, days):
    console()
    result = summarise(journal, days)
    totals = result["totals"]
    if not result["first"]:
        print("nothing kept yet" + (f" in the last {days:g} days" if days else ""))
        return
    print(f"{clock(result['first'], True)} to {clock(result['last'], True)}" + (f", the last {days:g} days" if days else ", everything kept"))
    print()
    done = totals["ready"] + totals["failed"]
    table([["asked for a song", totals["asked"]], ["visitors", totals["visitors"]], ["countries", totals["countries"]],
           ["different songs", totals["songs"]], ["ready", totals["ready"]], ["failed", totals["failed"]],
           ["cancelled", totals["cancelled"]], ["refused", totals["refused"]],
           ["worked", f"{100 * totals['ready'] / done:.0f}%" if done else ""], ["usual wait", took(totals["seconds"])],
           ["needed another go", f"{totals['retried']}, {totals['rescued']} of them ready" if totals["retried"] else 0],
           ["sent to browsers", size(totals["bytes"])], ["other requests", totals["requests"]]], ["", ""])
    for heading, rows, names in (
        ("how it went", result["outcomes"], ["what", "times"]),
        ("songs", [[song.get("title") or song["video"], song.get("artist") or song.get("channel"), song["asked"], song["ready"]] for song in result["songs"][:15]],
         ["title", "by", "asked", "ready"]),
        ("places", [[spot["place"], spot["asked"], spot["visitors"]] for spot in result["places"][:15]], ["where", "asked", "visitors"]),
        ("devices", result["devices"], ["on", "asked"]),
        ("days", [[day["day"], day["asked"], day["ready"]] for day in result["days"][-14:]], ["day", "asked", "ready"]),
        ("other requests", result["others"][:10], ["request", "times"]),
    ):
        if rows:
            print(f"\n{heading}")
            table(rows, names)


def songs(journal: Journal, days):
    console()
    result = summarise(journal, days)
    table([[song.get("title") or "", song.get("artist") or song.get("channel"), took(song.get("duration")), song["asked"], song["ready"],
            song["visitors"], clock(song["last"], True), f"https://youtu.be/{song['video']}"] for song in result["songs"]],
          ["title", "by", "length", "asked", "ready", "visitors", "last asked", "link"])


def imports(journal: Journal, days):
    console()
    result = summarise(journal, days)
    table([[clock(row["at"], True), row.get("where") or row.get("country"), row.get("ip"), row.get("device"), row.get("title") or row.get("video"),
            row.get("error") or row["outcome"], took(row.get("seconds")), size(row.get("bytes"))] for row in result["recent"]],
          ["when", "where", "address", "on", "song", "outcome", "took", "size"])


def main(arguments=None):
    parser = argparse.ArgumentParser(prog="sloverb-worker", description="What visitors asked the worker for, kept on this machine.")
    parser.add_argument("command", choices=["watch", "stats", "songs", "imports", "dashboard", "geo"])
    parser.add_argument("--state-directory", type=Path, required=True, help=argparse.SUPPRESS)
    parser.add_argument("--days", type=float, help="only the last so many days (stats, songs, imports)")
    parser.add_argument("--all", action="store_true", help="watch: every request, not only songs")
    parser.add_argument("--port", type=int, default=8377, help="dashboard: the port on this machine")
    parser.add_argument("--no-browser", action="store_true", help="dashboard: don't open a browser")
    args = parser.parse_args(arguments)
    journal = Journal(args.state_directory / "analytics")
    if args.command == "watch":
        watch(journal, args.all)
    elif args.command == "stats":
        stats(journal, args.days)
    elif args.command == "songs":
        songs(journal, args.days)
    elif args.command == "imports":
        imports(journal, args.days)
    elif args.command == "dashboard":
        from backend.dashboard import serve
        serve(args.state_directory, args.port, not args.no_browser)
    elif args.command == "geo":
        from backend.geo import fetch
        fetch(args.state_directory / "geo")


if __name__ == "__main__":
    main()
