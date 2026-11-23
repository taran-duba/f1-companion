"""FastF1 ``session.laps`` -> TimingData / TimingAppData / LapCount updates.

FastF1 gives one row per completed lap. The live feed instead streams small
patches: a sector value as each sector completes, the lap time at the line,
position/gap changes, pit flags and new tyre stints. This module rebuilds
those patches from the lap rows and adds them to a :class:`Timeline`.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from .fastf1_common import (
    Timeline, col, fmt_gap, fmt_lap, fmt_sector, num_key, seconds, to_bool, to_float, to_int, to_str,
)

TD = "TimingData"
APP = "TimingAppData"
SPEED_COLS = {"I1": "SpeedI1", "I2": "SpeedI2", "FL": "SpeedFL", "ST": "SpeedST"}

# Tie-break priorities for events sharing a timestamp (lower goes first).
P_CLEAR, P_SECTOR, P_LAP, P_RANK, P_PIT = 0, 1, 2, 3, 4


@dataclass
class DriverInfo:
    num: str
    order: int                 # 1-based line on the starting grid / list
    tla: str | None = None
    grid: int | None = None
    status: str | None = None  # classification status from results


@dataclass
class LapRow:
    lap: int
    start: float | None
    end: float | None
    lap_time: float | None
    sec: list[float | None]
    sec_st: list[float | None]
    pit_in: float | None
    pit_out: float | None
    compound: str | None
    tyre_life: float | None
    stint: float | None
    fresh: bool | None
    deleted: bool
    speeds: dict[str, int | None] = field(default_factory=dict)


@dataclass
class Stint:
    first_row: int
    compound: str
    new: bool
    start_laps: int
    start_st: float | None

    def as_feed(self) -> dict[str, Any]:
        return {"LapFlags": 0, "Compound": self.compound, "New": "true" if self.new else "false",
                "TyresNotChanged": "0", "TotalLaps": self.start_laps, "StartLaps": self.start_laps}


def _lines(num: str, upd: dict) -> dict:
    return {"Lines": {num: upd}}


# ------------------------------------------------------------------ parsing

def parse_laps(df: pd.DataFrame, abbr_to_num: dict[str, str]) -> dict[str, list[LapRow]]:
    """Group lap rows per racing number, sorted by lap; bad rows are skipped."""
    c = {name: col(df, name) for name in (
        "DriverNumber", "Driver", "LapNumber", "LapStartTime", "Time", "LapTime",
        "Sector1Time", "Sector2Time", "Sector3Time",
        "Sector1SessionTime", "Sector2SessionTime", "Sector3SessionTime",
        "PitInTime", "PitOutTime", "Compound", "TyreLife", "Stint", "FreshTyre", "Deleted",
        *SPEED_COLS.values())}
    out: dict[str, list[tuple[float, float, LapRow]]] = {}
    for i in range(len(df)):
        num = num_key(c["DriverNumber"][i]) or abbr_to_num.get(to_str(c["Driver"][i]) or "")
        if not num:
            continue
        start, end = seconds(c["LapStartTime"][i]), seconds(c["Time"][i])
        sec = [seconds(c[f"Sector{k}Time"][i]) for k in (1, 2, 3)]
        sec_st = [seconds(c[f"Sector{k}SessionTime"][i]) for k in (1, 2, 3)]
        if sec_st[0] is None and start is not None and sec[0] is not None:
            sec_st[0] = start + sec[0]
        if sec_st[1] is None and sec_st[0] is not None and sec[1] is not None:
            sec_st[1] = sec_st[0] + sec[1]
        if sec_st[2] is None:
            sec_st[2] = end
        if end is None and all(s is None for s in sec_st):
            continue  # nothing we could place on the timeline
        compound = to_str(c["Compound"][i])
        row = LapRow(
            lap=to_int(c["LapNumber"][i]) or 0, start=start, end=end, lap_time=seconds(c["LapTime"][i]),
            sec=sec, sec_st=sec_st, pit_in=seconds(c["PitInTime"][i]), pit_out=seconds(c["PitOutTime"][i]),
            compound=compound.upper() if compound else None, tyre_life=to_float(c["TyreLife"][i]),
            stint=to_float(c["Stint"][i]), fresh=to_bool(c["FreshTyre"][i]),
            deleted=bool(to_bool(c["Deleted"][i])),
            speeds={k: to_int(c[v][i]) for k, v in SPEED_COLS.items()},
        )
        key_lap = row.lap if row.lap > 0 else math.inf
        key_end = end if end is not None else math.inf
        out.setdefault(num, []).append((key_lap, key_end, row))
    result: dict[str, list[LapRow]] = {}
    for num, items in out.items():
        items.sort(key=lambda x: (x[0], x[1]))
        rows = [r for _, _, r in items]
        for n, r in enumerate(rows, 1):  # fill missing lap numbers
            if r.lap <= 0:
                r.lap = (rows[n - 2].lap + 1) if n > 1 else 1
        result[num] = rows
    return result


def build_stints(rows: list[LapRow]) -> tuple[list[Stint], list[int]]:
    """Split a driver's laps into tyre stints; returns (stints, stint index per row)."""
    stints: list[Stint] = []
    idx_of: list[int] = []
    prev_val: float | None = None
    for i, r in enumerate(rows):
        if i == 0:
            new = True
        elif r.stint is not None and prev_val is not None:
            new = r.stint != prev_val
        else:
            new = r.pit_out is not None
        if r.stint is not None:
            prev_val = r.stint
        if new:
            st = r.pit_out if r.pit_out is not None else r.start
            if st is None and i > 0:
                st = rows[i - 1].end
            if i > 0 and st is None:
                new = False  # cannot place the stint change; keep the old stint
        if new:
            start_laps = max(0, int(r.tyre_life) - 1) if r.tyre_life is not None else 0
            fresh = r.fresh if r.fresh is not None else start_laps == 0
            stints.append(Stint(i, r.compound or "", fresh, start_laps, st))
        idx_of.append(len(stints) - 1)
    for k, s in enumerate(stints):  # first known compound within the stint
        if not s.compound:
            s.compound = next((rows[i].compound for i, j in enumerate(idx_of) if j == k and rows[i].compound),
                              "UNKNOWN")
    return stints, idx_of


def _finished(status: str | None) -> bool:
    s = (status or "").strip().lower()
    return not s or s == "finished" or s.startswith("+") or s == "lapped"


# ---------------------------------------------------------------- snapshot

def _empty_line(d: DriverInfo) -> dict[str, Any]:
    flags = {"Status": 0, "OverallFastest": False, "PersonalFastest": False}
    return {
        "RacingNumber": d.num, "Line": d.order, "Position": str(d.order), "ShowPosition": True,
        "GapToLeader": "", "IntervalToPositionAhead": {"Value": "", "Catching": False},
        "Retired": False, "InPit": False, "PitOut": False, "Stopped": False, "Status": 0,
        "NumberOfLaps": 0, "NumberOfPitStops": 0,
        "Sectors": [{"Stopped": False, "Value": "", **flags, "Segments": []} for _ in range(3)],
        "Speeds": {k: {"Value": "", **flags} for k in SPEED_COLS},
        "BestLapTime": {"Value": ""},
        "LastLapTime": {"Value": "", **flags},
    }


# ------------------------------------------------------------------- build

class _Ranker:
    """Running classification, gaps and personal/overall bests."""

    def __init__(self, drivers: list[DriverInfo], race_like: bool, total_laps: int | None, tl: Timeline):
        self.drivers = drivers
        self.order = {d.num: d.order for d in drivers}
        self.race_like = race_like
        self.total = total_laps
        self.tl = tl
        self.laps = {d.num: 0 for d in drivers}
        self.cross: dict[str, dict[int, float]] = {d.num: {} for d in drivers}
        self.last_cross: dict[str, float] = {}
        self.retired: set[str] = set()
        self.best_lap: dict[str, float] = {}
        self.best_lap_at: dict[str, float] = {}
        self.best_sec: dict[str, list[float | None]] = {d.num: [None] * 3 for d in drivers}
        self.overall_sec: list[float | None] = [None] * 3
        self.overall_lap: float | None = None
        self.prev: dict[str, tuple] = {d.num: (d.order, "", "", False) for d in drivers}
        self.prev_iv_sec: dict[str, float | None] = {}
        self.lap_count = 1

    # -- events
    def sector(self, st: float, num: str, i: int, val: float, row: LapRow) -> None:
        best = self.best_sec[num][i]
        pf = best is None or val < best
        of = pf and (self.overall_sec[i] is None or val < self.overall_sec[i])
        if pf:
            self.best_sec[num][i] = val
        if of:
            self.overall_sec[i] = val
        upd: dict[str, Any] = {"Sectors": {str(i): {"Value": fmt_sector(val), "Status": 0,
                                                    "PersonalFastest": pf, "OverallFastest": of}}}
        spd = {0: "I1", 1: "I2"}.get(i)
        if spd and row.speeds.get(spd) is not None:
            upd["Speeds"] = {spd: {"Value": str(row.speeds[spd])}}
        self.tl.add(st, TD, _lines(num, upd), P_SECTOR)

    def lap(self, st: float, num: str, row: LapRow) -> None:
        self.laps[num] = max(self.laps.get(num, 0), row.lap)
        self.cross.setdefault(num, {})[row.lap] = st
        self.last_cross[num] = st
        lt = None if row.deleted else row.lap_time
        pf = lt is not None and (num not in self.best_lap or lt < self.best_lap[num])
        of = pf and (self.overall_lap is None or lt < self.overall_lap)
        upd: dict[str, Any] = {"NumberOfLaps": row.lap, "LastLapTime": {
            "Value": fmt_lap(row.lap_time), "Status": 0, "PersonalFastest": pf, "OverallFastest": of}}
        if pf:
            self.best_lap[num] = lt  # type: ignore[assignment]
            self.best_lap_at[num] = st
            upd["BestLapTime"] = {"Value": fmt_lap(lt), "Lap": row.lap}
        if of:
            self.overall_lap = lt
        speeds = {k: {"Value": str(row.speeds[k])} for k in ("FL", "ST") if row.speeds.get(k) is not None}
        if speeds:
            upd["Speeds"] = speeds
        self.tl.add(st, TD, _lines(num, upd), P_LAP)
        self.rank(st)

    def retire(self, st: float, num: str) -> None:
        self.retired.add(num)
        self.tl.add(st, TD, _lines(num, {"Retired": True}), P_LAP)
        self.rank(st)

    # -- classification
    def _race_gap(self, d: str, r: str) -> tuple[str, float | None]:
        nd = self.laps.get(d, 0)
        td = self.cross.get(d, {}).get(nd)
        if nd == 0 or td is None:
            return "", None
        k = sum(1 for lap, t in self.cross.get(r, {}).items() if lap > nd and t <= td)
        if k >= 1:
            return f"{k}L", None
        tr = self.cross.get(r, {}).get(nd)
        if tr is None:
            return "", None
        gap = max(0.0, td - tr)
        return fmt_gap(gap), gap

    def _best_gap(self, d: str, r: str) -> tuple[str, float | None]:
        bd, br = self.best_lap.get(d), self.best_lap.get(r)
        if bd is None or br is None:
            return "", None
        gap = max(0.0, bd - br)
        return fmt_gap(gap), gap

    def _ordered(self) -> list[str]:
        nums = [d.num for d in self.drivers]
        if self.race_like:
            return sorted(nums, key=lambda n: (n in self.retired, -self.laps.get(n, 0),
                                               self.last_cross.get(n, math.inf), self.order[n]))
        return sorted(nums, key=lambda n: (self.best_lap.get(n, math.inf),
                                           self.best_lap_at.get(n, math.inf), self.order[n]))

    def rank(self, st: float) -> None:
        ordered = self._ordered()
        if not ordered:
            return
        leader = ordered[0]
        gap_fn = self._race_gap if self.race_like else self._best_gap
        lines: dict[str, dict] = {}
        dl: dict[str, dict] = {}
        for pos, num in enumerate(ordered, 1):
            if pos == 1:
                if self.race_like and self.laps.get(num, 0) > 0:
                    cur = self.laps[num] + 1
                    if self.total:
                        cur = min(cur, self.total)
                    gap = iv = f"LAP {cur}"
                else:
                    gap = iv = ""
                iv_sec = None
            else:
                gap, _ = gap_fn(num, leader)
                iv, iv_sec = gap_fn(num, ordered[pos - 2])
            old = self.prev[num]
            if iv == old[2]:
                catching = old[3]
            else:
                prev_sec = self.prev_iv_sec.get(num)
                catching = iv_sec is not None and prev_sec is not None and iv_sec < prev_sec
            new = (pos, gap, iv, catching)
            if new != old:
                upd: dict[str, Any] = {}
                if pos != old[0]:
                    upd["Position"] = str(pos)
                    upd["Line"] = pos
                    dl[num] = {"Line": pos}
                if gap != old[1]:
                    upd["GapToLeader"] = gap
                if iv != old[2] or catching != old[3]:
                    upd["IntervalToPositionAhead"] = {"Value": iv, "Catching": catching}
                lines[num] = upd
                self.prev[num] = new
            if iv_sec is not None:
                self.prev_iv_sec[num] = iv_sec
        if lines:
            self.tl.add(st, TD, {"Lines": lines}, P_RANK)
        if dl:
            self.tl.add(st, "DriverList", dl, P_RANK)
        if self.race_like:
            cur = max(self.laps.values(), default=0) + 1
            if self.total:
                cur = min(cur, self.total)
            if cur > self.lap_count:
                self.lap_count = cur
                self.tl.add(st, "LapCount", {"CurrentLap": cur}, P_RANK)


def build_timing(laps_df: pd.DataFrame, drivers: list[DriverInfo], *, race_like: bool,
                 total_laps: int | None, start_st: float, tl: Timeline) -> tuple[dict, dict]:
    """Add all timing updates to ``tl``; return (TimingData, TimingAppData) snapshot Lines."""
    abbr = {d.tla: d.num for d in drivers if d.tla}
    by_driver = parse_laps(laps_df, abbr)
    known = {d.num for d in drivers}
    for num in by_driver:  # laps for a driver missing from results
        if num not in known:
            drivers.append(DriverInfo(num=num, order=len(drivers) + 1))
            known.add(num)

    td_lines = {d.num: _empty_line(d) for d in drivers}
    app_lines: dict[str, dict] = {}
    ranker = _Ranker(drivers, race_like, total_laps, tl)
    walk: list[tuple[float, int, int, str, tuple]] = []

    def push(st: float, prio: int, kind: str, payload: tuple) -> None:
        walk.append((st, prio, len(walk), kind, payload))

    for d in drivers:
        rows = by_driver.get(d.num, [])
        app: dict[str, Any] = {"RacingNumber": d.num, "Line": d.order, "Stints": []}
        if d.grid is not None:
            app["GridPos"] = str(d.grid)
        app_lines[d.num] = app
        if not rows:
            if race_like and not _finished(d.status):
                push(start_st + 1.0, P_LAP, "retire", (d.num,))
            continue

        stints, idx_of = build_stints(rows)
        app["Stints"] = [stints[0].as_feed()]
        for k, s in enumerate(stints[1:], 1):
            tl.add(s.start_st, APP, _lines(d.num, {"Stints": {str(k): s.as_feed()}}), P_PIT)  # type: ignore[arg-type]

        stops = 0
        for i, r in enumerate(rows):
            for k in range(3):
                if r.sec_st[k] is not None and r.sec[k] is not None:
                    push(r.sec_st[k], P_SECTOR, "sector", (d.num, k, r.sec[k], r))  # type: ignore[arg-type]
            if r.end is not None:
                push(r.end, P_LAP, "lap", (d.num, r))
                s = stints[idx_of[i]]
                done = i - s.first_row + 1
                tl.add(r.end, APP, _lines(d.num, {"Stints": {str(idx_of[i]): {"TotalLaps": s.start_laps + done}}}),
                       P_LAP)
                if i + 1 < len(rows):
                    clear_st = r.end + 1.0
                    nxt = rows[i + 1].sec_st[0]
                    if nxt is not None and nxt <= clear_st:
                        clear_st = (r.end + nxt) / 2
                    tl.add(clear_st, TD, _lines(d.num, {"Sectors": {str(k): {"Value": ""} for k in range(3)}}),
                           P_CLEAR)
            if r.pit_in is not None:
                upd: dict[str, Any] = {"InPit": True}
                if i + 1 < len(rows):
                    stops += 1
                    upd["NumberOfPitStops"] = stops
                tl.add(r.pit_in, TD, _lines(d.num, upd), P_PIT)
            if r.pit_out is not None:
                tl.add(r.pit_out, TD, _lines(d.num, {"InPit": False, "PitOut": True}), P_PIT)
                s1 = r.sec_st[0]
                off = s1 if s1 is not None and s1 > r.pit_out else r.pit_out + 5.0
                tl.add(off, TD, _lines(d.num, {"PitOut": False}), P_CLEAR)

        ran_full = bool(total_laps) and max(r.lap for r in rows) >= total_laps  # e.g. post-race DSQ
        if race_like and not _finished(d.status) and not ran_full:
            last_end = max((r.end for r in rows if r.end is not None), default=None)
            lap_times = [r.lap_time for r in rows if r.lap_time]
            half = statistics.median(lap_times) / 2 if lap_times else 45.0
            push((last_end + half) if last_end is not None else start_st + 1.0, P_LAP, "retire", (d.num,))

    for st, _prio, _seq, kind, payload in sorted(walk, key=lambda w: w[:3]):
        if kind == "sector":
            ranker.sector(st, *payload)
        elif kind == "lap":
            ranker.lap(st, *payload)
        else:
            ranker.retire(st, *payload)
    return td_lines, app_lines
