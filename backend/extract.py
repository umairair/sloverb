"""Runs in a disposable process so cancellation and deadlines stop FFmpeg too."""
import json
import os
import sys
from pathlib import Path

import yt_dlp


def emit(**event):
    print(json.dumps(event), flush=True)


def about(info):
    """What the video says about itself, for the journal of the machine doing the
    download (backend/analytics.py). The title is all a visitor is ever shown."""
    def text(*names):
        for name in names:
            if isinstance(value := info.get(name), str) and value.strip():
                return value.strip()[:200]

    def number(name):
        return value if type(value := info.get(name)) in {int, float} else None

    categories = info.get("categories")
    found = {"channel": text("channel", "uploader"), "artist": text("artist", "creator"), "track": text("track"),
             "album": text("album"), "category": categories[0][:60] if isinstance(categories, list) and categories and isinstance(categories[0], str) else None,
             "duration": number("duration"), "views": number("view_count"), "uploaded": text("upload_date")}
    return {name: value for name, value in found.items() if value is not None}


class QuietLogger:
    def debug(self, _message):
        pass

    def warning(self, _message):
        pass

    def error(self, _message):
        pass


def extract(url: str, directory: Path, max_duration: int, max_bytes: int):
    def progress(event):
        downloaded = event.get("downloaded_bytes", 0)
        if downloaded > max_bytes:
            raise ValueError("that video is too large")
        total = event.get("total_bytes") or event.get("total_bytes_estimate")
        emit(status="downloading", progress=min(0.99, downloaded / total) if total else None)

    def postprocess(event):
        if event["status"] == "started":
            emit(status="converting", progress=None)

    options = {
        "format": "bestaudio/best",
        "outtmpl": str(directory / "source.%(ext)s"),
        "noplaylist": True,
        "max_filesize": max_bytes,
        "socket_timeout": 20,
        "retries": 1,
        "fragment_retries": 1,
        "concurrent_fragment_downloads": 1,
        "js_runtimes": {"node": {}},
        "cachedir": False,
        "quiet": True,
        "logger": QuietLogger(),
        "progress_hooks": [progress],
        "postprocessor_hooks": [postprocess],
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}],
        "postprocessor_args": {"ExtractAudio+ffmpeg_o": ["-threads", "1"]},
    }
    if provider := os.getenv("BGUTIL_SERVER_HOME"):
        options["extractor_args"] = {
            "youtube": {"player_client": ["mweb"]},
            "youtubepot-bgutilscript": {"server_home": [provider]},
        }
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(url, download=False)
        if not info or info.get("_type", "video") != "video":
            raise ValueError("choose one video")
        if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming", "post_live"}:
            raise ValueError("live videos aren't supported")
        duration = info.get("duration")
        if not duration or duration > max_duration:
            raise ValueError(f"choose a video under {max_duration // 60} minutes")
        emit(status="downloading", title=info.get("title", "youtube")[:200], progress=None, meta=about(info))
        downloader.process_info(info)
    output = directory / "source.mp3"
    if not output.is_file() or not output.stat().st_size:
        raise ValueError("couldn't download that video")


if __name__ == "__main__":
    try:
        extract(sys.argv[1], Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]))
    except Exception as error:
        # Only our own validation messages are public. Extractor diagnostics may
        # include signed URLs, tokens, IPs or upstream HTML, so they go out as
        # `detail`, which the parent keeps for its own journal and shows nobody.
        message = str(error)
        detail = f"{type(error).__name__}: {message.split('; please report this issue')[0]}"[:1000]
        if type(error) is ValueError:
            emit(error=message)
        elif any(part in message.lower() for part in ["sign in", "bot", "403", "429", "po token"]):
            emit(error="youtube blocked this import", detail=detail)
        elif any(part in message.lower() for part in ["unavailable", "private", "not available", "age-restricted", "members-only"]):
            emit(error="that video isn't available", detail=detail)
        else:
            emit(error="couldn't download that video", detail=detail)
        sys.exit(1)
