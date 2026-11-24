"""Timing lines on the map: estimated from where cars were when they crossed them."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from f1live.derive import Derived

T0 = datetime(2026, 6, 14, 13, 0, tzinfo=timezone.utc)
R = 5000.0  # circle of radius 500 m, in decimetres
LAP_S = 60.0


def iso(t: float) -> str:
    return (T0 + timedelta(seconds=t)).isoformat().replace("+00:00", "Z")


def at(t: float, offset: float = 0.0) -> tuple[float, float]:
    a = 2 * math.pi * ((t + offset) % LAP_S) / LAP_S
    return R * math.cos(a), R * math.sin(a)


def run(laps: int = 3, pit_car: str | None = None) -> Derived:
    """Two cars lap a circle; S1 ends a third of the way round, S2 two thirds, the line at 0."""
    d = Derived()
    cars = {"1": 0.0, "2": 7.0}  # car 2 runs 7 s ahead on the circle
    events: list[tuple[float, str, dict]] = []
    for num, off in cars.items():
        for lap in range(laps):
            base = lap * LAP_S - off
            events.append((base + LAP_S / 3, num, {"Sectors": {"0": {"Value": "20.000"}}} if lap % 2 else {"Sectors": {"0": {"Value": "20.100"}}}))
            events.append((base + 2 * LAP_S / 3, num, {"Sectors": {"1": {"Value": "20.000"}}} if lap % 2 else {"Sectors": {"1": {"Value": "20.100"}}}))
            events.append((base + LAP_S, num, {"NumberOfLaps": lap + 1, "Sectors": {"0": {"Value": ""}, "1": {"Value": ""}}}))
    events.sort(key=lambda e: e[0])
    state: dict = {"TimingData": {"Lines": {n: {} for n in cars}}}
    t = 0.0
    for et, num, upd in events:
        while t <= et:  # positions at 4 Hz up to the event
            entries = {n: dict(zip(("X", "Y"), at(t, off)), Z=0, Status="OnTrack") for n, off in cars.items()}
            d.on_position({"Position": [{"Timestamp": iso(t), "Entries": entries}]}, {})
            t += 0.25
        line = state["TimingData"]["Lines"][num]
        line.update(upd)
        if pit_car == num:
            line["InPit"] = True
        d.on_timing({"Lines": {num: upd}}, state, (T0 + timedelta(seconds=et)).timestamp())
    return d


def angle_of(p: tuple[float, float]) -> float:
    return math.degrees(math.atan2(p[1], p[0])) % 360


def test_markers_land_on_the_timing_lines():
    d = run()
    tm = d.track_map()
    assert tm["closed"]
    mk = tm["markers"]
    assert set(mk) == {"finish", "s1", "s2"}
    pts = tm["points"]
    # Within a couple of degrees (about 15 m on this circle) of 0°, 120° and 240°.
    for key, want in (("finish", 0), ("s1", 120), ("s2", 240)):
        got = angle_of(pts[mk[key]])
        assert min(abs(got - want), 360 - abs(got - want)) < 2.5, (key, got)


def test_no_markers_from_pit_laps_or_without_enough_crossings():
    # One lap of two cars: two crossings of each line, one short of a marker.
    assert run(laps=1).track_map().get("markers", {}) == {}
    pitting = run(pit_car="1")
    # Car 1 is in the pit lane all along: only car 2's crossings count.
    assert len(pitting._marks["finish"]) == 3


def test_a_seek_backwards_drops_position_history():
    d = Derived()
    d.on_position({"Position": [{"Timestamp": iso(10), "Entries": {"1": {"X": 1, "Y": 1}}}]}, {})
    d.on_position({"Position": [{"Timestamp": iso(5), "Entries": {"1": {"X": 2, "Y": 2}}}]}, {})
    assert len(d._pos_hist["1"]) == 1
