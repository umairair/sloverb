"""A page on this machine for watching the journal live: `sloverb-worker.cmd dashboard`.

Started by hand, stopped with Ctrl+C. It listens on 127.0.0.1 only, so nothing
off this machine can reach it, it answers nothing but GET, and it only reads.
The worker itself still listens on nothing at all. See docs/analytics.md.
"""
import json
import secrets
import threading
import time
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from backend.analytics import Journal, Tail, said, summarise
from backend.events import CONTROL

PAGE = Path(__file__).with_name("dashboard.html")
RANGES = {"today": 0, "7": 7, "30": 30, "all": None}


def shown(event):
    """An event as the page's live list shows it, worded the way `watch` words it."""
    label, text = said(event)
    return {"at": event["at"], "label": label, "text": CONTROL.sub("", " ".join(text.split("\n")))}


def since(name):
    if name == "today":
        return datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    days = RANGES.get(name)
    return time.time() - days * 86400 if days else 0


def handler(directory: Path):
    journal = Journal(directory / "analytics")
    cache: dict[str, tuple[float, bytes]] = {}
    lock = threading.Lock()

    def summary(name):
        with lock:
            # every open page asks every few seconds, and the sum is of the whole period each time
            at, body = cache.get(name, (0, b""))
            if time.monotonic() - at > 2:
                try:
                    state = json.loads((directory / "state.json").read_text())
                except (OSError, ValueError):
                    state = None
                result = summarise(journal, since=since(name))
                body = json.dumps({"now": time.time(), "range": name, "state": state, **result}).encode()
                cache[name] = (time.monotonic(), body)
            return body

    class Handler(BaseHTTPRequestHandler):
        server_version = "sloverb"

        def log_message(self, *_):
            pass

        def send(self, status, kind, body, **headers):
            self.send_response(status)
            for name, value in {"Content-Type": kind, "Content-Length": str(len(body)), "Cache-Control": "no-store",
                                "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", **headers}.items():
                self.send_header(name.replace("_", "-"), value)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            port = self.server.server_address[1]
            # Any page open in this browser can make it ask 127.0.0.1 for things. It
            # can't make the request look like this page's own, so nothing else is answered.
            if self.headers.get("Host") not in {f"127.0.0.1:{port}", f"localhost:{port}"} or \
                    self.headers.get("Sec-Fetch-Site", "same-origin") not in {"same-origin", "none"}:
                return self.send(403, "text/plain; charset=utf-8", b"this page is only for this machine")
            link = urlsplit(self.path)
            if link.path == "/":
                nonce = secrets.token_urlsafe(16)
                policy = (f"default-src 'none'; style-src 'nonce-{nonce}'; script-src 'nonce-{nonce}'; connect-src 'self'; "
                          "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
                return self.send(200, "text/html; charset=utf-8", PAGE.read_text(encoding="utf-8").replace("__NONCE__", nonce).encode(),
                                 Content_Security_Policy=policy)
            if link.path == "/summary":
                name = parse_qs(link.query).get("range", ["7"])[0]
                return self.send(200, "application/json", summary(name if name in RANGES else "7"))
            if link.path == "/live":
                return self.live()
            self.send(404, "text/plain; charset=utf-8", b"nothing here")

        def live(self):
            """The last few events, then each new one as the worker writes it, for as long as the page stays open."""
            self.send_response(200)
            for name, value in (("Content-Type", "text/event-stream"), ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff")):
                self.send_header(name, value)
            self.end_headers()
            tail, quiet = Tail(journal), time.monotonic()
            try:
                events = journal.recent(120)
                while True:
                    for event in events:
                        self.wfile.write(f"data: {json.dumps(shown(event))}\n\n".encode())
                    if events:
                        quiet = time.monotonic()
                    elif time.monotonic() - quiet > 15:
                        self.wfile.write(b": still here\n\n")
                        quiet = time.monotonic()
                    self.wfile.flush()
                    time.sleep(0.5)
                    events = tail.poll()
            except OSError:
                pass  # the page was closed

    return Handler


class Server(ThreadingHTTPServer):
    daemon_threads = True
    # On Windows the usual setting lets a second program take a port that is in use.
    allow_reuse_address = False


def serve(directory: Path, port=8377, browser=True):
    try:
        server = Server(("127.0.0.1", port), handler(Path(directory)))
    except OSError:
        raise SystemExit(f"port {port} is taken. Is a dashboard already open? Otherwise add --port and another number.") from None
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    print(f"the dashboard is at {url} for as long as this stays open, Ctrl+C to stop", flush=True)
    if browser:
        threading.Timer(0.4, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
