from pathlib import Path

import pytest

from backend.extract import about, extract, verdict


@pytest.mark.parametrize("info, message", [
    ({"duration": 601}, "under 10 minutes"),
    ({"is_live": True, "duration": 20}, "live videos"),
    ({"live_status": "is_upcoming", "duration": 20}, "live videos"),
    ({"_type": "playlist", "duration": 20}, "choose one video"),
    ({"duration": None}, "under 10 minutes"),
])
def test_metadata_checks_happen_before_downloading(monkeypatch, tmp_path, info, message):
    class Downloader:
        def __init__(self, options):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def extract_info(self, url, download):
            assert not download
            return info

        def process_info(self, info):
            pytest.fail("rejected videos must never be downloaded")

    monkeypatch.setattr("backend.extract.yt_dlp.YoutubeDL", Downloader)
    with pytest.raises(ValueError, match=message):
        extract("https://www.youtube.com/watch?v=jNQXAC9IVRw", tmp_path, 600, 100)


def test_download_hook_stops_oversized_sources(monkeypatch, tmp_path):
    class Downloader:
        def __init__(self, options):
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def extract_info(self, url, download):
            return {"duration": 20, "title": "test"}

        def process_info(self, info):
            self.options["progress_hooks"][0]({"downloaded_bytes": 101})

    monkeypatch.setattr("backend.extract.yt_dlp.YoutubeDL", Downloader)
    with pytest.raises(ValueError, match="too large"):
        extract("https://www.youtube.com/watch?v=jNQXAC9IVRw", Path(tmp_path), 600, 100)


@pytest.mark.parametrize("message, error, again", [
    ("ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm you\u2019re not a bot. Use --cookies", "youtube blocked this import", True),
    ("ERROR: unable to download video data: HTTP Error 403: Forbidden", "youtube blocked this import", True),
    ("HTTP Error 429: Too Many Requests", "youtube blocked this import", True),
    ("ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm your age. This video may be inappropriate for some users.", "that video isn't available", False),
    ("ERROR: [youtube] jNQXAC9IVRw: Private video. Sign in if you've been granted access", "youtube blocked this import", True),
    ("ERROR: [youtube] jNQXAC9IVRw: Video unavailable", "that video isn't available", False),
    ("ERROR: [youtube] jNQXAC9IVRw: Join this channel to get access to members-only content", "that video isn't available", False),
    # a timeout that happens to name a signed link: digits inside it are not a refusal, and it is worth another go
    ("<urlopen error timed out> https://rr1---sn.example/videoplayback?expire=1795740312&id=o-A429bot", "couldn't download that video", True),
    ("ffmpeg exited with code 1", "couldn't download that video", True),
])
def test_what_a_visitor_is_told_and_whether_to_try_again(message, error, again):
    result = verdict(RuntimeError(message + "; please report this issue on https://github.com/yt-dlp/yt-dlp/issues"))
    assert (result["error"], result["again"]) == (error, again)
    assert result["detail"].startswith("RuntimeError: ") and "please report" not in result["detail"] and len(result["detail"]) <= 1000


def test_our_own_checks_are_said_as_they_are_and_never_tried_again():
    assert verdict(ValueError("choose a video under 10 minutes")) == {"error": "choose a video under 10 minutes", "again": False}


def test_what_the_video_says_about_itself():
    assert about({"channel": " someone ", "uploader": "other", "track": "a song", "artist": "", "duration": 213, "view_count": 5, "upload_date": "20260101",
                  "categories": ["Music", "Other"], "like_count": 2, "formats": [1, 2]}) == {
        "channel": "someone", "track": "a song", "category": "Music", "duration": 213, "views": 5, "uploaded": "20260101"}
    assert about({"channel": 5, "categories": "Music", "duration": "long"}) == {}
