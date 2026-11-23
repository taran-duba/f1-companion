"""FastF1 ``car_data`` / ``pos_data`` -> downsampled ``CarData.z`` / ``Position.z``.

Each driver's telemetry is bucketed at ``hz`` (first sample per bucket is
kept). All drivers sampled in the same bucket are batched into one feed item,
which is encoded exactly like the live feed (base64 raw-deflate JSON).
"""

from __future__ import annotations

import math
from typing import Any, Callable, Iterable

import numpy as np
import pandas as pd

from ..decode import encode_z
from .fastf1_common import Timeline, num_key

# CarData channel number -> FastF1 column
CAR_CHANNELS: dict[str, str] = {"0": "RPM", "2": "Speed", "3": "nGear", "4": "Throttle", "5": "Brake", "45": "DRS"}
P_TELEMETRY = 6
MAX_HZ = 20.0


def _numeric(df: pd.DataFrame, name: str) -> np.ndarray | None:
    if name not in df.columns:
        return None
    try:
        return pd.to_numeric(df[name], errors="coerce").to_numpy(dtype="float64", na_value=np.nan)
    except (TypeError, ValueError):
        return None


def _session_seconds(df: pd.DataFrame, t0: pd.Timestamp | None) -> np.ndarray | None:
    """Per-row session time in seconds, from SessionTime or Date - t0."""
    if "SessionTime" in df.columns:
        st = pd.to_timedelta(df["SessionTime"], errors="coerce")
        return st.dt.total_seconds().to_numpy(dtype="float64", na_value=np.nan)
    if "Date" in df.columns and t0 is not None:
        dates = pd.to_datetime(df["Date"], errors="coerce")
        if getattr(dates.dt, "tz", None) is not None:
            dates = dates.dt.tz_convert("UTC").dt.tz_localize(None)
        return (dates - t0).dt.total_seconds().to_numpy(dtype="float64", na_value=np.nan)
    return None


def _items(mapping: Any) -> Iterable[tuple[Any, Any]]:
    if mapping is None:
        return []
    if hasattr(mapping, "items"):
        try:
            return list(mapping.items())
        except Exception:  # noqa: BLE001
            return []
    return []


def _bucketed(mapping: Any, *, base_st: float, end_st: float, hz: float, t0: pd.Timestamp | None,
              required: tuple[str, ...], any_of: tuple[str, ...] = (), row_fn: Callable[[pd.DataFrame, np.ndarray], Callable[[int], Any]],
              ) -> dict[int, dict[str, Any]]:
    """Return {bucket: {racing_number: item}} with the first valid sample per bucket."""
    buckets: dict[int, dict[str, Any]] = {}
    for raw_num, df in _items(mapping):
        num = num_key(raw_num)
        if not num or not isinstance(df, pd.DataFrame) or df.empty:
            continue
        st = _session_seconds(df, t0)
        if st is None:
            continue
        valid = np.isfinite(st) & (st >= base_st) & (st <= end_st)
        for name in required:
            arr = _numeric(df, name)
            if arr is None:
                valid &= False
            else:
                valid &= np.isfinite(arr)
        if any_of:
            some = np.zeros(len(df), dtype=bool)
            for name in any_of:
                arr = _numeric(df, name)
                if arr is not None:
                    some |= np.isfinite(arr)
            valid &= some
        idx = np.nonzero(valid)[0]
        if idx.size == 0:
            continue
        b = np.floor((st[idx] - base_st) * hz + 1e-6).astype(np.int64)  # eps: FP at bucket edges
        _, first = np.unique(b, return_index=True)  # first sample per bucket
        get = row_fn(df, idx)
        for j in first:
            item = get(int(j))
            if item is not None:
                buckets.setdefault(int(b[j]), {})[num] = item
    return buckets


def _car_rows(df: pd.DataFrame, idx: np.ndarray) -> Callable[[int], Any]:
    cols = {ch: _numeric(df, name) for ch, name in CAR_CHANNELS.items()}

    def get(j: int) -> dict | None:
        i = idx[j]
        ch: dict[str, int] = {}
        for key, arr in cols.items():
            if arr is None or not math.isfinite(arr[i]):
                continue
            v = float(arr[i])
            if key == "5":
                ch[key] = 100 if v > 0 else 0
            elif key == "4":
                ch[key] = int(round(min(100.0, max(0.0, v))))
            else:
                ch[key] = int(round(v))
        return {"Channels": ch} if ch else None
    return get


def _pos_rows(df: pd.DataFrame, idx: np.ndarray) -> Callable[[int], Any]:
    xs, ys, zs = _numeric(df, "X"), _numeric(df, "Y"), _numeric(df, "Z")
    status = df["Status"].tolist() if "Status" in df.columns else None

    def get(j: int) -> dict:
        i = idx[j]
        s = status[i] if status is not None else None
        item: dict[str, Any] = {"Status": s if isinstance(s, str) and s else "OnTrack",
                                "X": int(round(xs[i])), "Y": int(round(ys[i]))}  # type: ignore[index]
        item["Z"] = int(round(zs[i])) if zs is not None and math.isfinite(zs[i]) else 0
        return item
    return get


def add_telemetry(tl: Timeline, car_data: Any, pos_data: Any, *, base_st: float, end_st: float,
                  hz: float, t0: pd.Timestamp | None, utc_for: Callable[[float], str]) -> tuple[int, int]:
    """Add encoded CarData.z / Position.z messages; returns (car msgs, pos msgs)."""
    try:
        hz = float(hz)
    except (TypeError, ValueError):
        return 0, 0
    if not math.isfinite(hz) or hz <= 0:
        return 0, 0
    hz = min(hz, MAX_HZ)  # FastF1 samples at ~4 Hz; more only bloats the file
    car = _bucketed(car_data, base_st=base_st, end_st=end_st, hz=hz, t0=t0, required=(),
                    any_of=tuple(CAR_CHANNELS.values()), row_fn=_car_rows)
    for b in sorted(car):
        st = base_st + b / hz
        payload = {"Entries": [{"Utc": utc_for(st), "Cars": car[b]}]}
        tl.add(st, "CarData.z", encode_z(payload), P_TELEMETRY)
    pos = _bucketed(pos_data, base_st=base_st, end_st=end_st, hz=hz, t0=t0, required=("X", "Y"),
                    row_fn=_pos_rows)
    for b in sorted(pos):
        st = base_st + b / hz
        payload = {"Position": [{"Timestamp": utc_for(st), "Entries": pos[b]}]}
        tl.add(st, "Position.z", encode_z(payload), P_TELEMETRY)
    return len(car), len(pos)
