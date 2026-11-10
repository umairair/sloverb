"""Accept video links only; never pass arbitrary URLs to an extractor."""
import re
from urllib.parse import parse_qs, urlsplit

HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}
VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}\Z")


def youtube_url(value: str) -> str:
    try:
        link = urlsplit(value.strip())
        if link.scheme not in {"http", "https"} or link.hostname not in HOSTS:
            raise ValueError
        if link.username or link.password or link.port not in {None, 80, 443}:
            raise ValueError
        parts = link.path.strip("/").split("/")
        if link.hostname in {"youtu.be", "www.youtu.be"} and len(parts) == 1:
            video = parts[0]
        elif link.path == "/watch":
            video = parse_qs(link.query).get("v", [""])[0]
        elif len(parts) == 2 and parts[0] in {"shorts", "embed", "live"}:
            video = parts[1]
        else:
            raise ValueError
        if not VIDEO_ID.fullmatch(video):
            raise ValueError
        return f"https://www.youtube.com/watch?v={video}"
    except (ValueError, TypeError):
        raise ValueError("enter a youtube video link") from None
