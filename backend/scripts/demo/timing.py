"""Timing-loop logic: segment colours, sector/lap times and gaps.

Gaps are computed the way the real timing system does: every timing point
(segment boundary) a car crosses is time-stamped, and the gap to another car
is the difference between their crossing times of the same point.
"""

from __future__ import annotations

from .feed import Feed, fmt_gap, fmt_lap, fmt_sector

INF = float("inf")
SEG_YELLOW, SEG_GREEN, SEG_PURPLE, SEG_PIT = 2048, 2049, 2051, 2064


class Timing:
    def __init__(self, track, feed: Feed, cars: list, total_laps: int) -> None:
        self.track = track
        self.feed = feed
        self.total = total_laps
        self.ntp = track.ntp
        self.cross: dict[str, dict[int, float]] = {c.num: {} for c in cars}
        self.last_g: dict[str, int] = {c.num: -1 for c in cars}
        self.seg_start: dict[str, float] = {}
        self.sector_start: dict[str, float] = {}
        self.lap_start: dict[str, float] = {}
        self.pb_seg: dict[str, list[float]] = {c.num: [INF] * self.ntp for c in cars}
        self.best_seg = [INF] * self.ntp
        self.pb_sector: dict[str, list[float]] = {c.num: [INF] * 3 for c in cars}
        self.best_sector = [INF] * 3
        self.best_sector_holder: list[tuple[str, int] | None] = [None] * 3
        self.sector_lap: dict[str, list[int]] = {c.num: [-1] * 3 for c in cars}
        self.pb_lap: dict[str, float] = {c.num: INF for c in cars}
        self.best_lap = INF
        self.best_lap_holder: tuple[str, int] | None = None
        self.last_lap_no: dict[str, int] = {c.num: 0 for c in cars}
        self.last_lap_time: dict[str, float] = {c.num: 0.0 for c in cars}
        self.shown_gap: dict[str, tuple[str, str]] = {}
        self.interval_val: dict[str, float] = {}

    def start(self, t: float, cars: list) -> None:
        for c in cars:
            self.seg_start[c.num] = self.sector_start[c.num] = self.lap_start[c.num] = t

    # -- timing points --------------------------------------------------
    def on_tp(self, car, g: int, tc: float, in_pit: bool, slow: bool) -> float | None:
        """Process ``car`` crossing global timing point ``g`` at time ``tc``.

        Returns the lap time when the point is the finish line, else None.
        """
        num = car.num
        i = g % self.ntp
        lap = g // self.ntp
        self.cross[num][g] = tc
        self.last_g[num] = g
        seg_time = tc - self.seg_start[num]
        self.seg_start[num] = tc
        si = self.track.tp_sector[i]
        sk = self.track.tp_seg[i]
        if in_pit:
            status = SEG_PIT
        elif lap == 0 and i < 2:
            status = SEG_YELLOW if slow else SEG_GREEN
        else:
            status = SEG_YELLOW
            if not slow and seg_time < self.pb_seg[num][i]:
                self.pb_seg[num][i] = seg_time
                status = SEG_GREEN
                if seg_time < self.best_seg[i]:
                    self.best_seg[i] = seg_time
                    status = SEG_PURPLE
        sectors: dict = {}
        if i == 0 and lap > 0:
            # New lap: blank the previous lap's sectors and segments.
            for k in range(3):
                sectors[str(k)] = {
                    "Value": "", "PersonalFastest": False, "OverallFastest": False,
                    "Segments": {str(j): {"Status": 0} for j in range(self.track.seg_counts[k])},
                }
        sectors.setdefault(str(si), {}).setdefault("Segments", {})[str(sk)] = {"Status": status}
        patch: dict = {"Sectors": sectors}
        lap_time = None
        if sk == self.track.seg_counts[si] - 1:
            sec_time = tc - self.sector_start[num]
            self.sector_start[num] = tc
            pf = of = False
            if not in_pit and sec_time < self.pb_sector[num][si]:
                self.pb_sector[num][si] = sec_time
                pf = True
                if sec_time < self.best_sector[si]:
                    self.best_sector[si] = sec_time
                    of = True
                    prev = self.best_sector_holder[si]
                    if prev and prev[0] != num and self.sector_lap[prev[0]][si] == prev[1]:
                        self.feed.line("TimingData", prev[0], {"Sectors": {str(si): {"OverallFastest": False}}})
                    self.best_sector_holder[si] = (num, lap)
            self.sector_lap[num][si] = lap
            sectors[str(si)].update({"Value": fmt_sector(sec_time), "Status": 0,
                                     "PersonalFastest": pf, "OverallFastest": of, "Stopped": False})
        if i == self.ntp - 1:
            lap_time = tc - self.lap_start[num]
            self.lap_start[num] = tc
            lap_no = lap + 1
            pf = of = False
            if lap_time < self.pb_lap[num]:
                self.pb_lap[num] = lap_time
                pf = True
                patch["BestLapTime"] = {"Value": fmt_lap(lap_time), "Lap": lap_no}
                if lap_time < self.best_lap:
                    self.best_lap = lap_time
                    of = True
                    prev = self.best_lap_holder
                    if prev and prev[0] != num and self.last_lap_no[prev[0]] == prev[1]:
                        self.feed.line("TimingData", prev[0], {"LastLapTime": {"OverallFastest": False}})
                    self.best_lap_holder = (num, lap_no)
            self.last_lap_no[num] = lap_no
            self.last_lap_time[num] = lap_time
            patch["LastLapTime"] = {"Value": fmt_lap(lap_time), "Status": 0,
                                    "OverallFastest": of, "PersonalFastest": pf}
            patch["NumberOfLaps"] = lap_no
        self.feed.line("TimingData", num, patch)
        return lap_time

    # -- gaps -------------------------------------------------------------
    def _diff(self, num: str, other: str, g: int, tc: float) -> str | None:
        og = self.last_g[other]
        if og < g:
            return None
        if og - g >= self.ntp:
            return f"{(og - g) // self.ntp}L"
        return fmt_gap(tc - self.cross[other][g])

    def update_gaps(self, car, order: list, laps_label: int) -> None:
        """Recompute GapToLeader / Interval for ``car`` from its latest timing point."""
        num = car.num
        g = self.last_g[num]
        pos = next(i for i, c in enumerate(order) if c is car)
        if pos == 0:
            gap = interval = f"LAP {laps_label}"
            catching = True
        else:
            if g < 0:
                return
            tc = self.cross[num][g]
            gap = self._diff(num, order[0].num, g, tc)
            interval = self._diff(num, order[pos - 1].num, g, tc)
            if gap is None or interval is None:
                return
            catching = False
            if not interval.endswith("L"):
                val = float(interval)
                catching = val < self.interval_val.get(num, INF)
                self.interval_val[num] = val
        if self.shown_gap.get(num) == (gap, interval):
            return
        self.shown_gap[num] = (gap, interval)
        self.feed.line("TimingData", num, {"GapToLeader": gap,
                                           "IntervalToPositionAhead": {"Value": interval, "Catching": catching}})

    def speed(self, car, trap: str, kph: float) -> None:
        self.feed.line("TimingData", car.num, {"Speeds": {trap: {"Value": str(int(round(kph)))}}})
