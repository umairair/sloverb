import asyncio
import base64
import json
import time

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from backend.app import Settings, create_app
from backend.worker import battery_policy
from backend.worker_auth import signed_headers

VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw"


def fixture():
    key = Ed25519PrivateKey.generate()
    app = create_app(Settings(worker_public_key=base64.b64encode(key.public_key().public_bytes_raw()).decode()))
    return app, key


def signed(client, key, path, data):
    body = json.dumps(data).encode()
    return client.post(path, content=body, headers={"Content-Type": "application/json", **signed_headers(key, "POST", path, body)})


def claim(client, key):
    assert signed(client, key, "/internal/worker/claim", {"available": True}).status_code == 204
    result = client.post("/v1/imports", json={"url": VIDEO})
    assert result.status_code == 202
    return signed(client, key, "/internal/worker/claim", {"available": True}).json()


def test_signed_worker_roundtrip_and_replay_protection():
    app, key = fixture()
    with TestClient(app) as client:
        assert client.post("/v1/imports", json={"url": VIDEO}).status_code == 503
        assert client.post("/internal/worker/claim", json={"available": True}).status_code == 401
        remote = claim(client, key)
        assert remote["url"] == VIDEO and remote["version"] == 1
        assert signed(client, key, "/internal/worker/claim", {"available": True}).status_code == 204
        path = f"/internal/worker/{remote['id']}/progress"
        data = {"lease": remote["lease"], "status": "downloading", "title": "test song", "progress": 0.5}
        body = json.dumps(data).encode()
        headers = signed_headers(key, "POST", path, body)
        assert client.post(path, content=body, headers=headers).status_code == 200
        assert client.post(path, content=body, headers=headers).status_code == 401
        audio_path = f"/internal/worker/{remote['id']}/audio"
        audio = b"ID3test audio"
        def upload():
            return client.put(audio_path, content=audio, headers={"Content-Type": "audio/mpeg", "X-Worker-Lease": remote["lease"], **signed_headers(key, "PUT", audio_path, audio)})
        assert upload().status_code == 200
        assert upload().status_code == 200  # acknowledgement can be retried
        result = client.get(f"/v1/imports/{remote['id']}").json()
        assert result["status"] == "ready" and result["title"] == "test song"
        assert client.get(f"/v1/imports/{remote['id']}/audio").content == audio
        assert not any(name in result for name in ["lease", "url", "worker", "battery"])


def test_worker_rejects_forged_signed_messages_and_expired_leases():
    app, key = fixture()
    with TestClient(app) as client:
        remote = claim(client, key)
        path = f"/internal/worker/{remote['id']}/progress"
        data = {"lease": remote["lease"], "status": "downloading"}
        assert signed(client, Ed25519PrivateKey.generate(), path, data).status_code == 401
        assert signed(client, key, path, {**data, "lease": "wrong"}).status_code == 409
        app.state.imports.jobs[remote["id"]].lease_expires = time.monotonic() - 1
        assert signed(client, key, path, data).status_code == 409


def test_cancelled_import_and_paused_worker_stop_new_work():
    app, key = fixture()
    with TestClient(app) as client:
        remote = claim(client, key)
        assert client.delete(f"/v1/imports/{remote['id']}").status_code == 204
        assert signed(client, key, f"/internal/worker/{remote['id']}/progress", {"lease": remote["lease"], "status": "converting"}).status_code == 404
        assert signed(client, key, "/internal/worker/claim", {"available": False}).status_code == 204
        assert client.post("/v1/imports", json={"url": VIDEO}).status_code == 503
        assert client.get("/healthz").json()["available"] is False


def test_worker_uploads_are_bounded_and_content_authenticated():
    app, key = fixture()
    app.state.imports.settings.max_file_bytes = 12
    with TestClient(app) as client:
        remote = claim(client, key)
        path = f"/internal/worker/{remote['id']}/audio"
        for data, expected in [(b"ID3" + b"x" * 20, 413), (b"not an mp3", 400)]:
            response = client.put(path, content=data, headers={"Content-Type": "audio/mpeg", "X-Worker-Lease": remote["lease"], **signed_headers(key, "PUT", path, data)})
            assert response.status_code == expected
        response = client.put(path, content=b"ID3changed", headers={"Content-Type": "audio/mpeg", "X-Worker-Lease": remote["lease"], **signed_headers(key, "PUT", path, b"ID3original")})
        assert response.status_code == 400
        assert not (app.state.imports.jobs[remote["id"]].directory / "source.uploading").exists()


def test_low_battery_requires_explicit_resume_even_after_recovery():
    assert battery_policy(11, False, {"enabled": True}) == (True, None, False)
    assert battery_policy(10, False, {"enabled": True}) == (False, "low_battery", False)
    assert battery_policy(9, True, {"enabled": False, "reason": "low_battery"}) == (False, "low_battery", True)
    assert battery_policy(20, False, {"enabled": False, "reason": "low_battery"}) == (False, "low_battery", True)
    assert battery_policy(9, True, {"enabled": True}) == (True, None, True)
    assert battery_policy(50, False, {"enabled": False, "reason": "manual"}) == (False, "manual", True)


def test_cancellation_stops_extraction_before_contacting_unreachable_relay(tmp_path, monkeypatch):
    from backend.worker import Worker
    key = Ed25519PrivateKey.generate()
    (tmp_path / "worker.key").write_bytes(key.private_bytes_raw())
    (tmp_path / "config.json").write_text(json.dumps({"relay": "https://relay.example"}))

    async def scenario():
        started, stopped, reporting = asyncio.Event(), asyncio.Event(), asyncio.Event()
        async def extraction(_manager, _job):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                stopped.set()
        monkeypatch.setattr("backend.worker.Imports.run", extraction)
        worker = Worker(tmp_path)
        worker.allowed = True
        async def request(*_args, **_kwargs):
            return None
        worker.request = request
        async def failed(*_args):
            assert stopped.is_set()
            reporting.set()
            await asyncio.Event().wait()  # no network acknowledgement
        worker.fail = failed
        task = asyncio.create_task(worker.download({"version": 1, "id": "a" * 43, "url": VIDEO, "lease": "test"}))
        await asyncio.wait_for(started.wait(), 1)
        task.cancel()
        await asyncio.wait_for(reporting.wait(), 1)
        assert stopped.is_set()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        await worker.client.aclose()
    asyncio.run(scenario())
