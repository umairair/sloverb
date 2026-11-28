"""The journal's dashboard on the open internet, for Umair alone (D51 in docs/decisions.md).

The journal stays on the PC at home. While somebody signed in has this page
open, the worker sends the relay what the page shows: each new line of the
journal as it is written, and the sums for the period being looked at, every
few seconds (`report` in backend/worker.py). The relay holds that in memory
for the page and nowhere else, never on its disk or in its logs, and forgets
all of it a minute after the page is closed. While nobody is looking it holds
nothing, and the worker sends nothing.

It is at a secret address (`DASHBOARD_PATH`) behind a password
(`DASHBOARD_PASSWORD`), both set on Render by hand and in no file in the
repository, which is public. Without both, none of this exists and the address
is a 404 like any other. See docs/analytics.md.
"""
import asyncio
import hashlib
import hmac
import html
import json
import math
import re
import secrets
import time
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response, StreamingResponse

from backend.events import CONTROL, clean, visitor

PAGE = Path(__file__).with_name("dashboard.html")
RANGES = ("today", "7", "30", "all")
# Any one word Umair likes, of any length (his call, 2026-11-28: it was 16 or more until then), so long as it
# is not an address the relay already answers at.
PATH = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")
TAKEN = {"healthz", "v1", "internal"}
LABEL = re.compile(r"[a-z][a-z.]{0,19}\Z")
COOKIE = "__Host-sloverb-board"
SESSION = 30 * 86400
# How long the relay goes on holding what the page showed once nobody is looking, and how long a period stays asked for.
FORGET, WANTED = 60, 30
# the longest one live connection lasts; the page reconnects by itself
STREAM = 600


def usable(path: str, password: str) -> bool:
    return bool(PATH.match(path or "")) and path.lower() not in TAKEN and len(password or "") >= 12


class Board:
    def __init__(self, path: str, password: str):
        self.path = "/" + path
        # Sessions are signed with a key made from the address and the password, so
        # they last through a restart of the relay and end when either is changed.
        self.key = hashlib.sha256(b"sloverb board\n" + path.encode() + b"\n" + password.encode()).digest()
        self.check = self.sign(b"password\n" + password.encode())
        self.lines: deque[dict] = deque(maxlen=200)
        self.summaries: dict[str, dict] = {}
        self.wanted: dict[str, float] = {}
        self.listeners: set[asyncio.Queue] = set()
        self.seen = self.fed = 0.0
        self.primed = False  # whether the worker has sent the last lines of the journal since the page was opened
        self.tries: dict[str, deque] = defaultdict(deque)
        self.misses: deque[float] = deque()

    def sign(self, data: bytes) -> bytes:
        return hmac.new(self.key, data, hashlib.sha256).digest()

    def under(self, path: str) -> bool:
        return path == self.path or path.startswith(self.path + "/")

    # who may look

    def session(self) -> str:
        expires = str(int(time.time()) + SESSION)
        return expires + "." + self.sign(b"session\n" + expires.encode()).hex()

    def signed_in(self, request: Request) -> bool:
        expires, _, signature = request.cookies.get(COOKIE, "").partition(".")
        if not expires.isdigit() or int(expires) < time.time():
            return False
        return hmac.compare_digest(self.sign(b"session\n" + expires.encode()).hex(), signature)

    def refused(self, address: str) -> bool:
        """Five wrong tries from one address in a quarter of an hour, or twenty from
        anywhere in an hour, and nobody may try again until they have aged out."""
        now = time.monotonic()
        for key in list(self.tries):
            while self.tries[key] and self.tries[key][0] < now - 900:
                self.tries[key].popleft()
            if not self.tries[key]:
                del self.tries[key]
        while self.misses and self.misses[0] < now - 3600:
            self.misses.popleft()
        return len(self.tries.get(address, ())) >= 5 or len(self.misses) >= 20

    def missed(self, address: str):
        now = time.monotonic()
        if len(self.tries) < 10000:
            self.tries[address].append(now)
        self.misses.append(now)

    def right(self, attempt: str) -> bool:
        return hmac.compare_digest(self.sign(b"password\n" + attempt.encode()), self.check)

    # what it shows

    def looked(self, period: str | None = None):
        self.seen = time.monotonic()
        if period:
            self.wanted[period] = self.seen

    def watching(self) -> bool:
        # `seen` is 0 until somebody looks, and the clock it is measured on starts near 0 on a machine just started
        return bool(self.listeners) or bool(self.seen) and time.monotonic() - self.seen < WANTED

    def forget(self):
        """Nobody has looked for a minute: let go of everything the worker sent."""
        if not self.listeners and self.seen and time.monotonic() - self.seen > FORGET:
            self.lines.clear()
            self.summaries.clear()
            self.wanted.clear()
            self.primed = False
            self.seen = 0.0

    def periods(self):
        now = time.monotonic()
        return [period for period in RANGES if now - self.wanted.get(period, -math.inf) < WANTED]

    def take(self, data: dict):
        """What the worker sent, cut down to what the page shows."""
        lines = []
        for item in data.get("lines", [])[:500] if isinstance(data.get("lines"), list) else []:
            if not isinstance(item, dict) or type(item.get("at")) not in {int, float} or not 946684800 < item["at"] < 4102444800:
                continue
            label, text = item.get("label"), clean(item.get("text"), 2000)
            if isinstance(label, str) and LABEL.match(label) and text:
                lines.append({"at": item["at"], "label": label, "text": CONTROL.sub("", text)})
        if data.get("backlog") is True:
            self.lines.clear()
            self.primed = True
        self.lines.extend(lines)
        for queue in list(self.listeners):
            for item in lines:
                if queue.full():
                    break
                queue.put_nowait(item)
        summaries = data.get("summaries")
        if isinstance(summaries, dict) and self.watching():
            for period, summary in summaries.items():
                if period in RANGES and isinstance(summary, dict) and len(json.dumps(summary)) <= 262144:
                    self.summaries[period] = {**summary, "range": period, "received": time.monotonic()}
        self.fed = time.monotonic()

    def answer(self) -> dict:
        return {"version": 1, "watching": self.watching(), "ranges": self.periods(), "backlog": self.watching() and not self.primed}

    async def sweep(self):
        while True:
            await asyncio.sleep(10)
            self.forget()


LOGIN = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>sloverb worker</title>
<style nonce="__NONCE__">
  :root { color-scheme: light; --plane: #f5f5f7; --surface: #fff; --ink: #1d1d1f; --ink-2: #62615d; --edge: rgb(29 29 31 / 0.16); }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --plane: #161618; --surface: #212124; --ink: #ece9e5; --ink-2: #9c9c9c; --edge: rgb(236 233 229 / 0.16); }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--plane); color: var(--ink);
         font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  form { width: min(100%, 320px); display: grid; gap: 12px; }
  h1 { margin: 0 0 6px; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; text-align: center; }
  input, button { font: inherit; border-radius: 999px; padding: 11px 18px; border: 1px solid var(--edge); }
  input { background: var(--surface); color: var(--ink); }
  button { background: var(--ink); color: var(--plane); border-color: var(--ink); font-weight: 600; cursor: pointer; }
  input:focus-visible, button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  p { margin: 0; min-height: 1.45em; color: var(--ink-2); text-align: center; }
  .unseen { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
</head>
<body>
<form method="post">
  <h1>sloverb worker</h1>
  <input class="unseen" type="text" name="username" value="sloverb" autocomplete="username" tabindex="-1" aria-hidden="true">
  <label class="unseen" for="password">password</label>
  <input id="password" type="password" name="password" autocomplete="current-password" autofocus>
  <button type="submit">open</button>
  <p role="status">__SAID__</p>
</form>
</body>
</html>
"""


def policy(nonce: str) -> str:
    return (f"default-src 'none'; style-src 'nonce-{nonce}'; script-src 'nonce-{nonce}'; connect-src 'self'; img-src 'self'; "
            "base-uri 'none'; form-action 'self'; frame-ancestors 'none'")


def private(response: Response) -> Response:
    # same-origin, not no-referrer: under no-referrer a browser sends the page's own form with `Origin: null`
    for name, value in {"X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY"}.items():
        response.headers[name] = value
    return response


def attach_board(app, imports, auth, path: str, password: str) -> Board:
    board = Board(path, password)
    app.state.board = board
    root = board.path

    def page(template: str, status=200, **words) -> Response:
        nonce = secrets.token_urlsafe(16)
        body = template.replace("__NONCE__", nonce).replace("__WHERE__", "relay")
        for name, value in words.items():
            body = body.replace(f"__{name.upper()}__", html.escape(value))
        return private(HTMLResponse(body, status_code=status, headers={"Content-Security-Policy": policy(nonce)}))

    def login(said="", status=200):
        return page(LOGIN, status, said=said)

    def guarded(request: Request):
        if not board.signed_in(request):
            raise HTTPException(401, "sign in first")

    @app.get(root, include_in_schema=False)
    async def bare():
        # the page asks for `summary` and `live` beside itself, so it has to end in a slash
        return private(RedirectResponse(root + "/", status_code=308))

    @app.get(root + "/", include_in_schema=False)
    async def show(request: Request):
        if not board.signed_in(request):
            return login()
        board.looked()
        return page(PAGE.read_text(encoding="utf-8"))

    @app.post(root + "/", include_in_schema=False)
    async def sign_in(request: Request):
        who = visitor(request)
        address = who.get("ip") or "unknown"
        if board.refused(address):
            imports.events.emit("board.refused", why="too many tries", **who)
            return login("too many tries, wait a while", 429)
        attempt = parse_qs((await request.body()).decode("utf-8", "replace")).get("password", [""])[0]
        if not board.right(attempt):
            board.missed(address)
            imports.events.emit("board.refused", why="wrong password", **who)
            return login("wrong password", 401)
        board.tries.pop(address, None)
        imports.events.emit("board.opened", **who)
        response = RedirectResponse(root + "/", status_code=303)
        response.set_cookie(COOKIE, board.session(), max_age=SESSION, path="/", secure=True, httponly=True, samesite="lax")
        return private(response)

    @app.post(root + "/out", include_in_schema=False)
    async def sign_out():
        response = RedirectResponse(root + "/", status_code=303)
        response.delete_cookie(COOKIE, path="/", secure=True, httponly=True, samesite="lax")
        return private(response)

    @app.get(root + "/summary", include_in_schema=False)
    async def summary(request: Request):
        guarded(request)
        period = request.query_params.get("range", "7")
        period = period if period in RANGES else "7"
        board.looked(period)
        # the worker hears that this period is wanted within a moment, and takes a moment more to add it up
        deadline = time.monotonic() + 8
        while (period not in board.summaries or time.monotonic() - board.summaries[period]["received"] > 10) and time.monotonic() < deadline:
            await asyncio.sleep(0.25)
            board.looked(period)
        held = board.summaries.get(period)
        if not held:
            return private(JSONResponse({"waiting": True}, status_code=503))
        result = {name: value for name, value in held.items() if name != "received"}
        # how long ago the PC last said anything, so the page can tell a stale picture from a live one
        result["age"] = round(time.monotonic() - board.fed, 1)
        return private(JSONResponse(result))

    @app.get(root + "/live", include_in_schema=False)
    async def live(request: Request):
        guarded(request)
        board.looked()
        queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        backlog = list(board.lines)
        board.listeners.add(queue)

        async def stream():
            try:
                for item in backlog:
                    yield f"data: {json.dumps(item)}\n\n"
                ends = time.monotonic() + STREAM
                while time.monotonic() < ends:
                    try:
                        item = await asyncio.wait_for(queue.get(), min(15, max(0.01, ends - time.monotonic())))
                    except asyncio.TimeoutError:
                        if time.monotonic() < ends:
                            yield ": still here\n\n"
                        continue
                    board.looked()
                    yield f"data: {json.dumps(item)}\n\n"
            finally:
                board.listeners.discard(queue)
                board.looked()

        return private(StreamingResponse(stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"}))

    @app.post("/internal/worker/board")
    async def feed(request: Request):
        """The worker sends what the page shows while somebody is looking, and waits
        here while nobody is, so it hears within a moment when somebody starts."""
        data = await auth.json(request)
        board.forget()
        if data.get("version") == 1:
            board.take(data)
        wait = data.get("wait")
        wait = min(wait, 20) if type(wait) in {int, float} and math.isfinite(wait) and wait > 0 else 0
        deadline = time.monotonic() + wait
        while not board.watching() and time.monotonic() < deadline:
            await asyncio.sleep(0.25)
        return board.answer()

    return board


def own_origin(request: Request) -> bool:
    """A form on the page itself, or no origin at all. Anything else is another site trying to post here."""
    if request.headers.get("sec-fetch-site") in {"same-origin", "none"}:
        return True  # the browser's own word, which no other site can write
    origin = request.headers.get("origin")
    return not origin or urlsplit(origin).netloc == request.headers.get("host")
