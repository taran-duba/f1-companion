"""Seek-bar markers: lap starts and track-status periods."""

from pathlib import Path

from f1live.messages import Message, read_messages
from f1live.sources.replay import ReplaySource, build_markers

FIXTURE = Path(__file__).parent / "fixtures" / "mini_session.jsonl"


class NullSink:
    def apply_message(self, msg: Message, heavy: bool = True) -> None:
        pass

    def reset(self) -> None:
        pass

    def invalidate(self) -> None:
        pass


def _m(t: float, topic: str, data: object, snapshot: bool = False) -> Message:
    return Message(t=t, topic=topic, data=data, snapshot=snapshot)


def test_lap_starts_only_on_change():
    msgs = [
        _m(0, "LapCount", {"CurrentLap": 1, "TotalLaps": 3}, snapshot=True),
        _m(10, "LapCount", {"TotalLaps": 3}),  # no CurrentLap: ignored
        _m(20, "LapCount", {"CurrentLap": 1}),  # unchanged
        _m(95.123, "LapCount", {"CurrentLap": "2"}),  # string value tolerated
        _m(190, "LapCount", {"CurrentLap": 3}),
        _m(200, "LapCount", {"CurrentLap": None}),  # junk ignored
    ]
    assert build_markers(msgs)["laps"] == [{"t": 0, "lap": 1}, {"t": 95.12, "lap": 2}, {"t": 190, "lap": 3}]


def test_track_status_periods():
    msgs = [
        _m(0, "TrackStatus", {"Status": "1", "Message": "AllClear"}),
        _m(10, "TrackStatus", {"Status": "2", "Message": "Yellow"}),
        _m(20, "TrackStatus", {"Status": "4", "Message": "SCDeployed"}),
        _m(80, "TrackStatus", {"Status": "1", "Message": "AllClear"}),
        _m(100, "TrackStatus", {"Status": "6", "Message": "VSCDeployed"}),
        _m(130, "TrackStatus", {"Status": "7", "Message": "VSCEnding"}),  # same VSC period
        _m(140, "TrackStatus", {"Status": "1"}),
        _m(150, "TrackStatus", {"Status": "5", "Message": "Red"}),
        _m(300, "Heartbeat", {}),  # open red flag ends at the last message
    ]
    assert build_markers(msgs)["periods"] == [
        {"start": 10, "end": 20, "status": "yellow", "label": "Yellow"},
        {"start": 20, "end": 80, "status": "sc", "label": "Safety car"},
        {"start": 100, "end": 140, "status": "vsc", "label": "Virtual safety car"},
        {"start": 150, "end": 300, "status": "red", "label": "Red flag"},
    ]


def test_non_dict_data_and_empty_input():
    assert build_markers([]) == {"laps": [], "periods": []}
    assert build_markers([_m(0, "TrackStatus", "4"), _m(1, "LapCount", [1])]) == {"laps": [], "periods": []}


def test_status_includes_markers():
    src = ReplaySource(NullSink(), read_messages(FIXTURE), autoplay=False)
    markers = src.status()["markers"]
    assert markers["laps"] == [{"t": 0, "lap": 1}, {"t": 100.0, "lap": 2}]
    assert isinstance(markers["periods"], list)
