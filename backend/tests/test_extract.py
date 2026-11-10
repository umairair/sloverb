from pathlib import Path

import pytest

from backend.extract import extract


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
