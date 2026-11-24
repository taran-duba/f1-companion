"""State store: merges feed messages into one dict and tracks what changed.

The store is the only thing the server reads. Sources push messages in via
:meth:`StateStore.apply_message`; the server pulls a full public snapshot for
new clients and coalesced deltas (:meth:`drain_delta`) for everyone else.

Public state layout (what the browser receives)::

    {
      "SessionInfo": {...}, "SessionStatus": {...}, "TrackStatus": {...},
      "WeatherData": {...}, "LapCount": {...}, "DriverList": {...},
      "TimingData": {...}, "TimingAppData": {...}, "RaceControlMessages": {...},
      "ExtrapolatedClock": {...}, "Heartbeat": {...}, ...other raw topics,
      "CarData":  {"Utc": str, "Cars": {num: {rpm, speed, gear, throttle, brake, drs}}},
      "Position": {"Timestamp": str, "Entries": {num: {X, Y, Z, Status}}},
      "Derived":  {"LapHistory": {num: [lap, ...]}, "TrackMap": {...}},
      "Feed":     {"t": float, "utc": str, "telemetry": bool, "position": bool,
                   "messages": int, "errors": int}
    }

``generation`` increments whenever the state is replaced wholesale (reset,
snapshot, replay seek); subscribers must then resend a full snapshot.
"""

from __future__ import annotations

import copy
import logging
from typing import Any

from .decode import DecodeError, decode_topic
from .derive import Derived
from .merge import merge, merge_delta
from .messages import Message, parse_iso

log = logging.getLogger(__name__)

# Raw topics we keep in memory but never ship to the browser.
_PRIVATE_TOPICS = {"CarData.z", "Position.z", "CarData", "Position"}


class StateStore:
    def __init__(self) -> None:
        self.generation = 0
        self.seq = 0
        self.reset()

    # -- lifecycle ---------------------------------------------------------
    def reset(self) -> None:
        """Drop all state. Subscribers will receive a fresh snapshot."""
        self.topics: dict[str, Any] = {}
        self.car_data: dict[str, Any] = {}
        self.position: dict[str, Any] = {}
        self.derived = Derived()
        self.feed: dict[str, Any] = {"t": 0.0, "utc": None, "telemetry": False, "position": False,
                                     "messages": 0, "errors": 0}
        self._pending: dict[str, Any] = {}
        self.generation += 1

    # -- ingest ------------------------------------------------------------
    def apply_message(self, msg: Message, heavy: bool = True) -> None:
        """Apply one message; never raises on bad data.

        ``heavy=False`` skips per-sample telemetry history (used while a
        replay fast-forwards through data that is about to be superseded).
        """
        try:
            self._apply(msg, heavy)
        except DecodeError as exc:
            self.feed["errors"] += 1
            log.warning("dropping %s at t=%.1f: %s", msg.topic, msg.t, exc)
        except Exception:  # noqa: BLE001 - a bad message must not kill the stream
            self.feed["errors"] += 1
            log.exception("failed to apply %s at t=%.1f", msg.topic, msg.t)

    def _apply(self, msg: Message, heavy: bool) -> None:
        topic, data = decode_topic(msg.topic, msg.data)
        self.feed["messages"] += 1
        self.feed["t"] = msg.t
        if msg.ts:
            self.feed["utc"] = msg.ts
        utc_dt = parse_iso(msg.ts) if msg.ts else None
        utc = utc_dt.timestamp() if utc_dt else None

        if topic == "CarData":
            latest = self.derived.on_car_data(data, keep_samples=heavy)
            if latest:
                self.car_data = latest
                self._mark("CarData", latest)
                self._feed_flag("telemetry", True)
            return
        if topic == "Position":
            lines = (self.topics.get("TimingData") or {}).get("Lines") or {}
            latest, outline_changed = self.derived.on_position(data, lines)
            if latest:
                self.position = latest
                self._mark("Position", latest)
                self._feed_flag("position", True)
            if outline_changed:
                self._mark("Derived", {"TrackMap": self.derived.track_map()}, replace_key="TrackMap")
            return

        if msg.snapshot:
            self.topics[topic] = copy.deepcopy(data) if isinstance(data, (dict, list)) else data
            self.generation += 1
        else:
            if isinstance(data, dict) and isinstance(self.topics.get(topic), (dict, list)):
                self.topics[topic] = merge(self.topics[topic], data)
            else:
                self.topics[topic] = merge({}, data) if isinstance(data, dict) else copy.deepcopy(data)
            self._mark(topic, data)

        if topic == "TimingData" and isinstance(data, dict):
            d = self.derived.on_timing(data, self.topics, utc)
            if d and not msg.snapshot:
                self._mark("Derived", d)
            if self.derived.markers_changed:
                self.derived.markers_changed = False
                self._mark("Derived", {"TrackMap": self.derived.track_map()}, replace_key="TrackMap")

    def _feed_flag(self, key: str, value: bool) -> None:
        if self.feed.get(key) != value:
            self.feed[key] = value
            self._mark("Feed", {key: value})

    def _mark(self, topic: str, delta: Any, replace: bool = False, replace_key: str | None = None) -> None:
        """Record a public delta for the next :meth:`drain_delta`."""
        if replace or not isinstance(delta, dict):
            # Replace-style topics: the latest value wins, but the browser
            # merges, so cars missing from this sample keep their last value.
            self._pending[topic] = copy.deepcopy(delta)
            return
        if replace_key is not None:
            slot = self._pending.setdefault(topic, {})
            slot[replace_key] = copy.deepcopy(delta[replace_key])
            return
        slot = self._pending.get(topic)
        if not isinstance(slot, dict):
            slot = self._pending[topic] = {}
        merge_delta(slot, copy.deepcopy(delta))

    # -- read --------------------------------------------------------------
    def snapshot(self) -> dict[str, Any]:
        """Full public state (deep copy, JSON-serialisable)."""
        out: dict[str, Any] = {}
        for k, v in self.topics.items():
            if k in _PRIVATE_TOPICS:
                continue
            out[k] = copy.deepcopy(v)
        out["CarData"] = copy.deepcopy(self.car_data) or {"Utc": None, "Cars": {}}
        out["Position"] = copy.deepcopy(self.position) or {"Timestamp": None, "Entries": {}}
        out["Derived"] = copy.deepcopy(self.derived.public())
        out["Feed"] = dict(self.feed)
        return out

    def drain_delta(self) -> dict[str, Any] | None:
        """Return and clear the coalesced public delta since the last call."""
        if not self._pending:
            return None
        delta = self._pending
        self._pending = {}
        delta.setdefault("Feed", {})
        if isinstance(delta["Feed"], dict):
            delta["Feed"].update({"t": self.feed["t"], "utc": self.feed["utc"],
                                  "messages": self.feed["messages"], "errors": self.feed["errors"]})
        self.seq += 1
        return delta

    def invalidate(self) -> None:
        """Force a full snapshot for subscribers (after seek/bulk apply)."""
        self._pending = {}
        self.generation += 1

    def telemetry(self, num: str, window: float = 60.0) -> dict[str, Any]:
        return self.derived.telemetry(num, window)

    def traces(self, num: str) -> dict[str, Any]:
        return self.derived.traces(num)
