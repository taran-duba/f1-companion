"""Replay a recorded message list at a chosen speed with pause and seek.

Timing model: the replay position ``pos`` (seconds on the recording's ``t``
axis) advances as ``anchor_pos + (clock() - anchor_wall) * speed`` while
playing. Any control change (speed, pause, seek) re-anchors, so position is
continuous across changes. Messages with ``t <= pos`` are applied in order.
"""

from __future__ import annotations

import asyncio
import bisect
import logging
import time
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..messages import Message, ReadStats, read_messages
from .base import MessageSink, Source

log = logging.getLogger(__name__)

SPEEDS = (0.5, 1.0, 2.0, 5.0, 10.0, 30.0)
_HEAVY_WINDOW_S = 150.0  # keep full telemetry history only this far before a seek target
_MAX_STEP_S = 0.1
_MIN_STEP_S = 0.005
_EPS = 1e-6

# TrackStatus codes worth marking on the seek bar. 6 and 7 (VSC / VSC ending)
# share a group so one VSC deployment is one period.
_PERIOD_GROUPS = {"2": ("yellow", "Yellow"), "4": ("sc", "Safety car"), "5": ("red", "Red flag"),
                  "6": ("vsc", "Virtual safety car"), "7": ("vsc", "Virtual safety car")}


def _as_int(v: Any) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def build_markers(messages: list[Message]) -> dict[str, list[dict[str, Any]]]:
    """Lap starts and track-status periods on the recording's ``t`` axis.

    ``laps``: ``[{t, lap}]`` whenever ``LapCount.CurrentLap`` changes.
    ``periods``: ``[{start, end, status, label}]`` for yellow, safety car,
    VSC and red flag windows (``status`` is yellow|sc|vsc|red). A period
    still open at the end of the recording ends at the last message.
    """
    laps: list[dict[str, Any]] = []
    periods: list[dict[str, Any]] = []
    last_lap: int | None = None
    open_period: dict[str, Any] | None = None
    end_t = messages[-1].t if messages else 0.0
    for m in messages:
        data = m.data if isinstance(m.data, dict) else None
        if data is None:
            continue
        if m.topic == "LapCount" and "CurrentLap" in data:
            lap = _as_int(data.get("CurrentLap"))
            if lap is not None and lap != last_lap:
                laps.append({"t": round(m.t, 2), "lap": lap})
                last_lap = lap
        elif m.topic == "TrackStatus" and "Status" in data:
            group = _PERIOD_GROUPS.get(str(data.get("Status")))
            if open_period is not None and (group is None or group[0] != open_period["status"]):
                open_period["end"] = round(m.t, 2)
                periods.append(open_period)
                open_period = None
            if group is not None and open_period is None:
                open_period = {"start": round(m.t, 2), "end": None, "status": group[0], "label": group[1]}
    if open_period is not None:
        open_period["end"] = round(end_t, 2)
        periods.append(open_period)
    return {"laps": laps, "periods": periods}


class ReplaySource(Source):
    kind = "replay"

    def __init__(self, sink: MessageSink, messages: list[Message], *, name: str = "recording",
                 path: str | None = None, speed: float = 1.0, autoplay: bool = True,
                 start_at: float | None = None,
                 clock: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
                 read_stats: ReadStats | None = None) -> None:
        super().__init__(sink)
        self.messages = messages
        self._times = [m.t for m in messages]
        self.name = name
        self.path = path
        self.read_stats = read_stats
        self._clock = clock
        self._sleep = sleep
        self.speed = float(speed)
        self.paused = not autoplay
        self.ended = False
        self._idx = 0  # next message to apply
        self._anchor_pos = 0.0
        self._anchor_wall = clock()
        self._stopped = False
        self._wake = asyncio.Event()
        self.start_t = messages[0].t if messages else 0.0
        self.end_t = messages[-1].t if messages else 0.0
        self._start_at = start_at
        self.markers = build_markers(messages)

    # -- construction helpers ----------------------------------------------
    @classmethod
    def from_file(cls, sink: MessageSink, path: str | Path, **kw: Any) -> "ReplaySource":
        stats = ReadStats()
        msgs = read_messages(path, stats)
        if not msgs:
            raise ValueError(f"{path}: no readable messages ({stats.bad_lines} malformed lines)")
        return cls(sink, msgs, name=Path(path).name, path=str(path), read_stats=stats, **kw)

    # -- position ----------------------------------------------------------
    @property
    def position(self) -> float:
        if self.paused or self.ended:
            return self._anchor_pos
        pos = self._anchor_pos + (self._clock() - self._anchor_wall) * self.speed
        return min(pos, self.end_t)

    def _reanchor(self, pos: float | None = None) -> None:
        self._anchor_pos = self.position if pos is None else pos
        self._anchor_wall = self._clock()

    # -- controls ----------------------------------------------------------
    def play(self) -> None:
        if self.ended:
            self.seek(self.start_t)
        self._reanchor()
        self.paused = False
        self._kick()

    def pause(self) -> None:
        self._reanchor()
        self.paused = True
        self._kick()

    def set_speed(self, speed: float) -> None:
        if not (0 < speed <= 100):
            raise ValueError("speed must be in (0, 100]")
        self._reanchor()
        self.speed = float(speed)
        self._kick()

    def seek(self, t: float) -> None:
        """Jump to recording time ``t``; rebuilds state from the start."""
        t = max(self.start_t, min(float(t), self.end_t))
        target_idx = bisect.bisect_right(self._times, t)
        if target_idx >= self._idx and t >= self.position:
            # Forward seek: apply the gap without rebuilding.
            self._apply_range(self._idx, target_idx, t)
        else:
            self.sink.reset()
            self._apply_range(0, target_idx, t)
        # Either way clients get one fresh snapshot instead of a huge patch.
        self.sink.invalidate()
        self._idx = target_idx
        self.ended = False
        self._reanchor(t)
        self._kick()

    def _apply_range(self, lo: int, hi: int, target_t: float) -> None:
        heavy_from = target_t - _HEAVY_WINDOW_S
        for i in range(lo, hi):
            self._apply(i, heavy=self.messages[i].t >= heavy_from)

    def _apply(self, i: int, heavy: bool = True) -> None:
        m = self.messages[i]
        if m.snapshot and i > 0 and not self.messages[i - 1].snapshot:
            # A snapshot block after updates means the recorded feed reconnected:
            # start from that snapshot, exactly as the live client did.
            self.sink.reset()
        self.sink.apply_message(m, heavy=heavy)

    def _kick(self) -> None:
        self._wake.set()
        self._status_changed()

    # -- main loop ---------------------------------------------------------
    async def run(self) -> None:
        if not self.messages:
            self.ended = True
            self._status_changed()
            return
        if self._idx == 0:
            self.sink.reset()
            start = self.start_t if self._start_at is None else self._start_at
            self._anchor_pos = start
            self._anchor_wall = self._clock()
            if start > self.start_t:
                self.seek(start)
        self._status_changed()
        while not self._stopped:
            if self.paused or self.ended:
                self._wake.clear()
                await self._wake.wait()
                continue
            pos = self.position
            n = len(self.messages)
            while self._idx < n and self.messages[self._idx].t <= pos + _EPS:
                self._apply(self._idx)
                self._idx += 1
            if self._idx >= n:
                self._anchor_pos = self.end_t
                self.ended = True
                self._status_changed()
                continue
            wait = (self.messages[self._idx].t - pos) / self.speed
            self._wake.clear()
            try:
                await asyncio.wait_for(self._wait_or_sleep(min(max(wait, _MIN_STEP_S), _MAX_STEP_S)), timeout=1.0)
            except asyncio.TimeoutError:
                pass

    async def _wait_or_sleep(self, seconds: float) -> None:
        sleeper = asyncio.ensure_future(self._sleep(seconds))
        waker = asyncio.ensure_future(self._wake.wait())
        try:
            await asyncio.wait({sleeper, waker}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for f in (sleeper, waker):
                if not f.done():
                    f.cancel()

    async def stop(self) -> None:
        self._stopped = True
        self._wake.set()

    def status(self) -> dict[str, Any]:
        state = "ended" if self.ended else ("paused" if self.paused else "playing")
        out: dict[str, Any] = {
            "kind": self.kind, "state": state, "name": self.name, "path": self.path,
            "speed": self.speed, "position": round(self.position, 2),
            "start": self.start_t, "end": self.end_t, "messages": len(self.messages),
            "applied": self._idx, "speeds": list(SPEEDS), "markers": self.markers,
        }
        if self.read_stats and self.read_stats.bad_lines:
            out["bad_lines"] = self.read_stats.bad_lines
        return out
