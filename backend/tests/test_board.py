"""The dashboard on the relay (backend/board.py, D51): who may see it, what it is sent, and what it forgets."""
import asyncio
import base64
import json
import time

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from backend.analytics import Journal
from backend.app import Settings, create_app
from backend.dashboard import outward, shown, sums
from backend.tests.test_analytics import Answer, signed, story, worker_in

SECRET = "made-up-path-for-tests-0123456789"
PASSWORD = "a password for tests"
BASE = f"https://testserver/{SECRET}"
PHONE = {"User-Agent": "Mozilla/5.0 (iPhone)", "CF-Connecting-IP": "203.0.113.9", "CF-IPCountry": "CA"}


def relay(path=SECRET, password=PASSWORD):
    key = Ed25519PrivateKey.generate()
    public = base64.b64encode(key.public_key().public_bytes_raw()).decode()
    return create_app(Settings(worker_public_key=public, dashboard_path=path, dashboard_password=password)), key


def collected(client, key):
    return signed(client, key, "/internal/worker/events", {})


def sign_in(client):
    response = client.post(f"{BASE}/", data={"password": PASSWORD}, headers={**PHONE, "Origin": "https://testserver"}, follow_redirects=False)
    assert response.status_code == 303
    return response


def test_without_both_settings_there_is_no_dashboard_at_all():
    for path, password in (("", ""), (SECRET, ""), ("", PASSWORD), ("short", PASSWORD), (SECRET, "too short"), ("not/a/path/at/all/x", PASSWORD)):
        app, key = relay(path, password)
        with TestClient(app, base_url="https://testserver") as client:
            assert client.get(f"/{path or SECRET}/").status_code == 404
            assert signed(client, key, "/internal/worker/board", {"version": 1}).status_code == 404


def test_only_the_password_opens_it_and_guessing_is_cut_short():
    app, key = relay()
    with TestClient(app, base_url="https://testserver") as client:
        assert client.get(f"/{SECRET}", follow_redirects=False).headers["location"] == f"/{SECRET}/"
        door = client.get(f"/{SECRET}/")
        assert door.status_code == 200 and 'type="password"' in door.text and "asked each day" not in door.text
        assert door.headers["x-robots-tag"] == "noindex, nofollow" and door.headers["referrer-policy"] == "same-origin"
        assert "default-src 'none'" in door.headers["content-security-policy"] and "unsafe" not in door.headers["content-security-policy"]
        for path in ("summary", "live"):
            assert client.get(f"/{SECRET}/{path}").status_code == 401

        # another site can't post to it
        assert client.post(f"/{SECRET}/", data={"password": PASSWORD}, headers={"Origin": "https://sloverb.app"}).status_code == 403
        assert client.post(f"/{SECRET}/", data={"password": PASSWORD}, headers={"Origin": "https://evil.test"}).status_code == 403
        assert client.post(f"/{SECRET}/", data={"password": PASSWORD}, headers={"Origin": "null"}).status_code == 403
        assert client.post(f"/{SECRET}/out", headers={"Origin": "https://evil.test", "Sec-Fetch-Site": "cross-site"}).status_code == 403

        wrong = client.post(f"/{SECRET}/", data={"password": "guess"}, headers=PHONE)
        assert wrong.status_code == 401 and "wrong password" in wrong.text and "set-cookie" not in wrong.headers

        response = sign_in(client)
        cookie = response.headers["set-cookie"]
        assert "Secure" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
        page = client.get(f"/{SECRET}/")
        assert page.status_code == 200 and 'data-where="relay"' in page.text and "__NONCE__" not in page.text
        nonce = page.headers["content-security-policy"].split("'nonce-")[1].split("'")[0]
        assert page.text.count(f'nonce="{nonce}"') == 2 and "innerHTML" not in page.text

        # a cookie made up, or one from before the password changed, is no cookie
        client.cookies.set("__Host-sloverb-board", f"{int(time.time()) + 999}.{'0' * 64}")
        assert client.get(f"/{SECRET}/summary").status_code == 401
        client.cookies.clear()

        # five wrong from one address, and then not even the right one gets in for a while
        for _ in range(5):
            assert client.post(f"/{SECRET}/", data={"password": "guess"}, headers=PHONE).status_code == 401
        assert client.post(f"/{SECRET}/", data={"password": PASSWORD}, headers=PHONE).status_code == 429
        # twenty from anywhere in an hour, and nobody does
        for number in range(15):
            client.post(f"/{SECRET}/", data={"password": "guess"}, headers={**PHONE, "CF-Connecting-IP": f"198.51.100.{number}"})
        assert client.post(f"/{SECRET}/", data={"password": PASSWORD}, headers={**PHONE, "CF-Connecting-IP": "192.0.2.1"}).status_code == 429

        # the journal hears of each try, never of the address itself or the password
        events = collected(client, key).json()["events"]
        kinds = [event["kind"] for event in events]
        assert kinds.count("board.opened") == 1 and kinds.count("board.refused") == 23
        assert "request" not in kinds
        assert SECRET not in json.dumps(events) and PASSWORD not in json.dumps(events) and "guess" not in json.dumps(events)
        assert all(event["ip"] for event in events)


def test_it_shows_what_the_pc_sends_while_someone_looks_and_forgets_it_after(monkeypatch):
    monkeypatch.setattr("backend.board.STREAM", 0.3)
    app, key = relay()
    board = app.state.board
    with TestClient(app, base_url="https://testserver") as client:
        # nobody is looking: the worker is told so, and what it sends anyway isn't kept
        answer = signed(client, key, "/internal/worker/board", {"version": 1, "summaries": {"7": {"totals": {}}}}).json()
        assert answer == {"version": 1, "watching": False, "ranges": [], "backlog": False}
        assert board.summaries == {}

        sign_in(client)
        assert client.get(f"/{SECRET}/").status_code == 200
        answer = signed(client, key, "/internal/worker/board", {"version": 1, "wait": 20}).json()
        assert answer["watching"] is True and answer["backlog"] is True  # it came back at once, and wants the last lines

        lines = [{"at": 1795750010.5, "label": "asked", "text": "one\x1b[31m  203.0.113.9"}, {"at": 1795750011, "label": "<b>", "text": "x"},
                 {"at": 5, "label": "job", "text": "too old"}, "junk"]
        summary = {"now": time.time(), "totals": {"asked": 1}, "range": "nonsense"}
        answer = signed(client, key, "/internal/worker/board", {"version": 1, "backlog": True, "lines": lines, "summaries": {"7": summary, "evil": {}}}).json()
        assert answer["backlog"] is False
        assert list(board.lines) == [{"at": 1795750010.5, "label": "asked", "text": "one[31m  203.0.113.9"}]
        assert set(board.summaries) == {"7"}

        result = client.get(f"/{SECRET}/summary?range=7").json()
        assert result["totals"] == {"asked": 1} and result["range"] == "7" and 0 <= result["age"] < 5 and "received" not in result
        assert signed(client, key, "/internal/worker/board", {"version": 1}).json()["ranges"] == ["7"]

        with client.stream("GET", f"/{SECRET}/live") as live:
            assert live.headers["content-type"].startswith("text/event-stream")
            got = [json.loads(text.removeprefix("data: ")) for text in live.iter_lines() if text.startswith("data: ")]
        assert got == list(board.lines)

        # bigger than anything a visitor may send, and still bounded
        big = {"version": 1, "lines": [{"at": 1795750012, "label": "job", "text": "x" * 1900}] * 200}
        assert signed(client, key, "/internal/worker/board", big).status_code == 200
        assert signed(client, key, "/internal/worker/board", {**big, "lines": big["lines"] * 2}).status_code == 413
        assert client.post("/v1/imports", content=b"x" * 5000, headers={"Content-Type": "application/json"}).status_code == 413

        # a minute after the last look, all of it is let go
        board.seen = time.monotonic() - 61
        board.forget()
        assert not board.lines and not board.summaries and not board.primed and not board.watching()


def test_the_worker_sends_nothing_while_nobody_looks_and_never_what_stays_home(tmp_path, monkeypatch):
    now = time.time()
    events = story(now) + [{"at": now - 5, "kind": "job.failed", "job": "zz", "video": "jNQXAC9IVRw", "error": "youtube blocked this import",
                            "detail": "ERROR: https://rr1.googlevideo.com/videoplayback?sig=SECRET from 192.168.1.20"}]
    Journal(tmp_path / "analytics").keep(events)

    async def scenario():
        worker = worker_in(tmp_path)
        sent = []
        answers = [
            {"version": 1, "watching": False, "ranges": [], "backlog": False},
            {"version": 1, "watching": True, "ranges": [], "backlog": True},
            {"version": 1, "watching": True, "ranges": ["all", "nonsense"], "backlog": False},
            httpx.HTTPStatusError("no dashboard", request=None, response=httpx.Response(404)),
        ]

        async def request(method, path, data, timeout=None):
            assert (method, path, timeout) == ("POST", "/internal/worker/board", 40)
            sent.append(data)
            if not answers:
                raise asyncio.CancelledError
            answer = answers.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return Answer(answer)

        pauses = []

        async def sleep(seconds):
            pauses.append(seconds)
        worker.request = request
        monkeypatch.setattr("backend.worker.asyncio.sleep", sleep)
        with pytest.raises(asyncio.CancelledError):
            await worker.report()
        await worker.client.aclose()
        return sent, pauses

    sent, pauses = asyncio.run(scenario())
    assert sent[0] == {"version": 1, "wait": 20}  # nobody looking: nothing but the question
    assert sent[1] == {"version": 1, "wait": 20}
    assert sent[2]["backlog"] is True and len(sent[2]["lines"]) == len(events) and "summaries" not in sent[2]
    assert set(sent[3]["summaries"]) == {"all"} and sent[3]["wait"] == 0
    assert pauses[:4] == [0.1, 1, 1, 300]
    everything = json.dumps(sent)
    assert "SECRET" not in everything and "192.168.1.20" not in everything and "googlevideo" not in everything
    assert "youtube blocked this import" in everything


def test_what_leaves_home_is_what_the_page_shows_and_no_more(tmp_path):
    now = time.time()
    journal = Journal(tmp_path / "analytics")
    journal.keep(story(now) + [{"at": now - 5, "kind": "job.failed", "job": "zz", "error": "e", "detail": "private"}])
    (tmp_path / "state.json").write_text(json.dumps({"status": "ready", "enabled": True, "battery_percent": 80, "updated_at": now}))
    summary = outward(sums(journal, tmp_path, "all"))
    assert "private" not in json.dumps(summary)
    assert summary["state"] == {"status": "ready", "enabled": True, "updated_at": now}
    assert len(summary["recent"]) <= 25 and len(summary["songs"]) <= 12
    assert "private" in shown(journal.recent(1)[0])["text"] and "private" not in shown(journal.recent(1)[0], home=False)["text"]
