"""Message helpers: timestamps, formatting and per-step patch batching."""

from __future__ import annotations

from datetime import datetime, timedelta

from f1live.messages import Message, utc_iso


def deep_update(base: dict, patch: dict) -> dict:
    """Merge ``patch`` into ``base`` (dicts only; used to batch updates)."""
    for k, v in patch.items():
        cur = base.get(k)
        if isinstance(v, dict) and isinstance(cur, dict):
            deep_update(cur, v)
        else:
            base[k] = v
    return base


def fmt_lap(sec: float) -> str:
    """84.123 -> '1:24.123'."""
    ms = int(round(sec * 1000))
    m, rem = divmod(ms, 60000)
    return f"{m}:{rem // 1000:02d}.{rem % 1000:03d}"


def fmt_sector(sec: float) -> str:
    return f"{sec:.3f}"


def fmt_gap(sec: float) -> str:
    return f"+{max(sec, 0.0):.3f}"


def fmt_clock(sec: float) -> str:
    sec = max(0, int(sec))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


class Feed:
    """Collects messages. Topic patches added during one step are batched."""

    def __init__(self, t0_utc: datetime) -> None:
        self.t0 = t0_utc
        self.messages: list[Message] = []
        self._pending: dict[str, dict] = {}

    def ts(self, t: float) -> str:
        return utc_iso(self.t0 + timedelta(seconds=t))

    def snapshot(self, topic: str, data) -> None:
        self.messages.append(Message(t=0.0, topic=topic, data=data, ts=self.ts(0.0), snapshot=True))

    def emit(self, t: float, topic: str, data) -> None:
        self.messages.append(Message(t=round(t, 3), topic=topic, data=data, ts=self.ts(t)))

    def patch(self, topic: str, data: dict) -> None:
        """Queue a partial update; flushed as one message per topic per step."""
        deep_update(self._pending.setdefault(topic, {}), data)

    def line(self, topic: str, num: str, data: dict) -> None:
        self.patch(topic, {"Lines": {num: data}})

    def flush(self, t: float) -> None:
        for topic, data in self._pending.items():
            if data:
                self.emit(t, topic, data)
        self._pending = {}
