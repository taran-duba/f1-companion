"""FastF1 -> recording conversion, tested against a synthetic FastF1-shaped session."""

from __future__ import annotations

import copy
import math
import types
from datetime import timedelta

import pandas as pd
import pytest

from f1live.decode import decode_topic, decode_z
from f1live.merge import as_list, merge
from f1live.messages import read_messages, write_messages
from f1live.sources import fastf1_source
from f1live.sources.fastf1_convert import ConversionResult, convert_session
from f1live.sources.fastf1_source import FastF1Source, FastF1Unavailable, load_fastf1_session

T0 = pd.Timestamp("2024-03-02 14:00:00")  # naive UTC, like FastF1
START = 3600.0                             # session time of "Started"
NaT = pd.NaT
NaN = float("nan")


def td(s):
    return NaT if s is None or (isinstance(s, float) and math.isnan(s)) else timedelta(seconds=s)


def lap(num, tla, n, start, end, lt, secs, *, compound="MEDIUM", life=None, stint=1.0,
        pit_in=None, pit_out=None, pos=None):
    s1, s2, s3 = secs if secs else (None, None, None)
    s1st = start + s1 if s1 is not None else None
    s2st = s1st + s2 if (s1st is not None and s2 is not None) else None
    return {
        "Driver": tla, "DriverNumber": num, "LapNumber": float(n), "LapTime": td(lt),
        "Sector1Time": td(s1), "Sector2Time": td(s2), "Sector3Time": td(s3),
        "Sector1SessionTime": td(s1st), "Sector2SessionTime": td(s2st), "Sector3SessionTime": td(end),
        "LapStartTime": td(start), "Time": td(end), "Compound": compound,
        "TyreLife": float(life if life is not None else n), "Stint": stint, "FreshTyre": True,
        "PitInTime": td(pit_in), "PitOutTime": td(pit_out), "Position": float(pos) if pos else NaN,
        "IsPersonalBest": False, "SpeedI1": 280.0, "SpeedI2": 250.0, "SpeedFL": 290.0, "SpeedST": 310.0,
    }


def make_laps():
    S = START
    rows = [
        # AAA: 3 laps
        lap("1", "AAA", 1, S, S + 92.0, None, None),
        lap("1", "AAA", 2, S + 92.0, S + 182.5, 90.5, (28.5, 31.0, 31.0)),
        lap("1", "AAA", 3, S + 182.5, S + 272.0, 89.5, (28.0, 30.5, 31.0)),
        # BBB: pits at the end of lap 2, HARD tyres for lap 3
        lap("44", "BBB", 1, S, S + 93.0, None, None),
        lap("44", "BBB", 2, S + 93.0, S + 184.0, 91.0, (28.7, 31.3, 31.0), pit_in=S + 180.0),
        lap("44", "BBB", 3, S + 184.0, S + 296.0, 112.0, (50.0, 31.0, 31.0), compound="HARD", life=1,
            stint=2.0, pit_out=S + 206.0),
        # CCC: fastest, passes AAA on the last lap; lap 2 has a missing sector 2
        lap("16", "CCC", 1, S, S + 94.5, None, None),
        lap("16", "CCC", 2, S + 94.5, S + 183.0, 88.5, (28.1, None, 30.0)),
        lap("16", "CCC", 3, S + 183.0, S + 271.0, 88.0, (27.9, 30.1, 30.0)),
    ]
    junk = [
        {**rows[0], "DriverNumber": None, "Driver": None},               # no driver at all
        {**rows[0], "LapNumber": NaN, "Time": NaT, "LapStartTime": NaT,  # nothing placeable
         "Sector1SessionTime": NaT, "Sector2SessionTime": NaT, "Sector3SessionTime": NaT},
    ]
    return pd.DataFrame(rows + junk)


def make_results():
    base = {"FirstName": "X", "LastName": "Y", "Status": "Finished", "CountryCode": "XXX"}
    return pd.DataFrame([
        {**base, "DriverNumber": "16", "Abbreviation": "CCC", "FullName": "Cara CHARLIE",
         "BroadcastName": "C CHARLIE", "TeamName": "Team Gamma", "TeamColor": "C0C0C0", "GridPosition": 3.0},
        {**base, "DriverNumber": "1", "Abbreviation": "AAA", "FullName": "Ada ALPHA",
         "BroadcastName": "A ALPHA", "TeamName": "Team Alpha", "TeamColor": "112233",
         "GridPosition": 1.0},
        {**base, "DriverNumber": "44", "Abbreviation": "BBB", "FullName": "Ben BRAVO",
         "BroadcastName": "B BRAVO", "TeamName": "Team Bravo", "TeamColor": "445566", "GridPosition": 2.0},
    ])


def tele(rows, cols):
    df = pd.DataFrame(rows, columns=cols)
    df["SessionTime"] = pd.to_timedelta(df["SessionTime"], unit="s")
    df["Date"] = T0 + df["SessionTime"]
    return df


def make_session(**over):
    car_cols = ["SessionTime", "RPM", "Speed", "nGear", "Throttle", "Brake", "DRS"]
    pos_cols = ["SessionTime", "X", "Y", "Z", "Status"]
    car = {
        "1": tele([[START, 11000.0, 290.0, 7, 100.0, False, 12],
                   [START + 0.25, 11100.0, 291.0, 7, 100.0, False, 12],   # same 0.5 s bucket -> dropped
                   [START + 0.6, 9000.0, 180.0, 4, 0.0, True, 0],
                   [START + 1.0, 9500.0, 200.0, 5, 104.0, False, 8]], car_cols),
        "44": tele([[START, NaN, NaN, NaN, NaN, None, NaN],
                    [START + 0.1, 10500.0, 280.0, 6, 80.0, False, 1]], car_cols),
    }
    pos = {
        "1": tele([[START, 1234.0, -567.0, 89.0, "OnTrack"], [START + 0.5, NaN, NaN, NaN, "OnTrack"]], pos_cols),
        "44": tele([[START + 0.1, 1000.0, -500.0, 80.0, "OnTrack"]], pos_cols),
    }
    ses = types.SimpleNamespace(
        name="Race",
        date=pd.Timestamp("2024-03-02 15:00:00"),
        t0_date=T0,
        session_start_time=timedelta(seconds=START),
        total_laps=3,
        event=pd.Series({"EventName": "Testland Grand Prix", "OfficialEventName": "TESTLAND GRAND PRIX 2024",
                         "Location": "Testville", "Country": "Testland"}),
        laps=make_laps(),
        results=make_results(),
        session_status=pd.DataFrame({"Time": [td(0), td(START), td(START + 300), td(START + 1400)],
                                     "Status": ["Inactive", "Started", "Finished", "Finalised"]}),
        track_status=pd.DataFrame({"Time": [td(100), td(START + 100), td(START + 160), NaT],
                                   "Status": ["1", "4", "1", "2"],
                                   "Message": ["AllClear", "SCDeployed", "AllClear", "Yellow"]}),
        weather_data=pd.DataFrame({
            "Time": [td(3000), td(START + 100), td(START + 200)],
            "AirTemp": [24.1, 22.0, NaN], "Humidity": [55.0, 70.0, NaN], "Pressure": [1013.2, 1012.0, NaN],
            "Rainfall": [False, True, NaN], "TrackTemp": [35.6, 30.0, NaN], "WindDirection": [120, 90, NaN],
            "WindSpeed": [2.1, 3.0, NaN]}),
        race_control_messages=pd.DataFrame({
            "Time": [T0 + timedelta(seconds=3000), T0 + timedelta(seconds=START + 1),
                     T0 + timedelta(seconds=START + 100), NaT],
            "Category": ["Other", "Flag", "SafetyCar", "Other"],
            "Message": ["RISK OF RAIN IS 10%", "GREEN LIGHT - PIT EXIT OPEN", "SAFETY CAR DEPLOYED",
                        "LOST"],
            "Status": [None, None, "DEPLOYED", None], "Flag": [None, "GREEN", None, None],
            "Scope": [None, "Track", None, None], "Sector": [NaN, NaN, NaN, NaN],
            "RacingNumber": [None, None, None, None], "Lap": [NaN, 1.0, 2.0, NaN]}),
        car_data=car, pos_data=pos,
    )
    for k, v in over.items():
        setattr(ses, k, v)
    return ses


def final_state(msgs):
    state: dict = {}
    for m in msgs:
        if m.topic.endswith(".z"):
            continue
        state[m.topic] = merge(state.get(m.topic), copy.deepcopy(m.data))
    return state


@pytest.fixture(scope="module")
def converted():
    return convert_session(make_session())


def test_snapshot_lines_first_and_sorted(converted):
    assert isinstance(converted, ConversionResult) and converted.has_telemetry
    snap = [m for m in converted if m.snapshot]
    n = len(snap)
    assert all(m.snapshot and m.t == 0 for m in converted[:n])
    assert not any(m.snapshot for m in converted[n:])
    assert {m.topic for m in snap} >= {"SessionInfo", "SessionStatus", "TrackStatus", "WeatherData", "LapCount",
                                       "DriverList", "TimingData", "TimingAppData", "RaceControlMessages"}
    ts = [m.t for m in converted]
    assert ts == sorted(ts)
    by = {m.topic: m.data for m in snap}
    assert by["SessionStatus"] == {"Status": "Inactive"}
    assert by["LapCount"] == {"CurrentLap": 0, "TotalLaps": 3}
    assert by["TrackStatus"] == {"Status": "1", "Message": "AllClear"}
    assert by["WeatherData"]["AirTemp"] == "24.1" and by["WeatherData"]["Rainfall"] == "0"
    assert by["SessionInfo"]["Meeting"]["Name"] == "Testland Grand Prix" and by["SessionInfo"]["Type"] == "Race"
    # grid order: AAA P1, BBB P2, CCC P3; empty timing
    lines = by["TimingData"]["Lines"]
    assert [lines[n]["Position"] for n in ("1", "44", "16")] == ["1", "2", "3"]
    assert lines["1"]["NumberOfLaps"] == 0 and len(lines["1"]["Sectors"]) == 3
    assert by["DriverList"]["44"]["Tla"] == "BBB" and by["DriverList"]["44"]["TeamColour"] == "445566"
    assert by["TimingAppData"]["Lines"]["44"]["Stints"][0]["Compound"] == "MEDIUM"
    assert by["TimingAppData"]["Lines"]["44"]["GridPos"] == "2"
    assert [m["Message"] for m in by["RaceControlMessages"]["Messages"]] == ["RISK OF RAIN IS 10%"]
    # first update comes shortly before the start (60 s lead)
    started = next(m for m in converted if m.topic == "SessionStatus" and m.data["Status"] == "Started")
    assert started.t == pytest.approx(60.0)
    assert started.ts == "2024-03-02T15:00:00.000Z"


def test_final_timing_state(converted):
    td_ = final_state(converted)["TimingData"]["Lines"]
    assert {n: td_[n]["NumberOfLaps"] for n in ("1", "44", "16")} == {"1": 3, "44": 3, "16": 3}
    assert td_["1"]["LastLapTime"]["Value"] == "1:29.500"
    assert td_["16"]["BestLapTime"] == {"Value": "1:28.000", "Lap": 3}
    assert td_["16"]["LastLapTime"]["OverallFastest"] is True
    assert {n: td_[n]["Position"] for n in td_} == {"16": "1", "1": "2", "44": "3"}
    assert td_["16"]["GapToLeader"] == "LAP 3"
    assert td_["1"]["GapToLeader"] == "+1.000"
    assert td_["1"]["IntervalToPositionAhead"]["Value"] == "+1.000"
    assert td_["44"]["GapToLeader"] == "+25.000"
    assert td_["44"]["IntervalToPositionAhead"]["Value"] == "+24.000"
    assert td_["44"]["NumberOfPitStops"] == 1 and td_["1"]["NumberOfPitStops"] == 0
    assert td_["44"]["InPit"] is False and td_["44"]["PitOut"] is False
    sectors = as_list(td_["16"]["Sectors"])
    assert [s["Value"] for s in sectors] == ["27.900", "30.100", "30.000"]
    assert td_["1"]["Speeds"]["ST"]["Value"] == "310"


def test_positions_after_lap_one(converted):
    state: dict = {}
    for m in converted:
        if m.topic == "TimingData":
            state = merge(state, copy.deepcopy(m.data))
        if m.t > 60.0 + 95.0:  # all three crossed the line once
            break
    lines = state["Lines"]
    assert {n: lines[n]["Position"] for n in lines} == {"1": "1", "44": "2", "16": "3"}
    assert lines["1"]["GapToLeader"] == "LAP 2"
    assert lines["16"]["GapToLeader"] == "+2.500"
    assert lines["16"]["IntervalToPositionAhead"]["Value"] == "+1.500"


def test_pit_sequence_and_sector_clear(converted):
    ham = [m for m in converted if m.topic == "TimingData" and not m.snapshot and "44" in m.data.get("Lines", {})]
    flags = [(m.t, m.data["Lines"]["44"]) for m in ham]
    in_pit = next(t for t, d in flags if d.get("InPit") is True)
    pit_out = next(t for t, d in flags if d.get("PitOut") is True)
    assert in_pit == pytest.approx(60 + 180) and pit_out == pytest.approx(60 + 206)
    clears = [d for _, d in flags if d.get("Sectors", {}).get("0") == {"Value": ""}]
    assert len(clears) == 2  # after lap 1 and lap 2, not after the last lap


def test_timing_app_stints(converted):
    app = final_state(converted)["TimingAppData"]["Lines"]
    ham = as_list(app["44"]["Stints"])
    assert [s["Compound"] for s in ham] == ["MEDIUM", "HARD"]
    assert ham[0]["TotalLaps"] == 2 and ham[1]["TotalLaps"] == 1 and ham[1]["New"] == "true"
    assert len(as_list(app["1"]["Stints"])) == 1 and as_list(app["1"]["Stints"])[0]["TotalLaps"] == 3


def test_other_topics(converted):
    st = final_state(converted)
    assert st["LapCount"] == {"CurrentLap": 3, "TotalLaps": 3}
    assert st["SessionStatus"]["Status"] == "Finalised"
    assert st["TrackStatus"]["Status"] == "1"
    assert any(m.topic == "TrackStatus" and m.data["Status"] == "4" for m in converted)
    assert st["WeatherData"]["Rainfall"] == "1" and st["WeatherData"]["AirTemp"] == "22.0"
    rc = as_list(st["RaceControlMessages"]["Messages"])
    assert [m["Message"] for m in rc] == ["RISK OF RAIN IS 10%", "GREEN LIGHT - PIT EXIT OPEN",
                                          "SAFETY CAR DEPLOYED"]
    assert rc[1]["Flag"] == "GREEN" and rc[1]["Lap"] == 1 and "Sector" not in rc[1]
    assert rc[2]["Mode"] == "SAFETY CAR" and rc[2]["Status"] == "DEPLOYED"
    assert rc[2]["Utc"] == "2024-03-02T15:01:40.000Z"
    assert st["DriverList"]["16"]["Line"] == 1  # DriverList lines follow the classification


def test_car_and_position_telemetry(converted):
    car = [decode_z(m.data) for m in converted if m.topic == "CarData.z"]
    assert len(car) == 3  # buckets at +0.0, +0.5, +1.0 s
    first = car[0]["Entries"][0]
    assert first["Utc"] == "2024-03-02T15:00:00.000Z"
    assert first["Cars"]["1"]["Channels"] == {"0": 11000, "2": 290, "3": 7, "4": 100, "5": 0, "45": 12}
    assert first["Cars"]["44"]["Channels"] == {"0": 10500, "2": 280, "3": 6, "4": 80, "5": 0, "45": 1}
    assert car[1]["Entries"][0]["Cars"]["1"]["Channels"]["5"] == 100   # brake bool -> 100
    assert car[2]["Entries"][0]["Cars"]["1"]["Channels"]["4"] == 100   # throttle 104 clamped
    pos = [decode_z(m.data) for m in converted if m.topic == "Position.z"]
    assert len(pos) == 1
    item = pos[0]["Position"][0]
    assert item["Entries"]["1"] == {"Status": "OnTrack", "X": 1234, "Y": -567, "Z": 89}
    assert set(item["Entries"]) == {"1", "44"}
    assert decode_topic("CarData.z", next(m.data for m in converted if m.topic == "CarData.z"))[0] == "CarData"


def test_hz_and_no_telemetry():
    fast = convert_session(make_session(), telemetry_hz=10.0)
    assert sum(m.topic == "CarData.z" for m in fast) == 5  # 0.0, 0.1, 0.25, 0.6, 1.0 s
    none = convert_session(make_session(car_data={}, pos_data=None))
    assert not none.has_telemetry
    assert not any(m.topic.endswith(".z") for m in none)
    assert any("CarData" in w for w in none.warnings)


def test_nan_heavy_session_does_not_crash():
    laps = make_laps()
    laps.loc[laps["DriverNumber"] == "16", ["LapTime", "Sector1Time", "Sector2Time", "Sector3Time",
                                           "Sector1SessionTime", "Sector2SessionTime", "Compound", "TyreLife",
                                           "Stint", "SpeedFL"]] = None
    ses = make_session(laps=laps, results=None, weather_data=None, race_control_messages=pd.DataFrame(),
                       track_status=None, session_status=None, session_start_time=None, t0_date=None,
                       total_laps=float("nan"))
    msgs = convert_session(ses)
    st = final_state(msgs)
    assert st["TimingData"]["Lines"]["16"]["NumberOfLaps"] == 3
    assert st["TimingData"]["Lines"]["16"]["LastLapTime"]["Value"] == ""
    assert as_list(st["TimingAppData"]["Lines"]["16"]["Stints"])[0]["Compound"] == "UNKNOWN"
    assert st["LapCount"]["TotalLaps"] == 3
    assert st["SessionStatus"]["Status"] == "Finished"


def test_retired_driver_drops_to_the_back():
    laps = make_laps()
    laps = laps[~((laps["DriverNumber"] == "1") & (laps["LapNumber"] == 3.0))]
    res = make_results()
    res.loc[res["DriverNumber"] == "1", "Status"] = "Retired"
    st = final_state(convert_session(make_session(laps=laps, results=res)))["TimingData"]["Lines"]
    assert st["1"]["Retired"] is True and st["1"]["Position"] == "3"


def test_no_laps_raises():
    with pytest.raises(FastF1Unavailable):
        convert_session(make_session(laps=pd.DataFrame()))


def test_roundtrip_through_recording_file(converted, tmp_path):
    path = tmp_path / "rec.jsonl.gz"
    assert write_messages(path, converted) == len(converted)
    back = read_messages(path)
    assert [m.topic for m in back] == [m.topic for m in converted]
    assert final_state(back) == final_state(converted)


# ------------------------------------------------------------ loader/source

class _Unloaded:
    """Mimics a FastF1 Session whose load() silently failed (no F1 TV auth)."""

    def load(self, **kw):
        pass

    @property
    def laps(self):
        from fastf1.exceptions import DataNotLoadedError
        raise DataNotLoadedError("not loaded")


def _fake_fastf1(monkeypatch, session_obj):
    import fastf1
    monkeypatch.setattr(fastf1.Cache, "enable_cache", lambda *a, **k: None)
    monkeypatch.setattr(fastf1, "get_session", lambda *a, **k: session_obj)


def test_load_reports_auth_hint(monkeypatch, tmp_path):
    _fake_fastf1(monkeypatch, _Unloaded())
    with pytest.raises(FastF1Unavailable) as exc:
        load_fastf1_session(2024, "Testland", "R", tmp_path)
    assert "F1_USERNAME" in str(exc.value) and "python -m fastf1 auth f1tv --authenticate" in str(exc.value)


def test_load_converts_without_telemetry(monkeypatch, tmp_path):
    ses = make_session(car_data={}, pos_data={})
    ses.load = lambda **kw: None
    _fake_fastf1(monkeypatch, ses)
    res = load_fastf1_session(2024, "Testland", "R", tmp_path)
    assert res and not res.has_telemetry
    assert any("telemetry missing" in w for w in res.warnings)


class _Sink:
    def __init__(self):
        self.msgs = []

    def apply_message(self, msg):
        self.msgs.append(msg)

    def reset(self):
        self.msgs.clear()


async def test_source_hands_over_messages(monkeypatch, tmp_path):
    monkeypatch.setattr(fastf1_source, "load_fastf1_session",
                        lambda *a, **k: convert_session(make_session()))
    got = []
    src = FastF1Source(_Sink(), year=2024, event="Testland", session="R", out_path=tmp_path / "x.jsonl",
                       on_loaded=got.append)
    await src.run()
    st = src.status()
    assert st["kind"] == "fastf1" and st["state"] == "ended" and st["telemetry"] is True
    assert got and len(got[0]) == st["messages"] and (tmp_path / "x.jsonl").exists()


async def test_source_reports_unavailable(monkeypatch):
    def boom(*a, **k):
        raise FastF1Unavailable("no auth")
    monkeypatch.setattr(fastf1_source, "load_fastf1_session", boom)
    src = FastF1Source(_Sink(), year=2024, event=1, session="R")
    await src.run()
    assert src.status()["state"] == "error" and src.status()["error"] == "no auth"



# ------------------------------------------------------------ robustness

@pytest.mark.parametrize("hz", [float("nan"), float("inf"), 0, -1, None])
def test_invalid_telemetry_rate_disables_telemetry(hz):
    res = convert_session(make_session(), telemetry_hz=hz)
    assert not res.has_telemetry and not any(m.topic.endswith(".z") for m in res)
    assert [m.t for m in res] == sorted(m.t for m in res)


def test_high_rate_is_capped_and_outlier_times_stay_bounded():
    laps = make_laps()
    laps["Time"] = [timedelta(seconds=1e9)] + list(laps["Time"])[1:]  # corrupt lap end far in the future
    res = convert_session(make_session(laps=laps), telemetry_hz=1e6, heartbeat_interval=1e-6)
    assert sum(m.topic == "Heartbeat" for m in res) <= 50_001  # cap + snapshot line
    car_t = [m.t for m in res if m.topic == "CarData.z"]
    assert len(car_t) == 5  # rate capped at 20 Hz: every sample here sits in its own 50 ms bucket
    assert car_t[1] - car_t[0] == pytest.approx(0.1)  # bucket start, not the 1 us grid


def test_unusable_lap_rows_raise():
    laps = make_laps().assign(Time=NaT, LapStartTime=NaT, Sector1SessionTime=NaT, Sector2SessionTime=NaT,
                              Sector3SessionTime=NaT)
    with pytest.raises(FastF1Unavailable):
        convert_session(make_session(laps=laps))


def test_red_flag_restart_still_finishes():
    status = pd.DataFrame({"Time": [td(0), td(START), td(START + 120), td(START + 150)],
                           "Status": ["Inactive", "Started", "Aborted", "Started"]})
    st = final_state(convert_session(make_session(session_status=status)))
    assert st["SessionStatus"]["Status"] == "Finished"


def test_full_distance_disqualification_is_not_retired():
    res = make_results()
    res.loc[res["DriverNumber"] == "16", "Status"] = "Disqualified"
    st = final_state(convert_session(make_session(results=res)))["TimingData"]["Lines"]
    assert st["16"].get("Retired") is False and st["16"]["Position"] == "1"


def test_round_number_string_becomes_int(monkeypatch, tmp_path):
    import fastf1
    seen = {}

    def get_session(year, event, session):
        seen["event"] = event
        return _Unloaded()
    monkeypatch.setattr(fastf1.Cache, "enable_cache", lambda *a, **k: None)
    monkeypatch.setattr(fastf1, "get_session", get_session)
    with pytest.raises(FastF1Unavailable):
        load_fastf1_session(2024, " 3 ", "R", tmp_path)
    assert seen["event"] == 3


def test_default_recording_path_is_sanitised():
    p = fastf1_source.default_recording_path(2024, "../São Paulo/x", "Sprint Qualifying")
    assert p.parent == fastf1_source.DEFAULT_RECORDINGS_DIR
    assert p.name == "fastf1-2024-s_o_paulo_x-sprint_qualifying.jsonl.gz"
