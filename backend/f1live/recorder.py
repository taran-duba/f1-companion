"""Record live messages to a replayable JSON Lines file.

Files are written in the shared :mod:`f1live.messages` format, so
:func:`f1live.messages.read_messages` and the replay source read them back.

``t`` is rebased so the first message written (the snapshot) is at 0.
When no explicit path is given the file name is
``<UTC timestamp>_<session slug>.jsonl`` in the recordings directory; the
file is opened lazily once ``SessionInfo`` (or the first non-snapshot
message) has been seen, so the slug can use the real session name, unless
``start(session_name=...)`` already supplied one. Snapshot messages that
arrive before that are buffered (bounded), preserving order.

If the live source reconnects mid-recording, the fresh snapshot lines are
written in place with ``"snapshot": true`` and their real ``t``.
"""

from __future__ import annotations

import dataclasses
import logging
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import IO, Any

from .messages import Message, open_text

log = logging.getLogger(__name__)

DEFAULT_DIR = Path(__file__).resolve().parents[2] / "data" / "recordings"
FLUSH_INTERVAL = 2.0
FLUSH_EVERY = 500
MAX_PENDING = 1000  # snapshot lines held while waiting for SessionInfo


def slugify(text: str, max_len: int = 60) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].strip("-") or "session"


def session_slug(session_info: Any) -> str:
    """``"Sample Grand Prix" + "Race"`` -> ``sample-grand-prix-race``."""
    if not isinstance(session_info, dict):
        return "session"
    meeting = session_info.get("Meeting")
    parts = []
    if isinstance(meeting, dict) and isinstance(meeting.get("Name"), str):
        parts.append(meeting["Name"])
    if isinstance(session_info.get("Name"), str):
        parts.append(session_info["Name"])
    return slugify(" ".join(parts)) if parts else "session"


class Recorder:
    def __init__(self, directory: str | Path | None = None, *, flush_interval: float = FLUSH_INTERVAL,
                 flush_every: int = FLUSH_EVERY) -> None:
        self.directory = Path(directory) if directory else DEFAULT_DIR
        self.flush_interval = flush_interval
        self.flush_every = flush_every
        self._lock = threading.Lock()
        self._enabled = False
        self._path: Path | None = None
        self._explicit_path: Path | None = None
        self._session_name: str | None = None
        self._fh: IO[str] | None = None
        self._pending: list[Message] = []
        self._t_base: float | None = None
        self._written = 0
        self._bytes = 0
        self._unflushed = 0
        self._last_flush = time.monotonic()
        self._started_at: datetime | None = None
        self._last_error: str | None = None

    # ------------------------------------------------------------ public

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def path(self) -> Path | None:
        return self._path

    def start(self, path: str | Path | None = None, *, session_name: str | None = None) -> None:
        """Begin a new recording (closing any current one).

        ``session_name`` (e.g. ``"Sample Grand Prix Race"``) names the file
        up front; otherwise the name comes from the first ``SessionInfo``.
        """
        self.stop()
        with self._lock:
            self._enabled = True
            self._explicit_path = Path(path) if path else None
            name = session_name.strip() if isinstance(session_name, str) else ""
            self._session_name = name or None
            self._path = None
            self._pending = []
            self._t_base = None
            self._written = 0
            self._bytes = 0
            self._unflushed = 0
            self._last_error = None
            self._started_at = datetime.now(timezone.utc)

    def stop(self) -> Path | None:
        """Finish the recording; returns the file path (None if nothing written)."""
        with self._lock:
            if not self._enabled:
                return self._path
            try:
                if self._fh is None and self._pending:
                    self._open_locked(None)
            except OSError as exc:
                self._last_error = str(exc)
                log.error("recorder: could not write %s: %s", self._path, exc)
            self._close_locked()
            self._enabled = False
            return self._path

    def write(self, msg: Message) -> None:
        """Record one message. Safe to use directly as a live-source callback."""
        with self._lock:
            if not self._enabled:
                return
            try:
                if self._fh is None:
                    if (msg.snapshot and msg.topic != "SessionInfo" and self._explicit_path is None
                            and self._session_name is None and len(self._pending) < MAX_PENDING):
                        self._pending.append(msg)
                        return
                    info = msg.data if msg.topic == "SessionInfo" else None
                    self._open_locked(info)
                self._write_locked(msg)
                now = time.monotonic()
                if self._unflushed >= self.flush_every or now - self._last_flush >= self.flush_interval:
                    self._flush_locked(now)
            except OSError as exc:
                self._last_error = str(exc)
                log.error("recorder: write failed, stopping: %s", exc)
                self._close_locked()
                self._enabled = False

    __call__ = write

    def flush(self) -> None:
        with self._lock:
            self._flush_locked(time.monotonic())

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "enabled": self._enabled,
                "path": str(self._path) if self._path else None,
                "messages": self._written + len(self._pending),
                "messages_written": self._written,
                "bytes": self._bytes,
                "started_at": self._started_at.isoformat().replace("+00:00", "Z") if self._started_at else None,
                "last_error": self._last_error,
            }

    # ----------------------------------------------------------- private

    def _default_path(self, session_info: Any) -> Path:
        stamp = (self._started_at or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
        if self._session_name:
            return self.directory / f"{stamp}_{slugify(self._session_name)}.jsonl"
        if session_info is None:
            for m in self._pending:
                if m.topic == "SessionInfo":
                    session_info = m.data
                    break
        return self.directory / f"{stamp}_{session_slug(session_info)}.jsonl"

    def _open_locked(self, session_info: Any) -> None:
        path = self._explicit_path or self._default_path(session_info)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and self._explicit_path is None:
            stem = path.name[: -len(".jsonl")]
            n = 2
            while (path.parent / f"{stem}-{n}.jsonl").exists():
                n += 1
            path = path.parent / f"{stem}-{n}.jsonl"
        self._fh = open_text(path, "wt")
        self._path = path
        log.info("recorder: writing %s", path)
        pending, self._pending = self._pending, []
        for m in pending:
            self._write_locked(m)

    def _write_locked(self, msg: Message) -> None:
        assert self._fh is not None
        t_base = msg.t if self._t_base is None else self._t_base
        try:  # serialise before writing so a bad payload leaves no partial line
            line = dataclasses.replace(msg, t=max(0.0, msg.t - t_base)).to_json() + "\n"
        except (TypeError, ValueError) as exc:
            self._last_error = f"skipped unserialisable {msg.topic}: {exc}"
            log.warning("recorder: %s", self._last_error)
            return
        self._t_base = t_base
        self._fh.write(line)
        self._written += 1
        self._bytes += len(line.encode("utf-8"))
        self._unflushed += 1

    def _flush_locked(self, now: float) -> None:
        if self._fh is not None:
            self._fh.flush()
        self._unflushed = 0
        self._last_flush = now

    def _close_locked(self) -> None:
        if self._fh is not None:
            try:
                self._fh.flush()
                self._fh.close()
            except OSError as exc:
                self._last_error = str(exc)
            self._fh = None
