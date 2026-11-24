"""Checks for the committed synthetic demo race and its generator."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

from f1live.decode import decode_topic, decode_z
from f1live.merge import merge
from f1live.messages import iter_messages, open_text, read_messages

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
FIXTURE = REPO / "data" / "demo" / "demo_race.jsonl.gz"
SCRIPTS = BACKEND / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import generate_demo  # noqa: E402

SNAPSHOT_TOPICS = {
    "SessionInfo", "SessionStatus", "TrackStatus", "WeatherData", "LapCount", "Heartbeat",
    "ExtrapolatedClock", "DriverList", "TimingData", "TimingAppData", "RaceControlMessages",
    "TeamRadio", "CarData.z", "Position.z",
}


def _raw_order(path: Path) -> list:
    """Messages in file order (read_messages sorts, so read the lines directly)."""
    with open_text(path) as fh:
        return list(iter_messages(fh))


def _final_state(msgs) -> dict:
    state: dict = {}
    for m in msgs:
        if m.topic.endswith(".z"):
            continue
        # copy snapshots: merge() mutates its target in place
        state[m.topic] = merge(state.get(m.topic), m.data) if not m.snapshot else copy.deepcopy(m.data)
    return state


@pytest.fixture(scope="module")
def demo():
    assert FIXTURE.is_file(), "run backend/scripts/generate_demo.py to create the demo fixture"
    raw = _raw_order(FIXTURE)
    return raw, _final_state(read_messages(FIXTURE))


def test_snapshot_lines_come_first_for_every_topic(demo):
    raw, _ = demo
    n_snap = sum(1 for m in raw if m.snapshot)
    head = raw[:n_snap]
    assert all(m.snapshot and m.t == 0 for m in head)
    assert not any(m.snapshot for m in raw[n_snap:])
    assert {m.topic for m in head} == SNAPSHOT_TOPICS
    status = next(m for m in head if m.topic == "SessionStatus")
    assert status.data == {"Status": "Inactive"}


def test_messages_are_ordered_by_t(demo):
    raw, _ = demo
    ts = [m.t for m in raw]
    assert ts == sorted(ts)
    assert ts[-1] > 50 * 80, "a full race distance should take well over an hour"


def test_twenty_fictional_drivers_and_ten_teams(demo):
    raw, state = demo
    drivers = state["DriverList"]
    assert len(drivers) == 20
    teams = {}
    for d in drivers.values():
        teams.setdefault(d["TeamName"], set()).add(d["TeamColour"])
    assert len(teams) == 10
    assert all(len(c) == 1 for c in teams.values())
    assert len({next(iter(c)) for c in teams.values()}) == 10
    assert len({d["Tla"] for d in drivers.values()}) == 20


def test_race_runs_full_distance(demo):
    raw, state = demo
    lc = state["LapCount"]
    assert lc["CurrentLap"] == lc["TotalLaps"] >= 40
    statuses = [m.data["Status"] for m in raw if m.topic == "SessionStatus"]
    assert statuses == ["Inactive", "Started", "Finished", "Finalised"]
    rc = [msg for m in raw if m.topic == "RaceControlMessages" for msg in
          (m.data["Messages"] if m.snapshot else m.data["Messages"].values())]
    flags = {msg.get("Flag") for msg in rc}
    assert "CHEQUERED" in flags and "BLUE" in flags and "YELLOW" in flags
    texts = " | ".join(msg["Message"] for msg in rc)
    for needle in ("SAFETY CAR DEPLOYED", "SAFETY CAR IN THIS LAP", "VIRTUAL SAFETY CAR DEPLOYED",
                   "DRS ENABLED", "DRS DISABLED", "TRACK LIMITS", "PENALTY"):
        assert needle in texts


def test_safety_car_and_rain(demo):
    raw, _ = demo
    track = [m.data["Status"] for m in raw if m.topic == "TrackStatus"]
    assert "4" in track and "6" in track and "2" in track
    assert track[-1] == "1"
    # no blue flags while the field is neutralised (SC "4" / VSC "6", "7")
    status = "1"
    for m in raw:
        if m.topic == "TrackStatus":
            status = m.data["Status"]
        elif m.topic == "RaceControlMessages" and not m.snapshot:
            for msg in m.data["Messages"].values():
                if msg.get("Flag") == "BLUE":
                    assert status not in ("4", "6", "7"), f"blue flag under SC/VSC at t={m.t}"
    rain = [m.data["Rainfall"] for m in raw if m.topic == "WeatherData"]
    assert "1" in rain and rain[0] == "0" and rain[-1] == "0"


def test_pit_stops_and_tyres(demo):
    _, state = demo
    lines = state["TimingData"]["Lines"]
    app = state["TimingAppData"]["Lines"]
    retired = [n for n, ln in lines.items() if ln.get("Retired")]
    assert len(retired) == 1
    compounds = set()
    for num, ln in lines.items():
        stints = app[num]["Stints"]
        stints = list(stints.values()) if isinstance(stints, dict) else stints
        compounds |= {s["Compound"] for s in stints}
        assert len(stints) == ln["NumberOfPitStops"] + 1
        if num in retired:
            continue
        assert 1 <= ln["NumberOfPitStops"] <= 2
        # in-lap counts for the old set, out-lap for the new one
        assert sum(s["TotalLaps"] for s in stints) == ln["NumberOfLaps"]
    assert {"SOFT", "MEDIUM", "HARD", "INTERMEDIATE"} <= compounds


def test_final_classification_is_consistent(demo):
    _, state = demo
    lines = state["TimingData"]["Lines"]
    assert len(lines) == 20
    assert sorted(int(ln["Position"]) for ln in lines.values()) == list(range(1, 21))
    assert sorted(ln["Line"] for ln in lines.values()) == list(range(1, 21))
    leader = next(ln for ln in lines.values() if ln["Position"] == "1")
    assert leader["GapToLeader"].startswith("LAP ")
    lapped = [ln for ln in lines.values() if ln["GapToLeader"].endswith("L")]
    assert len(lapped) >= 1
    for ln in lines.values():
        assert ln["BestLapTime"]["Value"].startswith("1:")


def test_compressed_topics_decode(demo):
    raw, _ = demo
    car_msgs = [m for m in raw if m.topic == "CarData.z"]
    pos_msgs = [m for m in raw if m.topic == "Position.z"]
    assert len(car_msgs) > 5000 and len(pos_msgs) > 5000
    for m in car_msgs[::25]:
        assert isinstance(m.data, str)
        entries = decode_z(m.data)["Entries"]
        for e in entries:
            assert len(e["Cars"]) == 20
            for ch in e["Cars"].values():
                c = ch["Channels"]
                assert 0 <= c["2"] < 360 and 0 <= c["3"] <= 8 and c["5"] in (0, 100) and 0 <= c["4"] <= 100
    for m in pos_msgs[::25]:
        topic, data = decode_topic(m.topic, m.data)
        assert topic == "Position"
        for e in data["Position"]:
            assert len(e["Entries"]) == 20
            for p in e["Entries"].values():
                assert abs(p["X"]) < 10000 and abs(p["Y"]) < 10000


def test_team_radio_captures_have_clips(demo):
    _, state = demo
    caps = state["TeamRadio"]["Captures"]
    assert 8 <= len(caps) <= 12
    drivers = state["DriverList"]
    radio_dir = FIXTURE.parent / "radio"
    for c in caps:
        assert c["RacingNumber"] in drivers and c["Text"] and c["Utc"].endswith("Z")
        assert c["Path"].startswith(f"TeamRadio/{drivers[c['RacingNumber']]['Tla']}_")
        clip = radio_dir / c["Path"].split("/", 1)[1]
        assert clip.is_file() and 0 < clip.stat().st_size < 40_000, clip
    assert [c["Utc"] for c in caps] == sorted(c["Utc"] for c in caps)


def test_generator_short_race(tmp_path):
    out = tmp_path / "short.jsonl.gz"
    assert generate_demo.main(["--laps", "3", "--seed", "7", "--out", str(out), "-q"]) == 0
    raw = _raw_order(out)
    assert raw[0].snapshot and {m.topic for m in raw if m.snapshot} == SNAPSHOT_TOPICS
    assert [m.t for m in raw] == sorted(m.t for m in raw)
    state = _final_state(raw)
    assert state["LapCount"] == {"CurrentLap": 3, "TotalLaps": 3}
    assert state["SessionStatus"]["Status"] == "Finalised"
    lines = state["TimingData"]["Lines"]
    assert sorted(int(ln["Position"]) for ln in lines.values()) == list(range(1, 21))
    assert all(ln["NumberOfLaps"] >= 2 for ln in lines.values())
    # same seed -> identical output, byte for byte (gzip header has no mtime)
    msgs_a, _ = generate_demo.simulate(seed=7, laps=3)
    assert [m.to_json() for m in msgs_a] == [m.to_json() for m in raw]
    again = tmp_path / "again.jsonl.gz"
    generate_demo.generate(again, seed=7, laps=3)
    assert again.read_bytes() == out.read_bytes()


@pytest.mark.parametrize("laps", ["0", "-3", "100000"])
def test_generator_rejects_bad_laps(laps, tmp_path):
    with pytest.raises(SystemExit):
        generate_demo.main(["--laps", laps, "--out", str(tmp_path / "x.jsonl"), "-q"])
    with pytest.raises(ValueError):
        generate_demo.simulate(laps=int(laps))
