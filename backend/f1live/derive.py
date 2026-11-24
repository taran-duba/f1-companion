"""Derived views computed from the raw topic state.

The raw feed only carries *current* values (latest lap, latest sample). The
dashboard also needs history: per-lap times, a circuit outline, rolling
telemetry and per-lap telemetry traces. These are accumulated here as
messages flow through :class:`f1live.state.StateStore`.
"""

from __future__ import annotations

import math
import re
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from .merge import as_list
from .messages import parse_iso

TELEMETRY_WINDOW_S = 120.0
TRACE_MAX_POINTS = 400
OUTLINE_MAX_POINTS = 600
# Timing lines on the map (start/finish, end of S1, end of S2): each crossing gives a sample,
# the marker is the median of the latest ones once there are enough.
MARKER_KEYS = ("finish", "s1", "s2")
MARKER_SAMPLES = 31
MARKER_MIN_SAMPLES = 3
MARKER_SNAP = 1000.0  # a marker further than 100 m from the outline isn't shown
POSITION_HISTORY = 60  # per car, about 15 s at the feed's ~4 Hz

_LAP_RE = re.compile(r"^(?:(\d+):)?(\d+(?:\.\d+)?)$")
_LAPPED_RE = re.compile(r"^\+?\s*(\d+)\s*L(?:AP)?S?$", re.IGNORECASE)


def parse_laptime(value: Any) -> int | None:
    """``"1:32.123"`` / ``"28.123"`` -> milliseconds."""
    if not isinstance(value, str):
        return None
    m = _LAP_RE.match(value.strip())
    if not m:
        return None
    minutes = int(m.group(1) or 0)
    return int(round((minutes * 60 + float(m.group(2))) * 1000))


def parse_gap(value: Any) -> dict[str, Any]:
    """Parse ``GapToLeader``/``Interval`` strings.

    Returns ``{"s": seconds | None, "laps": laps_down | 0, "leader": bool}``.
    """
    if isinstance(value, dict):
        value = value.get("Value")
    if not isinstance(value, str) or not value.strip():
        return {"s": None, "laps": 0, "leader": False}
    v = value.strip()
    if v.upper().startswith("LAP"):
        return {"s": 0.0, "laps": 0, "leader": True}
    m = _LAPPED_RE.match(v)
    if m:
        return {"s": None, "laps": int(m.group(1)), "leader": False}
    try:
        return {"s": float(v.lstrip("+")), "laps": 0, "leader": False}
    except ValueError:
        return {"s": None, "laps": 0, "leader": False}


def car_channels(channels: dict) -> dict[str, int]:
    def ch(key: str) -> int:
        v = channels.get(key, 0)
        return int(v) if isinstance(v, (int, float)) else 0

    return {
        "rpm": ch("0"),
        "speed": ch("2"),
        "gear": ch("3"),
        "throttle": max(0, min(100, ch("4"))),
        "brake": 100 if ch("5") > 0 else 0,
        "drs": ch("45"),
    }


def drs_open(drs: int) -> bool:
    return drs in (10, 12, 14)


def _downsample(points: list, max_points: int) -> list:
    if len(points) <= max_points:
        return points
    step = len(points) / max_points
    return [points[int(i * step)] for i in range(max_points)] + [points[-1]]


@dataclass
class _DriverTrack:
    """Per-driver accumulation state."""

    sectors: list[int | None] = field(default_factory=lambda: [None, None, None])
    laps_done: int = 0
    lap_had_pit: bool = False
    lap_pit_out: bool = False
    lap_start_utc: float | None = None
    dist: float = 0.0
    last_utc: float | None = None
    trace: list[list[float]] = field(default_factory=list)
    last_trace: dict | None = None
    best_trace: dict | None = None
    best_ms: int | None = None
    telemetry: deque = field(default_factory=lambda: deque())
    # Stint in use when the current lap started (a pit-in lap ends on new tyres).
    lap_stint: dict | None = None
    # True only if every sample of the current lap was recorded (not joined
    # mid-lap, no skipped samples during a replay fast-forward).
    trace_clean: bool = False


class Derived:
    """Accumulates history and exposes it as the ``Derived`` public topic."""

    def __init__(self) -> None:
        self.drivers: dict[str, _DriverTrack] = {}
        self.lap_history: dict[str, list[dict]] = {}
        self.outline: list[list[int]] = []
        self.outline_closed = False
        self._outline_car: str | None = None
        self._outline_path: list[tuple[float, float]] = []
        self._outline_len = 0.0
        self._outline_pending_points = 0
        self.telemetry_seen = False
        self.position_seen = False
        # Recent (utc, x, y) per car, to place timing events on the circuit.
        self._pos_hist: dict[str, deque] = {}
        self._marks: dict[str, list[tuple[float, float]]] = {k: [] for k in MARKER_KEYS}
        self.markers_changed = False

    # -- helpers -----------------------------------------------------------
    def _drv(self, num: str) -> _DriverTrack:
        d = self.drivers.get(num)
        if d is None:
            d = self.drivers[num] = _DriverTrack()
        return d

    def public(self) -> dict[str, Any]:
        return {
            "LapHistory": {k: list(v) for k, v in self.lap_history.items()},
            "TrackMap": self.track_map(),
        }

    def track_map(self) -> dict[str, Any]:
        pts = self.outline if self.outline_closed else [[int(x), int(y)] for x, y in self._outline_path]
        pts = _downsample(pts, OUTLINE_MAX_POINTS)
        if not pts:
            return {"points": [], "bounds": None, "closed": False}
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        return {"points": pts, "bounds": [min(xs), min(ys), max(xs), max(ys)], "closed": self.outline_closed,
                "markers": self._snapped_markers(pts)}

    # -- timing lines on the map -------------------------------------------
    def _where(self, num: str, utc: float | None) -> tuple[float, float] | None:
        """Where a car was at ``utc``, interpolated from its recent positions."""
        hist = self._pos_hist.get(num)
        if utc is None or not hist or utc < hist[0][0] or utc > hist[-1][0] + 1.0:
            return None
        prev = hist[0]
        for cur in hist:
            if cur[0] >= utc:
                span = cur[0] - prev[0]
                f = (utc - prev[0]) / span if span > 0 else 1.0
                return prev[1] + (cur[1] - prev[1]) * f, prev[2] + (cur[2] - prev[2]) * f
            prev = cur
        return hist[-1][1], hist[-1][2]

    def _mark_crossing(self, key: str, num: str, utc: float | None) -> None:
        at = self._where(num, utc)
        if at is None:
            return
        marks = self._marks[key]
        marks.append(at)
        del marks[:-MARKER_SAMPLES]
        # Re-publish while the estimate settles, then every tenth crossing.
        if len(marks) <= 10 or len(marks) % 10 == 0:
            self.markers_changed = True

    def _snapped_markers(self, pts: list) -> dict[str, int]:
        """Each timing line as an index into ``pts`` (the published outline)."""
        out: dict[str, int] = {}
        for key, marks in self._marks.items():
            if len(marks) < MARKER_MIN_SAMPLES or not pts:
                continue
            mx = sorted(m[0] for m in marks)[len(marks) // 2]
            my = sorted(m[1] for m in marks)[len(marks) // 2]
            best, best_d = None, MARKER_SNAP
            for i, (px, py) in enumerate(pts):
                dd = math.hypot(px - mx, py - my)
                if dd < best_d:
                    best, best_d = i, dd
            if best is not None:
                out[key] = best
        return out

    # -- timing ------------------------------------------------------------
    def on_timing(self, update: dict, state: dict, utc: float | None) -> dict | None:
        """Process a TimingData update. Returns a ``Derived`` delta or None."""
        lines = update.get("Lines") if isinstance(update, dict) else None
        if not isinstance(lines, dict):
            return None
        full_lines = (state.get("TimingData") or {}).get("Lines") or {}
        app_lines = (state.get("TimingAppData") or {}).get("Lines") or {}
        delta: dict[str, dict] = {}
        for num, upd in lines.items():
            if not isinstance(upd, dict):
                continue
            d = self._drv(num)
            line = full_lines.get(num) or {}
            if upd.get("InPit") is True:
                d.lap_had_pit = True
            if upd.get("PitOut") is True:
                d.lap_pit_out = True
            sectors = upd.get("Sectors")
            if isinstance(sectors, (dict, list)):
                items = sectors.items() if isinstance(sectors, dict) else enumerate(sectors)
                for idx, sec in items:
                    try:
                        i = int(idx)
                    except (TypeError, ValueError):
                        continue
                    if not 0 <= i <= 2 or not isinstance(sec, dict):
                        continue
                    ms = parse_laptime(sec.get("Value"))
                    if ms is None:
                        continue
                    hist = self.lap_history.get(num) or []
                    if i == 2 and d.sectors[0] is None and hist and hist[-1].get("s3") is None:
                        # Late S3 for the lap we already closed.
                        hist[-1]["s3"] = ms
                        delta.setdefault(num, {})[str(len(hist) - 1)] = {"s3": ms}
                    else:
                        # A new S1 or S2 time: the car just crossed that timing line (not in
                        # the pit lane, which has its own lines).
                        pitting = d.lap_had_pit or d.lap_pit_out or line.get("InPit") or line.get("PitOut")
                        if i < 2 and d.sectors[i] != ms and not pitting:
                            self._mark_crossing(f"s{i + 1}", num, utc)
                        d.sectors[i] = ms
            n_laps = upd.get("NumberOfLaps")
            if isinstance(n_laps, int) and n_laps > d.laps_done:
                if d.laps_done == 0 and n_laps > 1 and not self.lap_history.get(num):
                    # Joined mid-session: don't invent history for missed laps.
                    d.laps_done = n_laps
                    d.sectors = [None, None, None]
                    continue
                d.laps_done = n_laps
                # Crossed the line on track (a pit-in lap ends at the pit lane's line).
                if not d.lap_had_pit and not line.get("InPit"):
                    self._mark_crossing("finish", num, utc)
                lap = self._close_lap(num, d, line, app_lines.get(num) or {}, n_laps, utc)
                hist = self.lap_history.setdefault(num, [])
                hist.append(lap)
                delta.setdefault(num, {})[str(len(hist) - 1)] = lap
        return {"LapHistory": delta} if delta else None

    def _close_lap(self, num: str, d: _DriverTrack, line: dict, app: dict, lap_no: int,
                   utc: float | None) -> dict:
        last = line.get("LastLapTime") or {}
        lap_ms = parse_laptime(last.get("Value"))
        stints = as_list(app.get("Stints"))
        current = stints[-1] if stints else {}
        stint = d.lap_stint if (d.lap_had_pit and d.lap_stint) else current
        gap = parse_gap(line.get("GapToLeader"))
        interval = parse_gap(line.get("IntervalToPositionAhead"))
        pos = line.get("Position")
        lap = {
            "lap": lap_no,
            "ms": lap_ms,
            "time": last.get("Value") or None,
            "s1": d.sectors[0],
            "s2": d.sectors[1],
            "s3": d.sectors[2],
            "pos": int(pos) if isinstance(pos, str) and pos.isdigit() else None,
            "gap": gap["s"],
            "lapsDown": gap["laps"],
            "interval": interval["s"],
            "compound": stint.get("Compound") if isinstance(stint, dict) else None,
            "tyreAge": _tyre_age(stint),
            "pitIn": d.lap_had_pit,
            "pitOut": d.lap_pit_out,
            "personalBest": bool(last.get("PersonalFastest")),
            "overallBest": bool(last.get("OverallFastest")),
        }
        # Lap telemetry trace bookkeeping
        if d.trace and d.trace_clean:
            trace = {"lap": lap_no, "ms": lap_ms, "points": _downsample(d.trace, TRACE_MAX_POINTS)}
            if not (d.lap_had_pit or d.lap_pit_out):
                d.last_trace = trace
                if lap_ms and (d.best_ms is None or lap_ms < d.best_ms):
                    d.best_ms = lap_ms
                    d.best_trace = trace
        d.trace = []
        d.trace_clean = True
        d.lap_stint = dict(current) if isinstance(current, dict) else None
        d.dist = 0.0
        d.sectors = [None, None, None]
        d.lap_had_pit = False
        d.lap_pit_out = False
        d.lap_start_utc = utc
        return lap

    # -- telemetry ---------------------------------------------------------
    def on_car_data(self, decoded: dict, keep_samples: bool = True) -> dict | None:
        """Process decoded CarData. Returns the latest-sample public value."""
        entries = decoded.get("Entries") if isinstance(decoded, dict) else None
        if not isinstance(entries, list) or not entries:
            return None
        latest: dict[str, dict] = {}
        latest_utc = None
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            cars = entry.get("Cars")
            if not isinstance(cars, dict):
                continue
            utc_s = entry.get("Utc")
            dt = parse_iso(utc_s) if isinstance(utc_s, str) else None
            ts = dt.timestamp() if dt else None
            latest_utc = utc_s or latest_utc
            for num, car in cars.items():
                chans = car.get("Channels") if isinstance(car, dict) else None
                if not isinstance(chans, dict):
                    continue
                vals = car_channels(chans)
                latest[num] = vals
                if not keep_samples:
                    self._drv(num).trace_clean = False
                if keep_samples and ts is not None:
                    self._sample(num, ts, vals)
        if not latest:
            return None
        self.telemetry_seen = True
        return {"Utc": latest_utc, "Cars": latest}

    def _sample(self, num: str, ts: float, vals: dict[str, int]) -> None:
        d = self._drv(num)
        if d.last_utc is not None and ts > d.last_utc:
            dt = min(ts - d.last_utc, 2.0)
            d.dist += vals["speed"] / 3.6 * dt
        d.last_utc = ts
        tel = d.telemetry
        tel.append((ts, vals["speed"], vals["throttle"], vals["brake"], vals["gear"], vals["rpm"], vals["drs"]))
        while tel and ts - tel[0][0] > TELEMETRY_WINDOW_S:
            tel.popleft()
        d.trace.append([round(d.dist, 1), vals["speed"], vals["throttle"], vals["brake"], vals["gear"], vals["rpm"]])

    def telemetry(self, num: str, window: float = 60.0) -> dict[str, Any]:
        d = self.drivers.get(num)
        if not d or not d.telemetry:
            return {"t": [], "speed": [], "throttle": [], "brake": [], "gear": [], "rpm": [], "drs": []}
        end = d.telemetry[-1][0]
        rows = [r for r in d.telemetry if end - r[0] <= window]
        cols = list(zip(*rows))
        return {
            "t": [round(x - end, 2) for x in cols[0]],
            "speed": list(cols[1]), "throttle": list(cols[2]), "brake": list(cols[3]),
            "gear": list(cols[4]), "rpm": list(cols[5]), "drs": list(cols[6]),
        }

    def traces(self, num: str) -> dict[str, Any]:
        d = self.drivers.get(num)
        cols = ["dist", "speed", "throttle", "brake", "gear", "rpm"]
        return {"columns": cols, "last": d.last_trace if d else None, "best": d.best_trace if d else None}

    # -- positions ---------------------------------------------------------
    def on_position(self, decoded: dict, timing_lines: dict) -> tuple[dict | None, bool]:
        """Process decoded Position. Returns (latest public value, outline_changed)."""
        items = decoded.get("Position") if isinstance(decoded, dict) else None
        if not isinstance(items, list) or not items:
            return None, False
        latest: dict[str, dict] = {}
        latest_ts = None
        changed = False
        for item in items:
            if not isinstance(item, dict):
                continue
            entries = item.get("Entries")
            if not isinstance(entries, dict):
                continue
            latest_ts = item.get("Timestamp") or latest_ts
            ts_dt = parse_iso(item["Timestamp"]) if isinstance(item.get("Timestamp"), str) else None
            ts = ts_dt.timestamp() if ts_dt else None
            for num, e in entries.items():
                if not isinstance(e, dict):
                    continue
                x, y = e.get("X"), e.get("Y")
                if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                    continue
                latest[num] = {"X": x, "Y": y, "Z": e.get("Z", 0), "Status": e.get("Status", "")}
                if ts is not None and not (x == 0 and y == 0):
                    hist = self._pos_hist.setdefault(num, deque(maxlen=POSITION_HISTORY))
                    if hist and ts < hist[-1][0]:
                        hist.clear()  # time went backwards: a seek
                    hist.append((ts, float(x), float(y)))
                if not self.outline_closed:
                    changed |= self._trace_outline(num, float(x), float(y), timing_lines.get(num) or {}, e)
        if not latest:
            return None, changed
        self.position_seen = True
        return {"Timestamp": latest_ts, "Entries": latest}, changed

    def _trace_outline(self, num: str, x: float, y: float, line: dict, entry: dict) -> bool:
        """Trace the circuit from one car's path until it closes a loop."""
        on_track = entry.get("Status", "OnTrack") == "OnTrack"
        in_pit = bool(line.get("InPit") or line.get("PitOut") or line.get("Retired") or line.get("Stopped"))
        if self._outline_car is None:
            if not on_track or in_pit or (x == 0 and y == 0):
                return False
            self._outline_car = num
        if num != self._outline_car:
            return False
        if in_pit or not on_track:
            # Pit lane or off track would distort the outline: start over.
            self._outline_car = None
            self._outline_path = []
            self._outline_len = 0.0
            return False
        path = self._outline_path
        if path:
            px, py = path[-1]
            step = math.hypot(x - px, y - py)
            if step < 30:  # < 3 m: stationary or duplicate sample
                return False
            if step > 3000:  # > 300 m jump: data gap, restart
                self._outline_path = [(x, y)]
                self._outline_len = 0.0
                return False
            self._outline_len += step
            sx, sy = path[0]
            if self._outline_len > 15000 and math.hypot(x - sx, y - sy) < max(300.0, step * 1.5):
                self.outline = [[int(px_), int(py_)] for px_, py_ in path]
                self.outline_closed = True
                return True
        path.append((x, y))
        self._outline_pending_points += 1
        if self._outline_pending_points >= 20:
            self._outline_pending_points = 0
            return True
        return False


def _tyre_age(stint: Any) -> int | None:
    if not isinstance(stint, dict):
        return None
    total = stint.get("TotalLaps")
    return int(total) if isinstance(total, (int, float)) else None
