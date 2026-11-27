"""Where an address is, looked up in a database file kept on this machine.

No address is ever sent anywhere to be looked up. The file is DB-IP's free city
database (https://db-ip.com, CC BY 4.0), fetched by hand with the `geo` command
and read with `maxminddb`. Without the file or the reader there is simply no
city, and the country the relay passed on (backend/events.py) is all there is.
"""
import gzip
import os
import shutil
import time
import urllib.error
import urllib.request
from pathlib import Path

from backend.events import clean

SOURCE = "https://download.db-ip.com/free/dbip-city-lite-{month}.mmdb.gz"


def named(value):
    # DB-IP and MaxMind nest names by language, other makers of these files write the name itself
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        names = value.get("names")
        return names.get("en") if isinstance(names, dict) else value.get("name")
    return None


class Geo:
    def __init__(self, directory: Path):
        self.directory = Path(directory)
        self.reader = None
        self.path = None
        self.looked = None

    def open(self):
        # look again now and then, `geo` may have fetched a newer file since
        if self.looked is not None and time.monotonic() - self.looked < 600:
            return
        self.looked = time.monotonic()
        try:
            newest = max(self.directory.glob("*.mmdb"), key=lambda path: path.stat().st_mtime, default=None)
            if newest and newest != self.path:
                import maxminddb
                reader = maxminddb.open_database(str(newest))
                self.close()
                self.reader, self.path = reader, newest
        except Exception:
            pass  # no reader installed, or not a database: carry on without a city

    def close(self):
        if self.reader:
            self.reader.close()
        self.reader = self.path = None

    def where(self, ip) -> dict:
        self.open()
        if not self.reader or not isinstance(ip, str):
            return {}
        try:
            found = self.reader.get(ip)
        except Exception:
            return {}
        if not isinstance(found, dict):
            return {}
        country, regions = found.get("country"), found.get("subdivisions")
        result = {"country": country.get("iso_code") if isinstance(country, dict) else country,
                  "region": named(regions[0]) if isinstance(regions, list) and regions else named(found.get("region")),
                  "city": named(found.get("city"))}
        return {name: clean(value, 80) for name, value in result.items() if isinstance(value, str) and clean(value, 80)}


def fetch(directory: Path, say=print):
    """Download this month's database, or last month's in the first days of a month before the new one is out."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    year, month = time.gmtime()[:2]
    for back in (0, 1):
        stamp = f"{year}-{month - back:02d}" if month - back >= 1 else f"{year - 1}-12"
        target = directory / f"dbip-city-lite-{stamp}.mmdb"
        if target.exists():
            say(f"already have {target.name}")
            return target
        part = target.with_suffix(".part")
        request = urllib.request.Request(SOURCE.format(month=stamp), headers={"User-Agent": "geo-fetch/1"})
        try:
            say(f"fetching {target.name} from db-ip.com, about 130 MB once unpacked")
            with urllib.request.urlopen(request, timeout=60) as response, gzip.GzipFile(fileobj=response) as plain, part.open("wb") as output:
                shutil.copyfileobj(plain, output, 1 << 20)
        except urllib.error.HTTPError as error:
            part.unlink(missing_ok=True)
            if error.code == 404 and not back:
                continue
            raise
        except BaseException:
            part.unlink(missing_ok=True)
            raise
        os.replace(part, target)
        for old in directory.glob("*.mmdb"):
            if old != target:
                try:
                    old.unlink()
                except OSError:
                    pass  # Windows won't delete a file the worker still has open. The next fetch will.
        say(f"saved {target.name}, the worker starts using it within ten minutes")
        return target
    raise RuntimeError("no database found for this month or last")
