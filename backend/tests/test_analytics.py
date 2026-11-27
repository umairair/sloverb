import asyncio
import base64
import json
import time

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from backend.analytics import Journal, Summary, Tail, device, line, summarise, tidy
from backend.app import Settings, create_app
from backend.events import CONTROL, Events, clean, tag
from backend.geo import Geo
from backend.worker import Worker, steps
from backend.worker_auth import signed_headers

VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
VISITOR = {"Origin": "https://sloverb.app", "User-Agent": PHONE, "CF-Connecting-IP": "203.0.113.9", "CF-IPCountry": "CA",
           "CF-Ray": "a60e1b50283ede9d-YYZ", "Accept-Language": "en-CA,en;q=0.9"}


def fixture():
    key = Ed25519PrivateKey.generate()
    app = create_app(Settings(worker_public_key=base64.b64encode(key.public_key().public_bytes_raw()).decode()))
    return app, key


def signed(client, key, path, data):
    body = json.dumps(data).encode()
    return client.post(path, content=body, headers={"Content-Type": "application/json", **signed_headers(key, "POST", path, body)})


def collected(client, key, **cursor):
    response = signed(client, key, "/internal/worker/events", cursor)
    assert response.status_code == 200
    return response.json()


def test_a_whole_import_is_noticed_without_its_id_or_the_noise():
    app, key = fixture()
    with TestClient(app) as client:
        assert client.get("/healthz").status_code == 200  # Render's own check, no origin: not kept
        assert client.options("/v1/imports", headers={**VISITOR, "Access-Control-Request-Method": "POST"}).status_code == 200
        assert signed(client, key, "/internal/worker/claim", {"available": True}).status_code == 204
        assert client.get("/healthz", headers=VISITOR).status_code == 200
        job = client.post("/v1/imports", json={"url": "https://youtu.be/jNQXAC9IVRw?si=x"}, headers=VISITOR).json()["id"]
        remote = signed(client, key, "/internal/worker/claim", {"available": True}).json()
        assert client.get(f"/v1/imports/{job}", headers=VISITOR).status_code == 200  # the browser's once a second: not kept
        progress = f"/internal/worker/{job}/progress"
        assert signed(client, key, progress, {"lease": remote["lease"], "status": "downloading", "title": "test song"}).status_code == 200
        audio, path = b"ID3test audio", f"/internal/worker/{job}/audio"
        assert client.put(path, content=audio, headers={"Content-Type": "audio/mpeg", "X-Worker-Lease": remote["lease"],
                                                         **signed_headers(key, "PUT", path, audio)}).status_code == 200
        assert client.get(f"/v1/imports/{job}/audio", headers=VISITOR).content == audio
        assert client.delete(f"/v1/imports/{job}", headers=VISITOR).status_code == 204  # tidying up: not kept
        batch = collected(client, key)
    events = batch["events"]
    assert [event["kind"] for event in events] == ["request", "import.queued", "import.claimed", "import.ready", "import.fetched"]
    assert [event["seq"] for event in events] == [1, 2, 3, 4, 5]
    asked, ready, fetched = events[1], events[3], events[4]
    assert asked["ip"] == "203.0.113.9" and asked["country"] == "CA" and asked["edge"] == "YYZ" and asked["language"] == "en-CA"
    assert asked["agent"] == PHONE and asked["video"] == "jNQXAC9IVRw" and asked["status"] == 202
    assert asked["job"] == tag(job) and len(asked["job"]) == 10
    assert ready["title"] == "test song" and ready["bytes"] == len(audio) and ready["job"] == asked["job"]
    assert fetched["bytes"] == len(audio) and fetched["path"] == "/v1/imports/:id/audio"
    # a job's id lets its holder read or cancel the job, and a lease lets a worker finish it
    assert job not in json.dumps(batch) and remote["lease"] not in json.dumps(batch)


def test_refusals_and_strangers_are_noticed_but_what_was_typed_is_not():
    app, key = fixture()
    with TestClient(app) as client:
        assert client.post("/v1/imports", json={"url": VIDEO}, headers=VISITOR).status_code == 503  # no worker yet
        assert client.post("/v1/imports", json={"url": "https://example.com/my-private-page"}, headers=VISITOR).status_code == 400
        assert client.post("/v1/imports", json={"url": VIDEO}, headers={"Origin": "https://evil.test"}).status_code == 403
        assert client.get("/wp-login.php", headers={"User-Agent": "zgrab"}).status_code == 404
        assert client.post("/internal/worker/claim", json={"available": True}).status_code == 401
        assert signed(client, key, "/internal/worker/claim", {"available": True}).status_code == 204
        job = client.post("/v1/imports", json={"url": VIDEO}, headers=VISITOR).json()["id"]
        assert client.delete(f"/v1/imports/{job}", headers=VISITOR).status_code == 204
        events = collected(client, key)["events"]
    kinds = [(event["kind"], event.get("status")) for event in events]
    assert kinds == [("import.rejected", 503), ("import.rejected", 400), ("request", 403), ("request", 404), ("request", 401),
                     ("import.queued", 202), ("import.cancelled", 204)]
    assert events[0]["reason"] == "imports are offline, try later" and events[0]["video"] == "jNQXAC9IVRw"
    assert events[1]["reason"] == "enter a youtube video link" and "example.com" not in json.dumps(events)
    assert events[3]["path"] == "/wp-login.php" and events[4]["path"] == "/internal/worker/claim"
    assert events[6]["while"] == "queued" and events[6]["job"] == tag(job)


def test_only_the_worker_can_collect_and_nothing_is_lost_on_the_way():
    app, key = fixture()
    with TestClient(app) as client:
        assert client.post("/internal/worker/events", json={}).status_code == 401
        assert signed(client, Ed25519PrivateKey.generate(), "/internal/worker/events", {}).status_code == 401
        for _ in range(3):
            client.get("/nothing", headers=VISITOR)
        first = collected(client, key)
        assert first["version"] == 1 and len(first["events"]) == 5  # the two refusals above and three requests
        again = collected(client, key, boot=first["boot"], after=3)  # the answer was lost after the third
        assert [event["seq"] for event in again["events"]] == [4, 5]
        assert collected(client, key, boot=first["boot"], after=5)["events"] == []
        # a worker that remembers another run of the relay gets everything still held
        client.get("/nothing", headers=VISITOR)
        assert [event["seq"] for event in collected(client, key, boot="another", after=900)["events"]] == [6]
        # it would wait for more, but only as long as a number says
        for wait in ("NaN", "1e999", '"long"', "-5", "true"):
            body = f'{{"boot":"{first["boot"]}","after":6,"wait":{wait}}}'.encode()
            started = time.monotonic()
            response = client.post("/internal/worker/events", content=body, headers={"Content-Type": "application/json",
                                   **signed_headers(key, "POST", "/internal/worker/events", body)})
            assert response.status_code == 200 and response.json()["events"] == [] and time.monotonic() - started < 2


def test_the_list_has_a_ceiling_and_a_pace():
    events = Events(limit=3, rate=0, burst=5)
    for number in range(8):
        events.emit("request", number=number)
    assert events.dropped == 5 and [event["number"] for event in events.held] == [2, 3, 4]  # five let in, three kept
    events.emit("import.ready", budget=False, job="a")  # what became of a job is always kept
    assert events.held[-1]["kind"] == "import.ready" and events.dropped == 6
    assert events.since(events.boot, events.seq)["events"] == [] and not events.held


def test_headers_cannot_carry_anything_into_a_terminal_or_a_page():
    app, key = fixture()
    nasty = "evil\x1b[2J\x07" + chr(0x202E) + "<script>alert(1)</script>" + "x" * 500
    with TestClient(app) as client:
        client.get("/nothing", headers={"User-Agent": nasty.encode(), "Origin": "https://sloverb.app", "CF-IPCountry": "<b>", "CF-Ray": "1-<i>",
                                        "X-Forwarded-For": "not an address, \x1b[31m10.0.0.1", "Accept-Language": "\x00en"})
        event = collected(client, key)["events"][0]
    assert not CONTROL.search(json.dumps(event, ensure_ascii=False)) and len(event["agent"]) == 300
    assert clean("a" + chr(0x202E) + "b" + chr(0x200D) + "\x9bc" + chr(0xD800)) == "ab" + chr(0x200D) + "c?" and clean("\x00") is None and clean(5) is None
    assert "country" not in event and "edge" not in event and event["language"] == "en"
    # no edge here to say whose address it is, so the chain a visitor can write is kept beside the one the server saw
    assert event["ip"] == "testclient" and event["forwarded"] == "not an address, [31m10.0.0.1"
    shown = line({**event, "kind": "import.ready", "title": "a\x1b]0;owned\x07b\nc", "job": "j"})
    assert "\x1b" not in shown and "\n" not in shown and "\x07" not in shown


def test_events_from_the_relay_are_cut_to_what_is_safe_to_keep():
    assert tidy({"seq": 1, "at": 5.0, "kind": "import.queued", "ip": "203.0.113.9", "status": 202, "ok": True, "title": "a\x1b[0mb\ud800" + "c" * 900,
                 "nested": {"a": 1}, "list": [1], "BAD NAME": "x", "nan": float("nan")}) == {
        "seq": 1, "at": 5.0, "kind": "import.queued", "ip": "203.0.113.9", "status": 202, "ok": True, "title": ("a[0mb?" + "c" * 900)[:400]}
    for junk in (None, "text", {"seq": "1", "at": 1, "kind": "request"}, {"seq": 1, "at": 1, "kind": "Not A Kind"},
                 {"seq": 1, "kind": "request"}, {"seq": 1, "at": float("inf"), "kind": "request"}, {"seq": True, "at": 1, "kind": "request"}):
        assert tidy(junk) is None


def test_the_journal_keeps_reads_and_follows(tmp_path):
    journal = Journal(tmp_path / "analytics")
    assert journal.cursor() == (None, 0) and list(journal.read()) == [] and journal.recent(5) == []
    tail = Tail(journal)
    assert journal.keep([{"at": 100.0, "kind": "request", "src": "relay", "boot": "b", "seq": 7, "agent": "日本語 \ud800"}])
    noted = journal.note("job.done", job="j", bytes=3, nothing=None)
    assert "nothing" not in noted and noted["src"] == "worker"
    path = journal.files()[0]
    with path.open("ab") as output:
        output.write(b'not json\n[1]\n{"kind":"request"}\n{"at":300.0,"kind":"half')  # damage, and a line still being written
    assert [event["kind"] for event in journal.read()] == ["request", "job.done"]
    assert [event["kind"] for event in journal.read(since=200)] == ["job.done"]
    assert journal.cursor() == ("b", 7)
    assert [event["kind"] for event in tail.poll()] == ["request", "job.done"] and tail.poll() == []
    with path.open("ab") as output:
        output.write(b' written"}\n')
    assert [event["kind"] for event in tail.poll()] == ["half written"]
    assert [event["kind"] for event in journal.recent(2)] == ["job.done", "half written"]
    assert "日本語" in path.read_text(encoding="utf-8")
    journal.LIMIT = 10  # a month's file stops growing, so a flood can't fill the disk
    assert not journal.keep([{"at": 1.0, "kind": "request"}]) and len(list(journal.read())) == 3


def test_following_carries_on_into_a_new_month(tmp_path):
    journal = Journal(tmp_path)
    (tmp_path / "events-2026-11.jsonl").write_text('{"at":1.0,"kind":"old"}\n')
    tail = Tail(journal)
    with (tmp_path / "events-2026-11.jsonl").open("a") as output:
        output.write('{"at":2.0,"kind":"november"}\n')
    (tmp_path / "events-2026-12.jsonl").write_text('{"at":3.0,"kind":"december"}\n')
    assert [event["kind"] for event in tail.poll()] == ["november", "december"]
    assert [event["kind"] for event in journal.recent(2)] == ["november", "december"]


def story(now):
    place = {"ip": "203.0.113.9", "country": "CA", "region": "Ontario", "city": "Toronto", "agent": PHONE}
    other = {"ip": "198.51.100.7", "country": "NG", "agent": "Mozilla/5.0 (Linux; Android 15) Chrome/131.0 Mobile Safari/537.36"}
    return [
        {"at": now - 500, "kind": "worker.started"},
        {"at": now - 400, "kind": "request", "method": "GET", "path": "/wp-login.php", "status": 404},
        {"at": now - 300, "kind": "import.queued", "job": "one", "video": "aaaaaaaaaaa", **place},
        {"at": now - 299, "kind": "import.claimed", "job": "one", "seconds": 1.0},
        {"at": now - 298, "kind": "job.info", "job": "one", "title": "first song", "channel": "someone", "duration": 200},
        {"at": now - 290, "kind": "job.done", "job": "one", "bytes": 4000000, "seconds": 9.0, "download": 3.0, "convert": 4.0},
        {"at": now - 290, "kind": "import.ready", "job": "one", "title": "first song", "bytes": 4000000, "seconds": 10.0},
        {"at": now - 289, "kind": "import.fetched", "job": "one", "bytes": 4000000, **place},
        {"at": now - 200, "kind": "import.queued", "job": "two", "video": "aaaaaaaaaaa", **other},
        {"at": now - 190, "kind": "job.failed", "job": "two", "error": "youtube blocked this import", "detail": "HTTP Error 403"},
        {"at": now - 190, "kind": "import.failed", "job": "two", "error": "youtube blocked this import", "seconds": 10.0},
        {"at": now - 100, "kind": "import.rejected", "reason": "imports are offline, try later", "video": "bbbbbbbbbbb", **other},
        {"at": now - 90, "kind": "import.queued", "job": "three", "video": "bbbbbbbbbbb", **place},
        {"at": now - 80, "kind": "import.cancelled", "job": "three", "seconds": 10.0},
        {"at": now - 60, "kind": "import.queued", "job": "four", "video": "ccccccccccc", **place},
    ]


def test_the_sums():
    now = time.time()
    summary = Summary()
    for event in story(now):
        summary.add(event)
    result = summary.result(now=now)
    assert result["totals"] == {"asked": 5, "imports": 4, "ready": 1, "failed": 1, "cancelled": 1, "open": 1, "refused": 1, "visitors": 2,
                                "countries": 2, "songs": 3, "bytes": 4000000, "seconds": 10.0, "requests": 1}
    assert dict(result["outcomes"]) == {"ready": 1, "youtube blocked this import": 1, "cancelled": 1, "open": 1, "imports are offline, try later": 1}
    assert [song["video"] for song in result["songs"]] == ["bbbbbbbbbbb", "aaaaaaaaaaa", "ccccccccccc"]  # most asked, then latest
    song = result["songs"][1]
    assert (song["title"], song["channel"], song["asked"], song["ready"], song["visitors"], song["duration"]) == ("first song", "someone", 2, 1, 2, 200)
    assert [(spot["place"], spot["asked"], spot["visitors"]) for spot in result["places"]] == [("Toronto, Ontario, CA", 3, 1), ("NG", 2, 1)]
    assert dict(result["devices"]) == {"iPhone Safari": 3, "Android Chrome": 2}
    assert sum(day["asked"] for day in result["days"]) == 5 and sum(day["ready"] for day in result["days"]) == 1 and sum(result["hours"]) == 5
    assert result["others"] == [("GET /wp-login.php 404", 1)]
    newest, oldest = result["recent"][0], result["recent"][-1]
    assert newest["job"] == "four" and newest["outcome"] == "open"
    assert oldest["outcome"] == "ready" and oldest["fetched"] and oldest["where"] == "Toronto, Ontario, CA" and oldest["download"] == 3.0
    assert result["recent"][2]["detail"] == "HTTP Error 403"
    # a job nobody ever said the end of was lost when the relay restarted
    assert summary.result(now=now + 3600)["totals"]["open"] == 0


def test_the_workers_own_word_stands_in_until_the_relays_arrives(tmp_path):
    now = time.time()
    journal = Journal(tmp_path)
    journal.keep([{"at": now - 50, "kind": "job.claimed", "job": "one", "video": "aaaaaaaaaaa"},
                  {"at": now - 40, "kind": "job.done", "job": "one", "bytes": 10, "seconds": 9.0},
                  {"at": now - 30, "kind": "job.failed", "job": "two", "error": "that video isn't available"},
                  {"at": now - 86400 * 40, "kind": "import.rejected", "reason": "imports are busy, try again"}])
    result = summarise(journal, days=7)
    assert result["totals"]["ready"] == 1 and result["totals"]["failed"] == 1 and result["totals"]["refused"] == 0
    assert summarise(journal)["totals"]["refused"] == 1


def test_what_someone_is_on():
    assert device(PHONE) == "iPhone Safari"
    assert device("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0") == "Windows Edge"
    assert device("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0") == "Mac Firefox"
    assert device("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)") == "bot"
    assert device("curl/8.5.0") == "bot" and device(None) == "unknown"


def test_a_city_comes_from_a_file_on_this_machine_or_not_at_all(tmp_path):
    geo = Geo(tmp_path / "geo")
    assert geo.where("203.0.113.9") == {} and geo.where(None) == {}  # no file: no city, and no error
    (tmp_path / "geo").mkdir()
    (tmp_path / "geo" / "broken.mmdb").write_bytes(b"not a database")
    geo.looked = None
    assert geo.where("203.0.113.9") == {}

    class Reader:
        def get(self, ip):
            if ip == "bad":
                raise ValueError("not an address")
            return {"203.0.113.9": {"city": {"names": {"en": "Toronto"}}, "subdivisions": [{"names": {"en": "Ontario"}}], "country": {"iso_code": "CA"}},
                    "198.51.100.7": {"city": "Lagos\x1b[0m", "region": "Lagos", "country": "NG"}}.get(ip)

        def close(self):
            pass

    geo.reader = Reader()
    assert geo.where("203.0.113.9") == {"country": "CA", "region": "Ontario", "city": "Toronto"}
    assert geo.where("198.51.100.7") == {"country": "NG", "region": "Lagos", "city": "Lagos[0m"}
    assert geo.where("192.0.2.1") == {} and geo.where("bad") == {}
    geo.close()


def worker_in(tmp_path):
    key = Ed25519PrivateKey.generate()
    (tmp_path / "worker.key").write_bytes(key.private_bytes_raw())
    (tmp_path / "config.json").write_text(json.dumps({"relay": "https://relay.example"}))
    return Worker(tmp_path)


class Answer:
    def __init__(self, data):
        self.data = data

    def json(self):
        return self.data


def test_the_worker_brings_home_what_the_relay_saw(tmp_path, monkeypatch):
    async def scenario():
        worker = worker_in(tmp_path)
        asked, pauses = [], []
        event = {"at": 10.0, "kind": "import.queued", "ip": "203.0.113.9", "country": "CA", "job": "one"}
        answers = [
            {"version": 1, "boot": "first", "dropped": 0, "events": [{**event, "seq": 1}, {**event, "seq": 2, "country": "US"}, "junk", {"seq": 3}]},
            httpx.HTTPStatusError("old relay", request=None, response=httpx.Response(404)),
            {"version": 2, "boot": "first", "events": []},
            {"version": 1, "boot": "first", "dropped": 4, "events": [{**event, "seq": 2}, {**event, "seq": 4, "ip": "198.51.100.7"}]},
            {"version": 1, "boot": "second", "dropped": 0, "events": [{**event, "seq": 1, "kind": "request"}]},
        ]

        async def request(method, path, data, timeout=None):
            assert (method, path, timeout) == ("POST", "/internal/worker/events", 40)
            asked.append((data["boot"], data["after"]))
            if not answers:
                raise asyncio.CancelledError
            answer = answers.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return Answer(answer)

        async def sleep(seconds):
            pauses.append(seconds)
        worker.request = request
        worker.geo.where = lambda ip: {"country": "CA", "region": "Ontario", "city": "Toronto"} if ip == "203.0.113.9" else {}
        monkeypatch.setattr("backend.worker.asyncio.sleep", sleep)
        with pytest.raises(asyncio.CancelledError):
            await worker.collect()
        await worker.client.aclose()
        return asked, pauses

    asked, pauses = asyncio.run(scenario())
    # where it had got to, each time it asked: a lost or refused answer is asked for again from the same place
    # (the third event of the first answer couldn't be read, and is stepped past rather than asked for again for ever)
    assert asked == [(None, 0), ("first", 3), ("first", 3), ("first", 3), ("first", 4), ("second", 1)]
    assert pauses == [300, 15]  # a relay from before any of this, then an answer it can't read
    kept = list(Journal(tmp_path / "analytics").read())
    relay = [event for event in kept if event.get("src") == "relay"]
    assert [(event["boot"], event["seq"], event["kind"]) for event in relay] == [
        ("first", 1, "import.queued"), ("first", 2, "import.queued"), ("first", 4, "import.queued"), ("second", 1, "request")]
    assert relay[0]["city"] == "Toronto" and relay[0]["region"] == "Ontario"
    assert "city" not in relay[1] and relay[1]["country"] == "US"  # the file and the edge disagree: no guess
    assert "city" not in relay[2]
    assert [event["dropped"] for event in kept if event["kind"] == "worker.journal"] == [4]
    assert Journal(tmp_path / "analytics").cursor() == ("second", 1)  # and a restart carries on from here


def test_a_download_is_written_down_and_what_went_wrong_stays_home(tmp_path, monkeypatch):
    async def scenario(outcome):
        sent = []

        async def extraction(_manager, job):
            job.title, job.meta = "test song", {"channel": "someone", "duration": 213, "odd": ["x"], "job": "clash"}
            job.times.update(opening=1.0, downloading=2.5, converting=6.0)
            await asyncio.sleep(0)
            if outcome == "ready":
                (job.directory / "source.mp3").write_bytes(b"ID3audio")
                job.status, job.times["ready"] = "ready", 9.0
            else:
                job.status, job.error = "failed", "youtube blocked this import"
                job.detail = "DownloadError: HTTP Error 403 for https://signed.example/?ip=192.0.2.44&sig=secret"
        monkeypatch.setattr("backend.worker.Imports.run", extraction)
        worker = worker_in(tmp_path / outcome)
        worker.allowed = True

        async def request(method, path, data=None, body=None, headers=None, timeout=None):
            sent.append(json.dumps(data) if body is None else "audio")
        worker.request = request
        await worker.download({"version": 1, "id": "a" * 43, "url": VIDEO, "lease": "test"})
        await worker.client.aclose()
        return sent, list(Journal(tmp_path / outcome / "analytics").read())

    (tmp_path / "ready").mkdir()
    (tmp_path / "failed").mkdir()
    sent, kept = asyncio.run(scenario("ready"))
    assert [event["kind"] for event in kept] == ["job.claimed", "job.info", "job.done"]
    assert all(event["job"] == tag("a" * 43) and event["video"] == "jNQXAC9IVRw" for event in kept)
    assert kept[1] == {**kept[1], "title": "test song", "channel": "someone", "duration": 213} and "odd" not in kept[1]
    assert kept[2] == {**kept[2], "bytes": 8, "found": 1.5, "download": 3.5, "convert": 3.0} and "upload" in kept[2]
    assert "a" * 43 not in json.dumps(kept)

    sent, kept = asyncio.run(scenario("failed"))
    assert [event["kind"] for event in kept] == ["job.claimed", "job.info", "job.failed"]
    assert kept[2]["error"] == "youtube blocked this import" and "sig=secret" in kept[2]["detail"]
    # the extractor's own account can hold signed links and this machine's address: only the fixed message leaves
    assert "youtube blocked this import" in sent[-1] and not any("secret" in message or "192.0.2.44" in message for message in sent)


def test_a_job_the_visitor_cancelled_is_stopped_not_failed(tmp_path, monkeypatch):
    async def scenario():
        async def extraction(_manager, _job):
            await asyncio.Event().wait()
        monkeypatch.setattr("backend.worker.Imports.run", extraction)
        worker = worker_in(tmp_path)
        worker.allowed = True

        async def request(method, path, data=None, **_):
            raise httpx.HTTPStatusError("gone", request=None, response=httpx.Response(404))
        worker.request = request
        await worker.download({"version": 1, "id": "a" * 43, "url": VIDEO, "lease": "test"})
        await worker.client.aclose()
    asyncio.run(scenario())
    kept = list(Journal(tmp_path / "analytics").read())
    assert [event["kind"] for event in kept] == ["job.claimed", "job.stopped"] and "relay" in kept[1]["reason"]


def test_how_long_each_step_took():
    assert steps({"opening": 1.0, "downloading": 2.5, "converting": 6.0, "ready": 9.0}) == {"found": 1.5, "download": 3.5, "convert": 3.0}
    assert steps({"opening": 1.0}) == {}


def test_what_the_extractor_says_stays_out_of_what_a_visitor_sees():
    app = create_app()

    async def extract(job):
        job.detail = "HTTP Error 403 for https://signed.example/?sig=secret"
        raise RuntimeError("something internal at 192.0.2.44")

    app.state.imports.extract = extract
    with TestClient(app) as client:
        job = client.post("/v1/imports", json={"url": VIDEO}).json()["id"]
        for _ in range(200):
            result = client.get(f"/v1/imports/{job}")
            if result.json()["status"] == "failed":
                break
            time.sleep(0.005)
        assert result.json()["error"] == "couldn't import that video"
        assert "secret" not in result.text and "192.0.2.44" not in result.text and "detail" not in result.json()
        held = json.dumps(list(app.state.imports.events.held))
        assert "import.failed" in held and "secret" not in held and "192.0.2.44" not in held


def test_the_dashboard_answers_this_machine_and_nothing_else(tmp_path):
    import http.client
    import threading

    from backend.dashboard import Server, handler

    now = time.time()
    Journal(tmp_path / "analytics").keep([{**event, "title": "<img src=x onerror=alert(1)>"} if event["kind"] == "import.ready" else event
                                          for event in story(now)])
    (tmp_path / "state.json").write_text(json.dumps({"status": "ready", "enabled": True, "relay_online": True, "jobs_finished": 1, "updated_at": now}))
    server = Server(("127.0.0.1", 0), handler(tmp_path))
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def get(path, method="GET", **headers):
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request(method, path, headers=headers)
        response = connection.getresponse()
        return connection, response

    try:
        connection, page = get("/")
        body = page.read().decode()
        connection.close()
        policy = page.getheader("Content-Security-Policy")
        nonce = policy.split("'nonce-")[1].split("'")[0]
        assert page.status == 200 and "default-src 'none'" in policy and "unsafe" not in policy
        assert body.count(f'nonce="{nonce}"') == 2 and "__NONCE__" not in body and "innerHTML" not in body

        connection, summary = get("/summary?range=all")
        result = json.loads(summary.read())
        connection.close()
        assert result["totals"]["asked"] == 5 and result["state"]["status"] == "ready" and result["range"] == "all"
        connection, summary = get("/summary?range=nonsense")
        assert json.loads(summary.read())["range"] == "7"
        connection.close()

        # another site open in the same browser, or a name pointed at 127.0.0.1, is told nothing
        for refused in ({"Host": "evil.test"}, {"Host": f"evil.test:{port}"}, {"Sec-Fetch-Site": "cross-site"}, {"Sec-Fetch-Site": "same-site"}):
            connection, response = get("/summary", **refused)
            assert response.status == 403 and b"asked" not in response.read()
            connection.close()
        connection, response = get("/summary", method="POST")
        assert response.status == 501
        connection.close()
        connection, response = get("/analytics/events-2026-11.jsonl")
        assert response.status == 404
        connection.close()

        connection, live = get("/live")
        assert live.status == 200 and live.getheader("Content-Type") == "text/event-stream"
        first = json.loads(live.fp.readline().decode().removeprefix("data: "))
        assert first["label"] == "worker" and set(first) == {"at", "label", "text"}
        connection.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(5)


def test_writing_a_request_down_is_never_what_fails_it(monkeypatch):
    def broken(_request):
        raise RuntimeError("the journal is having a bad day")
    monkeypatch.setattr("backend.app.visitor", broken)
    app, key = fixture()
    with TestClient(app) as client:
        assert client.get("/healthz", headers=VISITOR).status_code == 200
        assert signed(client, key, "/internal/worker/claim", {"available": True}).status_code == 204
        assert client.post("/v1/imports", json={"url": VIDEO}, headers=VISITOR).status_code == 202
        assert [event["kind"] for event in collected(client, key)["events"]] == []


def test_a_journal_that_cannot_be_written_never_stops_an_import(tmp_path, monkeypatch):
    async def scenario():
        async def extraction(_manager, job):
            (job.directory / "source.mp3").write_bytes(b"ID3audio")
            job.status = "ready"
        monkeypatch.setattr("backend.worker.Imports.run", extraction)
        worker = worker_in(tmp_path)
        worker.allowed = True
        (tmp_path / "analytics").write_text("a file where the folder should be")

        def broken(*_args, **_fields):
            raise OSError("disk full")
        sent = []

        async def request(method, path, data=None, body=None, headers=None, timeout=None):
            sent.append((method, path.rsplit("/", 1)[-1]))
        worker.request = request
        await worker.download({"version": 1, "id": "a" * 43, "url": VIDEO, "lease": "test"})
        assert worker.state["jobs_finished"] == 1 and sent[-1] == ("PUT", "audio")
        worker.journal.note = broken
        await worker.download({"version": 1, "id": "b" * 43, "url": VIDEO, "lease": "test"})
        assert worker.state["jobs_finished"] == 2
        await worker.client.aclose()
    asyncio.run(scenario())
