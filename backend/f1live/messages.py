"""Recorded stream format shared by the recorder, replay, demo and FastF1.

One JSON object per line (``.jsonl`` or ``.jsonl.gz``)::

    {"t": 12.345, "ts": "2026-03-08T05:00:12.345Z", "topic": "TimingData",
     "data": {...}, "snapshot": false}

``t`` is seconds since the start of the recording and drives replay timing.
``ts`` is the wall-clock UTC timestamp reported by the feed. Lines flagged
``"snapshot": true`` hold the full Subscribe response for one topic and come
first. ``.z`` topics are stored exactly as received (base64 string).
"""

from __future__ import annotations

import gzip
import io
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import IO, Any, Iterable, Iterator

log = logging.getLogger(__name__)


@dataclass(slots=True)
class Message:
    t: float
    topic: str
    data: Any
    ts: str = ""
    snapshot: bool = False

    def to_json(self) -> str:
        obj: dict[str, Any] = {"t": round(self.t, 3), "ts": self.ts, "topic": self.topic, "data": self.data}
        if self.snapshot:
            obj["snapshot"] = True
        return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)

    @classmethod
    def from_obj(cls, obj: dict) -> "Message":
        if not isinstance(obj, dict):
            raise ValueError("message must be a JSON object")
        topic = obj.get("topic")
        if not isinstance(topic, str) or not topic:
            raise ValueError("message has no topic")
        t = obj.get("t", 0.0)
        if not isinstance(t, (int, float)):
            raise ValueError("message t must be a number")
        return cls(t=float(t), topic=topic, data=obj.get("data"), ts=str(obj.get("ts") or ""),
                   snapshot=bool(obj.get("snapshot", False)))


@dataclass(slots=True)
class ReadStats:
    lines: int = 0
    bad_lines: int = 0
    errors: list[str] = field(default_factory=list)


def utc_iso(dt: datetime | None = None) -> str:
    dt = dt or datetime.now(timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(ts: str) -> datetime | None:
    if not ts:
        return None
    try:
        s = ts.replace("Z", "+00:00")
        # The feed sometimes emits 7 fractional digits; Python accepts up to 6.
        if "." in s:
            head, _, tail = s.partition(".")
            frac, sign, tz = tail, "", ""
            for i, ch in enumerate(tail):
                if ch in "+-":
                    frac, sign, tz = tail[:i], ch, tail[i + 1:]
                    break
            s = f"{head}.{frac[:6]}" + (f"{sign}{tz}" if sign else "")
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def open_text(path: str | Path, mode: str = "rt") -> IO[str]:
    path = Path(path)
    if path.suffix == ".gz":
        return gzip.open(path, mode, encoding="utf-8")  # type: ignore[return-value]
    return open(path, mode, encoding="utf-8")


def iter_messages(lines: Iterable[str], stats: ReadStats | None = None) -> Iterator[Message]:
    """Parse lines, skipping (and counting) malformed ones instead of raising."""
    for n, line in enumerate(lines, 1):
        line = line.strip()
        if not line:
            continue
        if stats:
            stats.lines += 1
        try:
            yield Message.from_obj(json.loads(line))
        except (json.JSONDecodeError, ValueError) as exc:
            if stats:
                stats.bad_lines += 1
                if len(stats.errors) < 20:
                    stats.errors.append(f"line {n}: {exc}")
            log.debug("skipping malformed line %d: %s", n, exc)


def read_messages(path: str | Path, stats: ReadStats | None = None) -> list[Message]:
    with open_text(path) as fh:
        msgs = list(iter_messages(fh, stats))
    # Recordings are written in order, but be defensive: stable sort by t
    # keeps snapshot lines (which share t=0) ahead of updates.
    msgs.sort(key=lambda m: (m.t, not m.snapshot))
    return msgs


def write_messages(path: str | Path, messages: Iterable[Message]) -> int:
    count = 0
    with open_text(path, "wt") as fh:
        for m in messages:
            fh.write(m.to_json() + "\n")
            count += 1
    return count


def dumps_lines(messages: Iterable[Message]) -> str:
    buf = io.StringIO()
    for m in messages:
        buf.write(m.to_json() + "\n")
    return buf.getvalue()
