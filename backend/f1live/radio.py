"""Team radio clips for ``GET /api/radio``.

``TeamRadio`` captures carry a ``Path`` relative to the session's static
folder, e.g. ``TeamRadio/MAXVER01_1_20240302_154517.mp3``. A clip is served:

1. from disk when the active source replays a file and a ``radio/`` directory
   sits next to that file (``data/demo/radio/`` for the demo race,
   ``data/recordings/radio/`` for recordings), looked up by the clip's file name;
2. otherwise from ``https://livetiming.formula1.com/static/{SessionInfo.Path}{Path}``,
   with the F1 TV token as ``Authorization: Bearer`` when one is set. Fetched
   clips are kept in a small in-memory LRU cache.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from collections import OrderedDict
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger(__name__)

STATIC_BASE = "https://livetiming.formula1.com/static/"
CONTENT_TYPES = {"mp3": "audio/mpeg", "m4a": "audio/mp4", "wav": "audio/wav"}
CLIP_PATH = re.compile(r"^TeamRadio/([A-Za-z0-9_.-]+)\.(mp3|m4a|wav)$")
SESSION_PATH = re.compile(r"^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*/$")
CACHE_SIZE = 64
MAX_BYTES = 5 * 1024 * 1024
TIMEOUT = 10.0


class RadioError(Exception):
    """A clip could not be served; ``status`` is the HTTP status to return."""

    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


def parse_path(path: str) -> tuple[str, str]:
    """Validate a capture path; returns ``(file name, content type)``."""
    m = CLIP_PATH.match(path or "")
    if not m or ".." in path:
        raise RadioError(400, "invalid radio path")
    return f"{m.group(1)}.{m.group(2)}", CONTENT_TYPES[m.group(2)]


def local_dir(source: Any) -> Path | None:
    """The ``radio/`` directory next to the replayed file, if there is one."""
    path = getattr(source, "path", None)
    if not path:
        return None
    d = Path(path).resolve().parent / "radio"
    return d if d.is_dir() else None


class RadioFetcher:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None,
                 cache_size: int = CACHE_SIZE, timeout: float = TIMEOUT) -> None:
        self.transport = transport
        self.timeout = timeout
        self.cache_size = cache_size
        self._cache: OrderedDict[str, bytes] = OrderedDict()

    async def get(self, path: str, source: Any, session_info: dict | None) -> tuple[bytes, str]:
        """Return ``(audio bytes, content type)`` or raise :class:`RadioError`."""
        name, ctype = parse_path(path)
        d = local_dir(source)
        if d is not None:
            f = (d / name).resolve()
            if f.parent == d and f.is_file():
                return await asyncio.to_thread(f.read_bytes), ctype
        session_path = (session_info or {}).get("Path")
        if not isinstance(session_path, str) or not SESSION_PATH.match(session_path) or ".." in session_path:
            raise RadioError(404, "radio clip not available: no local copy and no session path")
        return await self._fetch(STATIC_BASE + session_path + path), ctype

    async def _fetch(self, url: str) -> bytes:
        if url in self._cache:
            self._cache.move_to_end(url)
            return self._cache[url]
        headers = {}
        token = os.environ.get("F1TV_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            async with httpx.AsyncClient(transport=self.transport, timeout=self.timeout) as client:
                resp = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            log.info("radio fetch failed for %s: %s", url, exc)
            raise RadioError(404, "radio clip not available: F1 did not respond") from exc
        if resp.status_code != 200:
            raise RadioError(404, f"radio clip not available: F1 returned HTTP {resp.status_code}")
        data = resp.content
        if not data or len(data) > MAX_BYTES:
            raise RadioError(404, "radio clip not available: unexpected response from F1")
        self._cache[url] = data
        while len(self._cache) > self.cache_size:
            self._cache.popitem(last=False)
        return data
