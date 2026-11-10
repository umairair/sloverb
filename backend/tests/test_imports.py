import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from backend.app import Settings, create_app
from backend.urls import youtube_url

VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw"


@pytest.mark.parametrize("url", [VIDEO, "https://youtu.be/jNQXAC9IVRw?si=test", "https://music.youtube.com/watch?v=jNQXAC9IVRw&list=PL123", "https://m.youtube.com/shorts/jNQXAC9IVRw", "https://www.youtube.com/embed/jNQXAC9IVRw"])
def test_video_links(url):
    assert youtube_url(url) == VIDEO


@pytest.mark.parametrize("url", ["https://youtube.com.evil.test/watch?v=jNQXAC9IVRw", "http://127.0.0.1/watch?v=jNQXAC9IVRw", "file:///etc/passwd", "https://youtube.com@127.0.0.1/watch?v=jNQXAC9IVRw", "https://youtube.com/playlist?list=abc", "https://youtube.com/watch?v=invalid", "https://youtube.com:8080/watch?v=jNQXAC9IVRw", "https://youtube.com/watch?v=jNQXAC9IVRw%0A", "https://youtube.com/watch?v=../../hello"])
def test_reject_arbitrary_urls(url):
    with pytest.raises(ValueError):
        youtube_url(url)


def wait_for(client, job, status):
    for _ in range(200):
        result = client.get(f"/v1/imports/{job}").json()
        if result["status"] == status:
            return result
        time.sleep(0.005)
    raise AssertionError(result)


def test_audio_round_trip_and_delete():
    app = create_app()

    async def extract(job):
        job.title = "test song"
        (job.directory / "source.mp3").write_bytes(b"ID3audio")

    app.state.imports.extract = extract
    with TestClient(app) as client:
        response = client.post("/v1/imports", json={"url": VIDEO}, headers={"Origin": "https://sloverb.app"})
        assert response.status_code == 202
        assert response.headers["access-control-allow-origin"] == "https://sloverb.app"
        job = response.json()["id"]
        assert len(job) >= 32
        assert wait_for(client, job, "ready")["title"] == "test song"
        audio = client.get(f"/v1/imports/{job}/audio")
        assert audio.content == b"ID3audio"
        assert audio.headers["content-type"] == "audio/mpeg"
        assert audio.headers["cache-control"] == "no-store"
        directory = app.state.imports.get(job).directory
        assert client.delete(f"/v1/imports/{job}").status_code == 204
        assert not directory.exists()
        assert client.get(f"/v1/imports/{job}/audio").status_code == 404


def test_queue_cancel_and_rate_limit():
    app = create_app(Settings(capacity=1, rate_limit=2))

    async def extract(job):
        await asyncio.sleep(20)

    app.state.imports.extract = extract
    with TestClient(app) as client:
        job = client.post("/v1/imports", json={"url": VIDEO}).json()["id"]
        directory = app.state.imports.get(job).directory
        assert client.get(f"/v1/imports/{job}/audio").status_code == 409
        assert client.post("/v1/imports", json={"url": VIDEO}).status_code == 503
        assert client.delete(f"/v1/imports/{job}").status_code == 204
        assert not directory.exists()
        assert client.post("/v1/imports", json={"url": VIDEO}).status_code == 202
        assert client.post("/v1/imports", json={"url": VIDEO}).status_code == 429


def test_deadline_and_expiry():
    app = create_app(Settings(timeout=0.01, ttl=0.05))

    async def extract(job):
        await asyncio.sleep(20)

    app.state.imports.extract = extract
    with TestClient(app) as client:
        job = client.post("/v1/imports", json={"url": VIDEO}).json()["id"]
        directory = app.state.imports.get(job).directory
        assert wait_for(client, job, "failed")["error"] == "import took too long, try again"
        assert not directory.exists()
        time.sleep(0.06)
        assert client.get(f"/v1/imports/{job}").status_code == 404


def test_invalid_origin_and_large_body():
    with TestClient(create_app()) as client:
        assert client.post("/v1/imports", json={"url": "http://localhost"}).status_code == 400
        assert client.post("/v1/imports", json={"url": VIDEO}, headers={"Origin": "https://evil.test"}).status_code == 403
        assert client.post("/v1/imports", content=b"x" * 5000).status_code == 413
        assert client.get("/healthz").status_code == 200


def test_oversized_output_is_deleted():
    app = create_app(Settings(max_file_bytes=3))

    async def extract(job):
        (job.directory / "source.mp3").write_bytes(b"ID3too large")

    app.state.imports.extract = extract
    with TestClient(app) as client:
        job = client.post("/v1/imports", json={"url": VIDEO}).json()["id"]
        assert wait_for(client, job, "failed")["error"] == "that video is too large"
        assert client.get(f"/v1/imports/{job}/audio").status_code == 409
