"""State store deltas and the SSE hub's snapshot-first behaviour."""

import json

from f1live.decode import encode_z
from f1live.merge import merge
from f1live.messages import Message
from f1live.server import Hub
from f1live.state import StateStore


class _Mgr:
    source = None

    def status(self):
        return {"source": {"kind": "test", "state": "idle"}}


def _events(q):
    out = []
    while not q.empty():
        item = q.get_nowait()
        head, data = item.split("\n", 1)
        out.append((head.removeprefix("event: "), json.loads(data.removeprefix("data: ").strip())))
    return out


def _snap(store, topic, data):
    store.apply_message(Message(0, topic, data, snapshot=True))


def test_client_state_from_snapshot_plus_patches_equals_server_state():
    store = StateStore()
    _snap(store, "TimingData", {"Lines": {"1": {"Sectors": [{"Value": ""}, {"Value": ""}]}}})
    client = store.snapshot()
    store.drain_delta()
    store.apply_message(Message(1, "TimingData", {"Lines": {"1": {"Sectors": {"0": {"Value": "30.1"}}}}}))
    store.apply_message(Message(2, "TimingData", {"Lines": {"1": {"Sectors": {"1": {"Value": "31.2"}}}}}))
    store.apply_message(Message(3, "RaceControlMessages", {"Messages": {"0": {"Message": "hi"}}}))
    delta = store.drain_delta()
    merge(client, delta)
    server = store.snapshot()
    for topic in ("TimingData", "RaceControlMessages"):
        assert client[topic] == server[topic]


def test_telemetry_is_decoded_and_raw_z_never_public():
    store = StateStore()
    payload = encode_z({"Entries": [{"Utc": "2026-01-01T00:00:00Z", "Cars": {"4": {"Channels": {
        "0": 10500, "2": 312, "3": 8, "4": 99, "5": 0, "45": 12}}}}]})
    store.apply_message(Message(1, "CarData.z", payload, ts="2026-01-01T00:00:00Z"))
    snap = store.snapshot()
    assert "CarData.z" not in snap
    assert snap["CarData"]["Cars"]["4"] == {"rpm": 10500, "speed": 312, "gear": 8, "throttle": 99,
                                            "brake": 0, "drs": 12}
    assert snap["Feed"]["telemetry"] is True
    assert store.drain_delta()["CarData"]["Cars"]["4"]["speed"] == 312


def test_bad_message_counts_error_and_keeps_going():
    store = StateStore()
    store.apply_message(Message(1, "Position.z", "%%%"))
    store.apply_message(Message(2, "LapCount", {"CurrentLap": 3}))
    snap = store.snapshot()
    assert snap["Feed"]["errors"] == 1
    assert snap["LapCount"] == {"CurrentLap": 3}


def test_new_client_gets_snapshot_first_then_patches():
    store = StateStore()
    hub = Hub(store, _Mgr())
    _snap(store, "LapCount", {"CurrentLap": 1, "TotalLaps": 50})
    q = hub.register()
    kinds = [k for k, _ in _events(q)]
    assert kinds == ["status", "snapshot"]
    store.apply_message(Message(5, "LapCount", {"CurrentLap": 2}))
    hub.flush()
    (kind, body), = _events(q)
    assert kind == "patch" and body["changes"]["LapCount"] == {"CurrentLap": 2}


def test_reset_pushes_fresh_snapshot_to_connected_clients():
    """Reconnect-from-snapshot, server side: a feed reconnect resets the
    store, and every connected browser is sent a full replacement snapshot
    instead of patches against state that no longer exists."""
    store = StateStore()
    hub = Hub(store, _Mgr())
    _snap(store, "LapCount", {"CurrentLap": 9, "TotalLaps": 50})
    q = hub.register()
    _events(q)
    store.reset()
    _snap(store, "LapCount", {"CurrentLap": 10, "TotalLaps": 50})
    store.apply_message(Message(1, "TrackStatus", {"Status": "4"}))
    hub.flush()
    events = _events(q)
    assert [k for k, _ in events] == ["snapshot"]
    state = events[0][1]["state"]
    assert state["LapCount"]["CurrentLap"] == 10 and state["TrackStatus"]["Status"] == "4"


def test_second_client_does_not_steal_first_clients_patch():
    store = StateStore()
    hub = Hub(store, _Mgr())
    _snap(store, "LapCount", {"CurrentLap": 1})
    q1 = hub.register()
    _events(q1)
    store.apply_message(Message(1, "LapCount", {"CurrentLap": 2}))
    q2 = hub.register()  # registering flushes the pending patch to q1 first
    assert [b["changes"]["LapCount"] for k, b in _events(q1) if k == "patch"] == [{"CurrentLap": 2}]
    snap2 = [b for k, b in _events(q2) if k == "snapshot"][0]
    assert snap2["state"]["LapCount"]["CurrentLap"] == 2
