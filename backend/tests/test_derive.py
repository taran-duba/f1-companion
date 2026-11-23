"""Derived lap history and lap traces."""

from f1live.decode import encode_z
from f1live.messages import Message
from f1live.state import StateStore


def _ts(t: float) -> str:
    return f"2026-01-01T12:{int(t // 60):02d}:{t % 60:06.3f}Z"


def _car(store: StateStore, t: float, speed: int, heavy: bool = True) -> None:
    payload = encode_z({"Entries": [{"Utc": _ts(t), "Cars": {"1": {"Channels": {
        "0": 10000, "2": speed, "3": 6, "4": 80, "5": 0, "45": 0}}}}]})
    store.apply_message(Message(t, "CarData.z", payload, ts=_ts(t)), heavy=heavy)


def _lap(store: StateStore, t: float, n: int, time: str, extra: dict | None = None) -> None:
    line = {"NumberOfLaps": n, "LastLapTime": {"Value": time}}
    line.update(extra or {})
    store.apply_message(Message(t, "TimingData", {"Lines": {"1": line}}, ts=_ts(t)))


def _base() -> StateStore:
    store = StateStore()
    store.apply_message(Message(0, "TimingData", {"Lines": {"1": {"NumberOfLaps": 0}}}, snapshot=True))
    store.apply_message(Message(0, "TimingAppData", {"Lines": {"1": {"Stints": [{"Compound": "SOFT", "TotalLaps": 0}]}}},
                                snapshot=True))
    return store


def test_pit_in_lap_keeps_the_compound_it_was_driven_on():
    store = _base()
    _lap(store, 90, 1, "1:30.000")
    store.apply_message(Message(170, "TimingData", {"Lines": {"1": {"InPit": True}}}))
    store.apply_message(Message(175, "TimingAppData", {"Lines": {"1": {"Stints": {"1": {"Compound": "HARD", "TotalLaps": 0}}}}}))
    _lap(store, 180, 2, "1:50.000", {"InPit": False, "PitOut": True})
    _lap(store, 270, 3, "1:31.000", {"PitOut": False})
    laps = store.snapshot()["Derived"]["LapHistory"]["1"]
    assert [(lap["lap"], lap["compound"], lap["pitIn"]) for lap in laps] == [
        (1, "SOFT", False), (2, "SOFT", True), (3, "HARD", False)]


def test_partial_lap_is_never_stored_as_a_trace():
    store = _base()
    # Lap 1 is the first lap seen: its start wasn't observed, so no trace.
    for t in range(10, 90, 5):
        _car(store, t, 250)
    _lap(store, 90, 1, "1:30.000")
    assert store.traces("1")["last"] is None
    # Lap 2: samples skipped by a fast-forward (heavy=False) -> not clean.
    for t in range(95, 140, 5):
        _car(store, t, 250, heavy=False)
    for t in range(140, 180, 5):
        _car(store, t, 250)
    _lap(store, 180, 2, "1:25.000")
    assert store.traces("1")["best"] is None
    # Lap 3 fully observed -> stored as last and best.
    for t in range(185, 270):
        _car(store, t, 260)
    _lap(store, 270, 3, "1:29.000")
    tr = store.traces("1")
    assert tr["last"]["lap"] == 3 and tr["best"]["lap"] == 3
    assert tr["last"]["points"][-1][0] > 5000  # ~85 s at 260 km/h
