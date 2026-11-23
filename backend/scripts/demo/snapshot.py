"""Initial Subscribe snapshot (one line per topic at t=0)."""

from __future__ import annotations

from f1live.decode import encode_z

from . import roster, telemetry


def _timing_line(track, car, pos: int) -> dict:
    sectors = [
        {"Stopped": False, "Value": "", "Status": 0, "OverallFastest": False, "PersonalFastest": False,
         "Segments": [{"Status": 0} for _ in range(track.seg_counts[k])]}
        for k in range(3)
    ]
    blank = {"Value": "", "Status": 0, "OverallFastest": False, "PersonalFastest": False}
    return {
        "RacingNumber": car.num, "Line": pos, "Position": str(pos), "ShowPosition": True,
        "GapToLeader": "", "IntervalToPositionAhead": {"Value": "", "Catching": False},
        "Retired": False, "InPit": False, "PitOut": False, "Stopped": False, "Status": 0,
        "NumberOfLaps": 0, "NumberOfPitStops": 0, "Sectors": sectors,
        "Speeds": {k: dict(blank) for k in ("I1", "I2", "FL", "ST")},
        "BestLapTime": {"Value": ""}, "LastLapTime": dict(blank),
    }


def emit_snapshot(race) -> None:
    feed, track, d = race.feed, race.track, race.director
    cars = sorted(race.cars, key=lambda c: c.grid)
    feed.snapshot("SessionInfo", roster.session_info())
    feed.snapshot("SessionStatus", {"Status": "Inactive"})
    feed.snapshot("TrackStatus", {"Status": "1", "Message": "AllClear"})
    feed.snapshot("WeatherData", d.weather_data())
    feed.snapshot("LapCount", {"CurrentLap": 1, "TotalLaps": race.total})
    feed.snapshot("Heartbeat", {"Utc": feed.ts(0)})
    feed.snapshot("ExtrapolatedClock", d.clock(0.0, False))
    feed.snapshot("DriverList", {c.num: roster.driver_list_entry(c.info, c.grid) for c in cars})
    feed.snapshot("TimingData", {"Lines": {c.num: _timing_line(track, c, c.grid) for c in cars}, "Withheld": False})
    feed.snapshot("TimingAppData", {"Lines": {c.num: {
        "RacingNumber": c.num, "Line": c.grid, "GridPos": str(c.grid),
        "Stints": [{"LapFlags": 0, "Compound": c.compound, "New": "true", "TyresNotChanged": "0",
                    "TotalLaps": 0, "StartLaps": 0}]} for c in cars}})
    feed.snapshot("RaceControlMessages", {"Messages": d.rc_messages_snapshot()})
    rng = race.rng
    sample = {"Utc": feed.ts(0), "Cars": {c.num: {"Channels": telemetry.channels(c, 0.0, False, 0, rng)} for c in cars}}
    feed.snapshot("CarData.z", encode_z({"Entries": [sample]}))
    pos = {"Timestamp": feed.ts(0), "Entries": {c.num: telemetry.position(track, c) for c in cars}}
    feed.snapshot("Position.z", encode_z({"Position": [pos]}))
