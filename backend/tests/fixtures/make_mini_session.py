"""Builds mini_session.jsonl: a tiny hand-written recording for tests.

Includes snapshot lines, partial updates with index-keyed list patches, a
.z payload of each kind, and several malformed lines at the end.
Run: python tests/fixtures/make_mini_session.py
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))

from f1live.decode import encode_z  # noqa: E402
from f1live.messages import Message, utc_iso, write_messages  # noqa: E402

START = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def ts(t: float) -> str:
    return utc_iso(START + timedelta(seconds=t))


def build() -> list[Message]:
    empty_sectors = [{"Value": ""}, {"Value": ""}, {"Value": ""}]
    return [
        Message(0, "SessionInfo", {"Meeting": {"Name": "Fixture Grand Prix"}, "Name": "Race", "Type": "Race"}, ts(0), True),
        Message(0, "DriverList", {"1": {"RacingNumber": "1", "Tla": "AAA", "TeamColour": "FF0000", "Line": 1},
                                  "2": {"RacingNumber": "2", "Tla": "BBB", "TeamColour": "0000FF", "Line": 2}}, ts(0), True),
        Message(0, "TimingData", {"Lines": {
            "1": {"Position": "1", "NumberOfLaps": 0, "Sectors": empty_sectors, "LastLapTime": {"Value": ""}},
            "2": {"Position": "2", "NumberOfLaps": 0, "Sectors": empty_sectors, "LastLapTime": {"Value": ""}}}}, ts(0), True),
        Message(0, "TimingAppData", {"Lines": {"1": {"Stints": [{"Compound": "SOFT", "TotalLaps": 0}]},
                                               "2": {"Stints": [{"Compound": "MEDIUM", "TotalLaps": 0}]}}}, ts(0), True),
        Message(0, "RaceControlMessages", {"Messages": []}, ts(0), True),
        Message(0, "LapCount", {"CurrentLap": 1, "TotalLaps": 3}, ts(0), True),
        Message(1.0, "SessionStatus", {"Status": "Started"}, ts(1)),
        Message(1.5, "CarData.z", encode_z({"Entries": [{"Utc": ts(1.5), "Cars": {"1": {"Channels": {
            "0": 11000, "2": 280, "3": 7, "4": 100, "5": 0, "45": 12}}}}]}), ts(1.5)),
        Message(2.0, "Position.z", encode_z({"Position": [{"Timestamp": ts(2), "Entries": {
            "1": {"Status": "OnTrack", "X": 100, "Y": 200, "Z": 0}}}]}), ts(2)),
        Message(30.0, "TimingData", {"Lines": {"1": {"Sectors": {"0": {"Value": "30.000", "PersonalFastest": True}}}}}, ts(30)),
        Message(60.0, "TimingData", {"Lines": {"1": {"Sectors": {"1": {"Value": "30.500"}}}}}, ts(60)),
        Message(90.0, "TimingData", {"Lines": {"1": {"Sectors": {"2": {"Value": "29.500"}}, "NumberOfLaps": 1,
                                                     "LastLapTime": {"Value": "1:30.000", "PersonalFastest": True}}}}, ts(90)),
        Message(90.0, "RaceControlMessages", {"Messages": {"0": {"Category": "Flag", "Flag": "YELLOW",
                                                                 "Message": "YELLOW IN TRACK SECTOR 3", "Lap": 2}}}, ts(90)),
        Message(91.0, "TimingData", {"Lines": {"1": {"Sectors": {"0": {"Value": ""}, "1": {"Value": ""}, "2": {"Value": ""}}}}}, ts(91)),
        Message(95.0, "TimingAppData", {"Lines": {"2": {"Stints": {"1": {"Compound": "HARD", "TotalLaps": 0}}}}}, ts(95)),
        Message(100.0, "LapCount", {"CurrentLap": 2}, ts(100)),
    ]


MALFORMED = [
    '{"t": 101, "topic": "TimingData", "data": {',  # truncated JSON
    "not json at all",
    '{"t": "soon", "topic": "X", "data": 1}',  # non-numeric t
]


def main() -> None:
    out = HERE / "mini_session.jsonl"
    write_messages(out, build())
    with open(out, "a", encoding="utf-8") as fh:
        for line in MALFORMED:
            fh.write(line + "\n")
        # Valid line whose .z payload cannot be decoded: must be skipped by the store.
        fh.write(json.dumps({"t": 102, "ts": ts(102), "topic": "CarData.z", "data": "!!!notbase64"}) + "\n")
        fh.write(json.dumps({"t": 110, "ts": ts(110), "topic": "WeatherData", "data": {"Rainfall": "1"}}) + "\n")


if __name__ == "__main__":
    main()
