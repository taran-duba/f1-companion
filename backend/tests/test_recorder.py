"""Recorder tests: recordings must round-trip through read_messages."""

from __future__ import annotations

import asyncio
import json
import re

from websockets.asyncio.server import serve
import httpx

from f1live.decode import encode_z
from f1live.messages import Message, read_messages
from f1live.recorder import Recorder, session_slug
from f1live.sources.live import LiveSource

SESSION = {"Meeting": {"Name": "Sample Grand Prix"}, "Name": "Race", "Key": 9001}
Z = encode_z({"Entries": [{"Utc": "2026-12-06T13:00:00Z", "Cars": {"1": {"Channels": {"2": 301}}}}]})


def sample_messages() -> list[Message]:
    return [
        Message(t=5.0, topic="DriverList", data={"1": {"Tla": "ABC"}}, ts="2026-12-06T13:00:00.000Z", snapshot=True),
        Message(t=5.0, topic="SessionInfo", data=SESSION, ts="2026-12-06T13:00:00.000Z", snapshot=True),
        Message(t=5.0, topic="CarData.z", data=Z, ts="2026-12-06T13:00:00.000Z", snapshot=True),
        Message(t=5.5, topic="TimingData", data={"Lines": {"1": {"Sectors": {"1": {"Value": "30.101"}}}}},
                ts="2026-12-06T13:00:00.500Z"),
        Message(t=6.25, topic="CarData.z", data=Z, ts="2026-12-06T13:00:01.250Z"),
        Message(t=7.0, topic="RaceControlMessages", data={"Messages": {"7": {"Message": "GREEN LIGHT — PIT EXIT OPEN"}}},
                ts="2026-12-06T13:00:02.000Z"),
    ]


def test_session_slug():
    assert session_slug(SESSION) == "sample-grand-prix-race"
    assert session_slug(None) == "session"
    assert session_slug({"Name": "Practice 1"}) == "practice-1"


def test_round_trip_with_default_name(tmp_path):
    rec = Recorder(tmp_path)
    rec.start()
    msgs = sample_messages()
    for m in msgs[:2]:
        rec.write(m)
    # DriverList arrived before SessionInfo but both are buffered/written in order
    for m in msgs[2:]:
        rec.write(m)
    st = rec.status()
    path = rec.stop()
    assert path is not None and path.parent == tmp_path
    assert re.fullmatch(r"\d{8}T\d{6}Z_sample-grand-prix-race\.jsonl", path.name)
    assert st["enabled"] is True and st["messages"] == 6 and st["bytes"] == path.stat().st_size

    back = read_messages(path)
    assert [(m.topic, m.data, m.ts, m.snapshot) for m in back] == \
        [(m.topic, m.data, m.ts, m.snapshot) for m in msgs]
    assert [m.t for m in back] == [0.0, 0.0, 0.0, 0.5, 1.25, 2.0]
    assert isinstance(back[2].data, str) and back[2].data == Z  # raw .z payload preserved
    first = json.loads(path.read_text().splitlines()[0])
    assert first["snapshot"] is True and "snapshot" not in json.loads(path.read_text().splitlines()[3])
    assert rec.status()["enabled"] is False


def test_explicit_gz_path_and_flush(tmp_path):
    out = tmp_path / "sub" / "rec.jsonl.gz"
    rec = Recorder(tmp_path, flush_every=1)
    rec.start(out)
    for m in sample_messages():
        rec.write(m)
    assert rec.stop() == out
    back = read_messages(out)
    assert [m.topic for m in back] == [m.topic for m in sample_messages()]


def test_writes_ignored_when_not_started_and_no_session_info(tmp_path):
    rec = Recorder(tmp_path)
    rec.write(sample_messages()[0])
    assert rec.status()["messages"] == 0 and rec.stop() is None
    rec.start()
    rec.write(Message(t=1.0, topic="LapCount", data={"CurrentLap": 1}, ts="x", snapshot=True))
    rec.write(Message(t=2.0, topic="LapCount", data={"CurrentLap": 2}, ts="y"))
    path = rec.stop()
    assert path.name.endswith("_session.jsonl")
    assert [m.t for m in read_messages(path)] == [0.0, 1.0]
    # restarting creates a new file, not an overwrite
    rec.start()
    rec.write(Message(t=0.0, topic="SessionInfo", data={"Name": "x"}, ts="z", snapshot=True))
    assert rec.stop() != path


def test_start_with_session_name_and_bad_payload(tmp_path):
    rec = Recorder(tmp_path)
    rec.start(session_name="Sample Grand Prix Qualifying")
    rec.write(Message(t=3.0, topic="DriverList", data={"1": {"Tla": "ABC"}}, ts="a", snapshot=True))
    assert rec.status()["path"] is not None  # opened immediately, nothing buffered
    rec.write(Message(t=3.5, topic="Weird", data={"x": object()}, ts="b"))  # skipped, not raised
    rec.write(Message(t=4.0, topic="LapCount", data={"CurrentLap": 1}, ts="c"))
    st = rec.status()
    path = rec.stop()
    assert path.name.endswith("_sample-grand-prix-qualifying.jsonl")
    assert "Weird" in st["last_error"] and st["messages_written"] == 2
    back = read_messages(path)
    assert [(m.topic, m.t) for m in back] == [("DriverList", 0.0), ("LapCount", 1.0)]


def test_pending_snapshot_buffer_is_bounded(tmp_path, monkeypatch):
    monkeypatch.setattr("f1live.recorder.MAX_PENDING", 3)
    rec = Recorder(tmp_path)
    rec.start()
    for i in range(5):
        rec.write(Message(t=0.0, topic=f"T{i}", data={}, ts="x", snapshot=True))
    assert rec.status()["path"] is not None
    assert [m.topic for m in read_messages(rec.stop())] == [f"T{i}" for i in range(5)]


async def test_live_source_feeds_recorder(tmp_path):
    rs = "\x1e"

    async def handler(ws):
        await ws.recv()
        await ws.send("{}" + rs)
        await ws.recv()
        await ws.send(json.dumps({"type": 3, "invocationId": "1",
                                  "result": {"SessionInfo": SESSION, "Position.z": Z}}) + rs)
        await ws.send(json.dumps({"type": 1, "target": "feed",
                                  "arguments": ["Position.z", Z, "2026-12-06T13:00:01Z"]}) + rs)
        await ws.wait_closed()

    def negotiate(request):
        return httpx.Response(200, json={"connectionToken": "t"})

    class NullSink:
        def reset(self): pass
        def apply_message(self, msg): pass

    rec = Recorder(tmp_path)
    rec.start()
    async with serve(handler, "127.0.0.1", 0) as server:
        port = server.sockets[0].getsockname()[1]
        src = LiveSource(NullSink(), base_url=f"http://127.0.0.1:{port}", token=None, ws_proxy=None,
                         http_transport=httpx.MockTransport(negotiate), recorder=rec.write)
        task = asyncio.create_task(src.run())
        for _ in range(500):
            if rec.status()["messages"] >= 3:
                break
            await asyncio.sleep(0.01)
        await src.stop()
        await task
    path = rec.stop()
    back = read_messages(path)
    assert [(m.topic, m.snapshot) for m in back] == [("SessionInfo", True), ("Position.z", True),
                                                       ("Position.z", False)]
    assert back[2].data == Z and back[2].ts == "2026-12-06T13:00:01Z"
    assert back[0].t == 0.0 and back[2].t >= 0.0
