"""Convert a loaded FastF1 session into our recorded message format.

Pure: works on any object with FastF1's attribute and column names (tests use
a synthetic fake). Output matches a live recording: one snapshot line per
topic at ``t=0`` (pre-session grid state), then time-ordered partial updates.
``t`` is seconds since the recording start, which is ``lead_seconds`` before
the session start. ``.z`` topics are base64 raw-deflate like the real feed.
"""

from __future__ import annotations

import logging
import math
from datetime import timedelta
from typing import Any

import pandas as pd

from ..messages import Message
from .fastf1_common import (
    FastF1Unavailable, Timeline, col, frame, iso, jsonable, missing, num_key, safe_attr, seconds,
    to_float, to_int, to_str, to_timestamp,
)
from .fastf1_telemetry import add_telemetry
from .fastf1_timing import DriverInfo, build_timing

__all__ = ["ConversionResult", "FastF1Unavailable", "convert_session"]

log = logging.getLogger(__name__)

RACE_NAMES = {"race", "sprint"}
END_STATUSES = {"Finished", "Finalised", "Ends"}
MIN_HEARTBEAT = 1.0
MAX_HEARTBEATS = 50_000  # ~70 h at 5 s; guards against outlier session times
P_STATUS, P_LAPCOUNT, P_MISC = 0, 3, 5


class ConversionResult(list):
    """``list[Message]`` with conversion metadata attached."""

    def __init__(self, messages: list[Message] = (), *, has_telemetry: bool = False,
                 warnings: list[str] | None = None, info: dict | None = None) -> None:
        super().__init__(messages)
        self.has_telemetry = has_telemetry
        self.warnings = list(warnings or [])
        self.info = dict(info or {})


# ------------------------------------------------------------------ drivers

def _drivers(results: pd.DataFrame | None, laps: pd.DataFrame) -> tuple[list[DriverInfo], dict]:
    """Driver infos ordered by grid plus DriverList snapshot entries."""
    rows: list[dict[str, Any]] = []
    if results is not None:
        c = {k: col(results, k) for k in ("DriverNumber", "Abbreviation", "FullName", "BroadcastName",
                                          "TeamName", "TeamColor", "GridPosition", "Status", "FirstName",
                                          "LastName", "CountryCode", "HeadshotUrl")}
        for i in range(len(results)):
            num = num_key(c["DriverNumber"][i])
            if not num or any(r["num"] == num for r in rows):
                continue
            rows.append({"num": num, "i": i, **{k: c[k][i] for k in c}})
    else:
        seen: list[str] = []
        abbrs = dict(zip(col(laps, "DriverNumber"), col(laps, "Driver")))
        for raw in col(laps, "DriverNumber"):
            num = num_key(raw)
            if num and num not in seen:
                seen.append(num)
                rows.append({"num": num, "i": len(rows), "Abbreviation": abbrs.get(raw)})

    def grid_key(r: dict) -> tuple:
        g = to_int(r.get("GridPosition"))
        return (g is None or g <= 0, g or 0, r["i"])

    rows.sort(key=grid_key)
    infos: list[DriverInfo] = []
    driver_list: dict[str, dict] = {}
    for line, r in enumerate(rows, 1):
        grid = to_int(r.get("GridPosition"))
        tla = to_str(r.get("Abbreviation"))
        infos.append(DriverInfo(num=r["num"], order=line, tla=tla, grid=grid if grid and grid > 0 else None,
                                status=to_str(r.get("Status"))))
        entry: dict[str, Any] = {"RacingNumber": r["num"], "Line": line}
        for feed_key, src in (("BroadcastName", "BroadcastName"), ("FullName", "FullName"), ("Tla", "Abbreviation"),
                              ("TeamName", "TeamName"), ("TeamColour", "TeamColor"), ("FirstName", "FirstName"),
                              ("LastName", "LastName"), ("CountryCode", "CountryCode"),
                              ("HeadshotUrl", "HeadshotUrl")):
            v = to_str(r.get(src))
            if v is not None:
                entry[feed_key] = v.lstrip("#") if feed_key == "TeamColour" else v
        driver_list[r["num"]] = entry
    return infos, driver_list


# ------------------------------------------------------------- session info

def _session_info(session: Any, race_like: bool) -> dict:
    info = safe_attr(session, "session_info")
    if isinstance(info, dict) and info:
        out = jsonable(info)
        out["ArchiveStatus"] = {"Status": "Complete"}
        return out
    ev = safe_attr(session, "event")

    def ev_get(key: str) -> str | None:
        try:
            return to_str(ev[key]) if ev is not None else None
        except (KeyError, IndexError, TypeError):
            return None

    name = to_str(safe_attr(session, "name")) or ""
    stype = "Race" if race_like else ("Qualifying" if "qualifying" in name.lower() or "shootout" in name.lower()
                                      else "Practice")
    date = to_timestamp(safe_attr(session, "date"))
    location = ev_get("Location")
    return {
        "Meeting": {"Name": ev_get("EventName") or "", "OfficialName": ev_get("OfficialEventName") or "",
                    "Location": location or "", "Country": {"Name": ev_get("Country") or ""},
                    "Circuit": {"ShortName": location or ""}},
        "ArchiveStatus": {"Status": "Complete"},
        "Type": stype, "Name": name,
        "StartDate": date.isoformat() if date is not None else "",
        "GmtOffset": "00:00:00",
    }


def _is_race(session: Any) -> bool:
    name = (to_str(safe_attr(session, "name")) or "").lower()
    if name in RACE_NAMES:
        return True
    info = safe_attr(session, "session_info")
    return isinstance(info, dict) and str(info.get("Type", "")).lower() == "race"


# --------------------------------------------------------------- misc topics

def _weather_rows(df: pd.DataFrame | None) -> list[tuple[float, dict]]:
    if df is None:
        return []
    out = []
    times = col(df, "Time")
    fmt = {"AirTemp": "{:.1f}", "Humidity": "{:.1f}", "Pressure": "{:.1f}", "TrackTemp": "{:.1f}",
           "WindSpeed": "{:.1f}"}
    cols = {k: col(df, k) for k in (*fmt, "Rainfall", "WindDirection")}
    for i, t in enumerate(times):
        st = seconds(t)
        if st is None:
            continue
        row: dict[str, str] = {}
        for k, f in fmt.items():
            v = to_float(cols[k][i])
            if v is not None:
                row[k] = f.format(v)
        rain = cols["Rainfall"][i]
        if not missing(rain):
            row["Rainfall"] = "1" if (rain is True or str(rain).lower() in ("1", "true", "1.0")) else "0"
        wd = to_int(cols["WindDirection"][i])
        if wd is not None:
            row["WindDirection"] = str(wd)
        if row:
            out.append((st, row))
    return sorted(out, key=lambda x: x[0])


def _rc_rows(df: pd.DataFrame | None, t0: pd.Timestamp | None) -> list[tuple[float, dict]]:
    if df is None:
        return []
    c = {k: col(df, k) for k in ("Time", "Category", "Message", "Status", "Flag", "Scope", "Sector",
                                 "RacingNumber", "Lap")}
    out = []
    for i in range(len(df)):
        raw_t = c["Time"][i]
        st = seconds(raw_t)
        utc = None
        if st is None:  # FastF1 stores RC times as UTC datetimes
            ts = to_timestamp(raw_t)
            if ts is None or t0 is None:
                continue
            st, utc = (ts - t0).total_seconds(), ts
        text = to_str(c["Message"][i])
        if text is None:
            continue
        msg: dict[str, Any] = {"Utc": iso(utc if utc is not None else (t0 + timedelta(seconds=st)
                                                                       if t0 is not None else None))}
        lap = to_int(c["Lap"][i])
        if lap is not None:
            msg["Lap"] = lap
        msg["Category"] = to_str(c["Category"][i]) or "Other"
        for k in ("Flag", "Scope", "Status"):
            v = to_str(c[k][i])
            if v is not None and v.lower() not in ("none", "nan"):
                msg[k] = v
        sector = to_int(c["Sector"][i])
        if sector is not None:
            msg["Sector"] = sector
        rn = num_key(c["RacingNumber"][i])
        if rn and rn.lower() not in ("none", "nan"):
            msg["RacingNumber"] = rn
        if msg["Category"] == "SafetyCar":
            up = text.upper()
            msg["Mode"] = "VIRTUAL SAFETY CAR" if "VIRTUAL" in up else "SAFETY CAR"
        msg["Message"] = text
        out.append((st, msg))
    return sorted(out, key=lambda x: x[0])


def _status_rows(df: pd.DataFrame | None, value_cols: tuple[str, ...]) -> list[tuple[float, dict]]:
    if df is None:
        return []
    times = col(df, "Time")
    cols = {k: col(df, k) for k in value_cols}
    out = []
    for i, t in enumerate(times):
        st = seconds(t)
        if st is None:
            continue
        row = {k: to_str(cols[k][i]) for k in value_cols}
        if row.get("Status") is None:
            continue
        out.append((st, {k: v for k, v in row.items() if v is not None}))
    return sorted(out, key=lambda x: x[0])


def _split(rows: list[tuple[float, Any]], base_st: float) -> tuple[list, list]:
    return [r for r in rows if r[0] <= base_st], [r for r in rows if r[0] > base_st]


# ------------------------------------------------------------------- convert

def convert_session(session: Any, *, telemetry_hz: float = 2.0, lead_seconds: float = 60.0,
                    heartbeat_interval: float = 5.0, include_telemetry: bool = True) -> ConversionResult:
    """Convert a loaded FastF1 ``Session`` (or look-alike) to recording messages.

    Raises :class:`FastF1Unavailable` when the session has no lap data.
    """
    laps = frame(safe_attr(session, "laps"))
    if laps is None:
        raise FastF1Unavailable("the session has no lap timing data")
    warnings: list[str] = []
    race_like = _is_race(session)
    results = frame(safe_attr(session, "results"))
    drivers, driver_list = _drivers(results, laps)

    # --- time base: FastF1 session time (seconds) <-> wall clock
    status_rows = _status_rows(frame(safe_attr(session, "session_status")), ("Status",))
    start_st = seconds(safe_attr(session, "session_start_time"))
    if start_st is None:
        start_st = next((st for st, r in status_rows if r["Status"] == "Started"), None)
    if start_st is None:
        starts = [s for s in (seconds(v) for v in col(laps, "LapStartTime")) if s is not None]
        ends = [s for s in (seconds(v) for v in col(laps, "Time")) if s is not None]
        start_st = min(starts) if starts else (min(ends) - 120.0 if ends else 0.0)
    lead = to_float(lead_seconds)
    base_st = start_st - (max(0.0, lead) if lead is not None else 60.0)
    lap_ends = [s for s in (seconds(v) for v in col(laps, "Time")) if s is not None]
    last_lap_end = max(lap_ends) if lap_ends else start_st

    t0 = to_timestamp(safe_attr(session, "t0_date"))
    if t0 is None:
        date = to_timestamp(safe_attr(session, "date"))
        t0 = date - timedelta(seconds=start_st) if date is not None else None
        warnings.append("t0_date unavailable; wall-clock timestamps are approximate")

    def utc_for(st: float) -> str:
        return iso(t0 + timedelta(seconds=st)) if t0 is not None else ""

    total = to_int(safe_attr(session, "total_laps")) if race_like else None
    if race_like and not total:
        total = max((to_int(v) or 0 for v in col(laps, "LapNumber")), default=0) or None

    tl = Timeline()
    td_lines, app_lines = build_timing(laps, drivers, race_like=race_like, total_laps=total,
                                       start_st=start_st, tl=tl)
    if not any(ev.topic == "TimingData" and any("NumberOfLaps" in ln for ln in ev.data["Lines"].values())
               for ev in tl.events):
        raise FastF1Unavailable("the session's lap data has no usable lap end times")
    for d in drivers:  # drivers discovered only in lap data
        driver_list.setdefault(d.num, {"RacingNumber": d.num, "Line": d.order, **({"Tla": d.tla} if d.tla else {})})

    # --- session status
    pre, post = _split(status_rows, base_st)
    status_snap = pre[-1][1] if pre else {"Status": "Inactive"}
    for st, row in post:
        tl.add(st, "SessionStatus", {"Status": row["Status"]}, P_STATUS)
    if not any(r["Status"] == "Started" for _, r in post) and status_snap["Status"] != "Started":
        tl.add(start_st, "SessionStatus", {"Status": "Started"}, P_STATUS)
    last_start = max((st for st, r in post if r["Status"] == "Started"), default=-math.inf)
    after = [r["Status"] for st, r in post if st >= last_start]
    if not (any(x in END_STATUSES for x in after) or (after and after[-1] == "Aborted")):
        tl.add(last_lap_end + 1.0, "SessionStatus", {"Status": "Finished"}, P_STATUS)
    end_st = max([last_lap_end + 1.0] + [st for st, _ in post])

    # --- track status
    pre, post = _split(_status_rows(frame(safe_attr(session, "track_status")), ("Status", "Message")), base_st)
    track_snap = pre[-1][1] if pre else {"Status": "1", "Message": "AllClear"}
    for st, row in post:
        tl.add(st, "TrackStatus", row, P_MISC)

    # --- weather
    weather = _weather_rows(frame(safe_attr(session, "weather_data")))
    pre, post = _split(weather, base_st)
    weather_snap = pre[-1][1] if pre else (weather[0][1] if weather else {})
    for st, row in post:
        tl.add(st, "WeatherData", row, P_MISC)
    if not weather:
        warnings.append("weather data unavailable")

    # --- race control
    pre, post = _split(_rc_rows(frame(safe_attr(session, "race_control_messages")), t0), base_st)
    rc_snap = [m for _, m in pre]
    for i, (st, msg) in enumerate(post, len(rc_snap)):
        tl.add(st, "RaceControlMessages", {"Messages": {str(i): msg}}, P_MISC)

    # --- lap count
    if race_like:
        tl.add(start_st, "LapCount", {"CurrentLap": 1}, P_LAPCOUNT)

    # --- heartbeat
    hb = to_float(heartbeat_interval)
    if hb is not None and hb > 0:
        hb = max(hb, MIN_HEARTBEAT)
        n_hb = min(int((end_st - base_st) // hb), MAX_HEARTBEATS)
        for k in range(1, n_hb + 1):
            st = base_st + k * hb
            tl.add(st, "Heartbeat", {"Utc": utc_for(st)}, P_MISC)

    # --- telemetry
    car_data, pos_data = safe_attr(session, "car_data"), safe_attr(session, "pos_data")
    n_car = n_pos = 0
    if include_telemetry and (to_float(telemetry_hz) or 0.0) > 0:
        n_car, n_pos = add_telemetry(tl, car_data, pos_data, base_st=base_st, end_st=last_lap_end + 120.0,
                                     hz=telemetry_hz, t0=t0, utc_for=utc_for)
        if not n_car:
            warnings.append("car telemetry (CarData) unavailable")
        if not n_pos:
            warnings.append("position data (Position) unavailable")

    # --- assemble
    base_ts = utc_for(base_st)
    snapshot = [
        ("SessionInfo", _session_info(session, race_like)),
        ("SessionStatus", status_snap),
        ("TrackStatus", track_snap),
        ("WeatherData", weather_snap),
    ]
    if race_like:
        snapshot.append(("LapCount", {"CurrentLap": 0, "TotalLaps": total}))
    snapshot += [
        ("Heartbeat", {"Utc": base_ts}),
        ("DriverList", driver_list),
        ("TimingData", {"Lines": td_lines, "Withheld": False}),
        ("TimingAppData", {"Lines": app_lines}),
        ("RaceControlMessages", {"Messages": rc_snap}),
    ]
    messages = [Message(t=0.0, topic=topic, data=data, ts=base_ts, snapshot=True) for topic, data in snapshot]
    for ev in tl.sorted():
        messages.append(Message(t=round(max(0.0, ev.st - base_st), 3), topic=ev.topic, data=ev.data,
                                ts=utc_for(ev.st)))
    info = {"race_like": race_like, "total_laps": total, "drivers": len(drivers), "start_t": start_st - base_st,
            "duration": round(end_st - base_st, 3), "car_messages": n_car, "position_messages": n_pos}
    return ConversionResult(messages, has_telemetry=bool(n_car or n_pos), warnings=warnings, info=info)
