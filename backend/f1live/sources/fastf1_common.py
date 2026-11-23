"""Shared helpers for the FastF1 -> recording conversion.

Everything here is pure (no I/O, no FastF1 import) so the converter can be
tested against a synthetic, FastF1-shaped session object.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd


class FastF1Unavailable(Exception):
    """FastF1 could not provide usable data for the requested session."""


# --------------------------------------------------------------------- values

def missing(v: Any) -> bool:
    """True for None / NaN / NaT / pd.NA (scalars only)."""
    if v is None:
        return True
    try:
        res = pd.isna(v)
    except (TypeError, ValueError):
        return False
    return bool(res) if isinstance(res, (bool, np.bool_)) else False


def seconds(v: Any) -> float | None:
    """Timedelta / timedelta / number -> float seconds, missing -> None."""
    if missing(v):
        return None
    if isinstance(v, pd.Timedelta):
        return v.total_seconds()
    if isinstance(v, timedelta):
        return v.total_seconds()
    if isinstance(v, np.timedelta64):
        return pd.Timedelta(v).total_seconds()
    if isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, bool):
        f = float(v)
        return f if math.isfinite(f) else None
    return None


def to_int(v: Any) -> int | None:
    if missing(v):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(round(f)) if math.isfinite(f) else None


def to_float(v: Any) -> float | None:
    if missing(v):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def to_str(v: Any) -> str | None:
    if missing(v):
        return None
    s = str(v).strip()
    return s or None


def to_bool(v: Any) -> bool | None:
    if missing(v):
        return None
    if isinstance(v, str):
        return v.strip().lower() in ("1", "true", "yes")
    try:
        return bool(v)
    except (TypeError, ValueError):
        return None


def num_key(v: Any) -> str | None:
    """Racing number as the feed keys it: '1', '44' (never '44.0')."""
    if missing(v):
        return None
    if isinstance(v, (float, np.floating)):
        return str(int(v)) if float(v).is_integer() else None
    s = str(v).strip()
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return s or None


# ----------------------------------------------------------------- formatting

def _ms(sec: float) -> int:
    return int(round(sec * 1000))


def fmt_lap(sec: float | None) -> str:
    """92.123 -> '1:32.123' (lap times are always m:ss.fff in the feed)."""
    if sec is None or sec < 0:
        return ""
    ms = _ms(sec)
    m, rem = divmod(ms, 60_000)
    return f"{m}:{rem // 1000:02d}.{rem % 1000:03d}"


def fmt_sector(sec: float | None) -> str:
    """28.123 -> '28.123'; sectors of a minute or more use m:ss.fff."""
    if sec is None or sec < 0:
        return ""
    ms = _ms(sec)
    if ms >= 60_000:
        return fmt_lap(sec)
    return f"{ms // 1000}.{ms % 1000:03d}"


def fmt_gap(sec: float) -> str:
    ms = max(0, _ms(sec))
    return f"+{ms // 1000}.{ms % 1000:03d}"


def fmt_hms(td: timedelta) -> str:
    total = int(td.total_seconds())
    sign = "-" if total < 0 else ""
    total = abs(total)
    return f"{sign}{total // 3600:02d}:{total % 3600 // 60:02d}:{total % 60:02d}"


def to_timestamp(v: Any) -> pd.Timestamp | None:
    """Any date-like value -> tz-naive UTC Timestamp (FastF1 uses naive UTC)."""
    if missing(v):
        return None
    try:
        ts = pd.Timestamp(v)
    except (TypeError, ValueError):
        return None
    if ts is pd.NaT:
        return None
    if ts.tzinfo is not None:
        ts = ts.tz_convert("UTC").tz_localize(None)
    return ts


def iso(ts: pd.Timestamp | None) -> str:
    """Naive-UTC Timestamp -> '2024-03-02T15:03:12.345Z'."""
    if ts is None:
        return ""
    dt = ts.to_pydatetime().replace(tzinfo=timezone.utc)
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def jsonable(v: Any) -> Any:
    """Recursively make FastF1 objects (datetimes, numpy scalars) JSON-safe."""
    if isinstance(v, dict):
        return {str(k): jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [jsonable(x) for x in v]
    if isinstance(v, (pd.Timedelta, timedelta)):
        return fmt_hms(pd.Timedelta(v).to_pytimedelta())
    if isinstance(v, (pd.Timestamp, datetime)):
        ts = to_timestamp(v)
        return ts.isoformat() if ts is not None else None
    if isinstance(v, (date, time)):
        return v.isoformat()
    if isinstance(v, np.generic):
        v = v.item()
    if isinstance(v, float) and not math.isfinite(v):
        return None
    if missing(v):
        return None
    return v


# --------------------------------------------------------------------- frames

def frame(v: Any) -> pd.DataFrame | None:
    """Return a non-empty DataFrame or None (dicts of lists are accepted)."""
    if v is None:
        return None
    if isinstance(v, dict) and v and all(isinstance(x, (list, tuple)) for x in v.values()):
        try:
            v = pd.DataFrame(v)
        except ValueError:
            return None
    if isinstance(v, pd.DataFrame) and not v.empty:
        return v
    return None


def col(df: pd.DataFrame, name: str) -> list:
    """Column as a Python list, or a list of None when the column is absent."""
    if name in df.columns:
        return df[name].tolist()
    return [None] * len(df)


def safe_attr(obj: Any, name: str) -> Any:
    """getattr that swallows FastF1's DataNotLoadedError (and anything else)."""
    try:
        return getattr(obj, name)
    except Exception:  # noqa: BLE001 - FastF1 properties raise on missing data
        return None


# ------------------------------------------------------------------ timeline

@dataclass(order=True)
class Event:
    st: float           # FastF1 session time in seconds
    prio: int           # tie-break for equal times (lower first)
    seq: int            # insertion order, keeps sorting stable
    topic: str = field(compare=False)
    data: Any = field(compare=False)


class Timeline:
    """Collects time-stamped partial updates before they become Messages."""

    def __init__(self) -> None:
        self.events: list[Event] = []

    def add(self, st: float, topic: str, data: Any, prio: int = 5) -> None:
        self.events.append(Event(float(st), prio, len(self.events), topic, data))

    def sorted(self) -> list[Event]:
        return sorted(self.events)
