"""Live SignalR source tests against local fake servers (no network)."""

from __future__ import annotations

import asyncio
import json
from http import HTTPStatus
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from websockets.asyncio.server import serve

from f1live.decode import encode_z
from f1live.messages import Message
from f1live.sources import signalr
from f1live.sources.live import LiveSource

RS = "\x1e"
TOPICS = ["SessionInfo", "TimingData", "CarData.z", "Position.z", "LapCount"]
FAST = dict(backoff_initial=0.01, backoff_max=0.05, auth_backoff_min=0.01, stall_timeout=2.0,
            connect_timeout=2.0, ws_proxy=None)


class Sink:
    def __init__(self) -> None:
        self.events: list[tuple] = []

    def reset(self) -> None:
        self.events.append(("reset",))

    def apply_message(self, msg: Message) -> None:
        self.events.append(("msg", msg))

    @property
    def msgs(self) -> list[Message]:
        return [e[1] for e in self.events if e[0] == "msg"]

    @property
    def resets(self) -> int:
        return sum(1 for e in self.events if e[0] == "reset")


async def wait_until(cond, timeout: float = 5.0) -> None:
    loop = asyncio.get_running_loop()
    end = loop.time() + timeout
    while not cond():
        if loop.time() > end:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(0.01)


class FakeServer:
    """Local websocket server; ``script(ws, index)`` drives each connection."""

    def __init__(self, script, process_request=None) -> None:
        self.script = script
        self.process_request = process_request
        self.requests: list = []
        self.received: list[list[str]] = []

    async def __aenter__(self) -> "FakeServer":
        self.server = await serve(self._handler, "127.0.0.1", 0, process_request=self.process_request)
        self.port = self.server.sockets[0].getsockname()[1]
        self.base_url = f"http://127.0.0.1:{self.port}"
        return self

    async def __aexit__(self, *exc) -> None:
        self.server.close()
        await self.server.wait_closed()

    async def _handler(self, ws) -> None:
        idx = len(self.requests)
        self.requests.append(ws.request)
        self.received.append([])
        try:
            await self.script(ws, idx, self.received[idx])
        except Exception:  # client went away
            pass


def negotiate_transport(log: list[httpx.Request], status: int = 200, legacy: bool = False):
    def handler(request: httpx.Request) -> httpx.Response:
        log.append(request)
        if status != 200:
            return httpx.Response(status, headers={"WWW-Authenticate": "Bearer"})
        if legacy:
            return httpx.Response(200, json={"ConnectionToken": "tok+/=1", "Url": "/signalr"},
                                  headers=[("set-cookie", "GCLB=abc; Path=/"), ("set-cookie", "x=y")])
        return httpx.Response(200, json={"negotiateVersion": 1, "connectionToken": "tok+/=1"},
                              headers=[("set-cookie", "AWSALBCORS=sticky1; Path=/; Secure")])
    return httpx.MockTransport(handler)


async def core_open(ws, received: list[str]) -> None:
    hs = await ws.recv()
    received.append(hs)
    assert hs == '{"protocol":"json","version":1}' + RS
    await ws.send("{}" + RS)
    sub = await ws.recv()
    received.append(sub)


def completion(result: dict) -> str:
    return json.dumps({"type": 3, "invocationId": "1", "result": result}) + RS


def feed(topic: str, data, ts: str) -> str:
    return json.dumps({"type": 1, "target": "feed", "arguments": [topic, data, ts]}) + RS


SNAP = {
    "SessionInfo": {"Name": "Race", "Meeting": {"Name": "Test Grand Prix"}},
    "TimingData": {"Lines": {"1": {"Position": "1"}}},
    "CarData.z": encode_z({"Entries": []}),
}


def make_source(sink, fake: FakeServer, http_log: list, **kw) -> LiveSource:
    kw = {**FAST, **kw}
    return LiveSource(sink, base_url=fake.base_url, topics=TOPICS, token=kw.pop("token", None),
                      http_transport=kw.pop("http", None) or negotiate_transport(http_log), **kw)


async def test_core_handshake_snapshot_and_updates():
    z = encode_z({"Entries": [{"Utc": "x", "Cars": {}}]})

    async def script(ws, idx, received):
        await core_open(ws, received)
        await ws.send(completion(SNAP))
        # several messages in one frame, including a ping
        await ws.send(feed("TimingData", {"Lines": {"1": {"Position": "2"}}}, "2026-01-01T00:00:01Z")
                      + '{"type":6}' + RS + feed("CarData.z", z, "2026-01-01T00:00:02Z"))
        await ws.send(feed("LapCount", {"CurrentLap": 2}, "2026-01-01T00:00:03Z"))
        await ws.wait_closed()

    sink, http_log = Sink(), []
    async with FakeServer(script) as fake:
        src = make_source(sink, fake, http_log)
        task = asyncio.create_task(src.run())
        await wait_until(lambda: len(sink.msgs) >= 6)
        st = src.status()
        await src.stop()
        await asyncio.wait_for(task, 2)

    assert http_log[0].method == "POST"
    assert http_log[0].url.path == "/signalrcore/negotiate"
    assert http_log[0].url.params["negotiateVersion"] == "1"
    req = fake.requests[0]
    assert req.path == "/signalrcore?id=tok%2B%2F%3D1"
    assert req.headers["Cookie"] == "AWSALBCORS=sticky1"  # load-balancer stickiness kept
    assert "Authorization" not in req.headers
    sub = json.loads(fake.received[0][1].rstrip(RS))
    assert sub == {"type": 1, "target": "Subscribe", "arguments": [TOPICS], "invocationId": "1"}

    assert sink.events[0] == ("reset",)
    snaps = [m for m in sink.msgs if m.snapshot]
    assert [m.topic for m in snaps][0] == "SessionInfo"
    assert {m.topic for m in snaps} == set(SNAP)
    assert next(m for m in snaps if m.topic == "CarData.z").data == SNAP["CarData.z"]
    updates = [m for m in sink.msgs if not m.snapshot]
    assert [(m.topic, m.ts) for m in updates] == [
        ("TimingData", "2026-01-01T00:00:01Z"), ("CarData.z", "2026-01-01T00:00:02Z"),
        ("LapCount", "2026-01-01T00:00:03Z")]
    assert updates[1].data == z  # raw base64 kept
    assert all(b.t >= a.t for a, b in zip(sink.msgs, sink.msgs[1:]))

    assert st["kind"] == "live" and st["state"] == "connected" and st["transport"] == "core"
    assert st["missing_topics"] == ["Position.z"]  # LapCount arrived via feed
    assert st["telemetry_available"] is False
    assert st["messages"] == 6 and st["last_error"] is None and st["connected_since"]
    assert src.status()["state"] == "idle"


async def test_malformed_frames_are_skipped():
    async def script(ws, idx, received):
        await core_open(ws, received)
        await ws.send("not json at all" + RS + '{"type":1,"target":"feed","arguments":[]}' + RS)
        await ws.send("[" * 100000 + RS)  # nesting deep enough to raise RecursionError
        await ws.send("{}" + RS)  # a second handshake reply must not trigger a re-subscribe
        await ws.send(completion({"SessionInfo": {"Name": "Race"}}))
        await ws.send(b"\xff\xfe\x00garbage")
        await ws.send('[1,2,3]' + RS + '{"type":1,"target":"feed","arguments":[42,{}]}' + RS)
        await ws.send(feed("LapCount", {"CurrentLap": 5}, "2026-01-01T00:00:05Z"))
        await ws.wait_closed()

    sink = Sink()
    async with FakeServer(script) as fake:
        src = make_source(sink, fake, [])
        task = asyncio.create_task(src.run())
        await wait_until(lambda: any(m.topic == "LapCount" for m in sink.msgs))
        st = src.status()
        await src.stop()
        await task
    assert st["bad_frames"] >= 7
    assert st["reconnects"] == 0 and st["state"] == "connected"
    assert len(fake.received[0]) == 2  # handshake + exactly one Subscribe
    assert [m.topic for m in sink.msgs] == ["SessionInfo", "LapCount"]


async def test_server_drop_reconnects_from_fresh_snapshot():
    async def script(ws, idx, received):
        await core_open(ws, received)
        if idx == 0:
            await ws.send(completion({"LapCount": {"CurrentLap": 3, "TotalLaps": 50}}))
            await ws.send(feed("LapCount", {"CurrentLap": 4}, "t1"))
            await asyncio.sleep(0.05)
            await ws.close()
        else:
            await ws.send(completion({"LapCount": {"CurrentLap": 9, "TotalLaps": 50},
                                      "SessionInfo": {"Name": "Race"}}))
            await ws.send(feed("LapCount", {"CurrentLap": 10}, "t2"))
            await ws.wait_closed()

    sink = Sink()
    async with FakeServer(script) as fake:
        src = make_source(sink, fake, [])
        task = asyncio.create_task(src.run())
        await wait_until(lambda: any(m.ts == "t2" for m in sink.msgs))
        st = src.status()
        await src.stop()
        await task
    kinds = [e[0] if e[0] == "reset" else (e[1].topic, e[1].snapshot) for e in sink.events]
    assert kinds == ["reset", ("LapCount", True), ("LapCount", False),
                     "reset", ("SessionInfo", True), ("LapCount", True), ("LapCount", False)]
    assert sink.msgs[3].data == {"CurrentLap": 9, "TotalLaps": 50}
    assert st["reconnects"] == 1 and st["state"] == "connected"
    assert len(fake.requests) == 2


async def test_negotiate_401_reports_and_keeps_retrying():
    http_log: list = []
    sink = Sink()
    src = LiveSource(sink, base_url="http://127.0.0.1:9", topics=TOPICS, token=None,
                     http_transport=negotiate_transport(http_log, status=401), **FAST)
    changes: list[str] = []
    src.on_status_change(lambda: changes.append(src.status()["state"]))
    task = asyncio.create_task(src.run())
    await wait_until(lambda: len(http_log) >= 3)
    st = src.status()
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    await src.stop()
    await asyncio.wait_for(task, 1)
    assert loop.time() - t0 < 0.5
    assert st["state"] == "error"
    assert st["last_error"].startswith("401 Unauthorized: live timing requires an F1 TV token")
    assert st["reconnects"] >= 2 and st["token_present"] is False
    assert "error" in changes and changes[-1] == "idle"
    assert sink.events == []


async def test_negotiate_403_and_500_messages():
    for status, expected in ((403, "403 Forbidden"), (500, "HTTP 500 from negotiate")):
        log: list = []
        src = LiveSource(Sink(), base_url="http://127.0.0.1:9", token=None,
                         http_transport=negotiate_transport(log, status=status), **FAST)
        task = asyncio.create_task(src.run())
        await wait_until(lambda: len(log) >= 2)
        assert src.status()["last_error"].startswith(expected)
        await src.stop()
        await task


async def test_websocket_401_is_reported():
    def reject(connection, request):
        return connection.respond(HTTPStatus.UNAUTHORIZED, "no\n")

    async def script(ws, idx, received):  # never reached
        await ws.wait_closed()

    async with FakeServer(script, process_request=reject) as fake:
        src = make_source(Sink(), fake, [])
        task = asyncio.create_task(src.run())
        await wait_until(lambda: src.status()["reconnects"] >= 1)
        st = src.status()
        await src.stop()
        await task
    assert st["state"] == "error"
    assert "401 Unauthorized" in st["last_error"] and "websocket connect" in st["last_error"]


async def test_legacy_protocol_end_to_end():
    async def script(ws, idx, received):
        await ws.send(json.dumps({"C": "d-1", "S": 1, "M": []}))
        received.append(await ws.recv())
        await ws.send(json.dumps({"R": {"SessionInfo": {"Name": "Race"}, "Position.z": "abc=",
                                        "CarData.z": "def="}, "I": "1"}))
        await ws.send("{}")
        await ws.send(json.dumps({"C": "d-2", "M": [
            {"H": "Streaming", "M": "feed", "A": ["TimingData", {"Lines": {}}, "2026-01-01T00:00:01Z"]},
            {"H": "Streaming", "M": "feed", "A": ["Position.z", "ghi=", "2026-01-01T00:00:02Z"]},
        ]}))
        await ws.wait_closed()

    http_log: list = []
    sink = Sink()
    async with FakeServer(script) as fake:
        src = make_source(sink, fake, http_log, transport="legacy",
                          http=negotiate_transport(http_log, legacy=True))
        task = asyncio.create_task(src.run())
        await wait_until(lambda: len(sink.msgs) >= 5)
        st = src.status()
        await src.stop()
        await task

    neg = http_log[0]
    assert neg.method == "GET" and neg.url.path == "/signalr/negotiate"
    assert neg.url.params["connectionData"] == '[{"name":"Streaming"}]'
    assert neg.url.params["clientProtocol"] == "1.5"
    assert neg.headers["user-agent"] == "BestHTTP"
    req = fake.requests[0]
    parts = urlsplit(req.path)
    q = parse_qs(parts.query)
    assert parts.path == "/signalr/connect"
    assert q["connectionToken"] == ["tok+/=1"] and q["transport"] == ["webSockets"]
    assert q["connectionData"] == ['[{"name":"Streaming"}]'] and q["clientProtocol"] == ["1.5"]
    assert req.headers["User-Agent"] == "BestHTTP"
    assert req.headers["Cookie"] == "GCLB=abc; x=y"
    assert req.headers["Accept-Encoding"] == "gzip,identity"
    assert json.loads(fake.received[0][0]) == {"H": "Streaming", "M": "Subscribe", "A": [TOPICS], "I": 1}

    assert sink.events[0] == ("reset",)
    assert [(m.topic, m.snapshot) for m in sink.msgs] == [
        ("SessionInfo", True), ("CarData.z", True), ("Position.z", True),
        ("TimingData", False), ("Position.z", False)]
    assert sink.msgs[-1].data == "ghi=" and sink.msgs[-1].ts == "2026-01-01T00:00:02Z"
    assert st["transport"] == "legacy" and st["telemetry_available"] is True
    assert st["missing_topics"] == ["LapCount"]


async def test_token_header_sent_when_env_set(monkeypatch):
    monkeypatch.setenv("F1TV_TOKEN", "secret-token-123")
    monkeypatch.setenv("F1_TRANSPORT", "core")

    async def script(ws, idx, received):
        await core_open(ws, received)
        await ws.send(completion({"SessionInfo": {}}))
        await ws.wait_closed()

    http_log: list = []
    sink = Sink()
    async with FakeServer(script) as fake:
        src = LiveSource(sink, base_url=fake.base_url, http_transport=negotiate_transport(http_log), **FAST)
        task = asyncio.create_task(src.run())
        await wait_until(lambda: len(sink.msgs) >= 1)
        st = src.status()
        await src.stop()
        await task
    assert http_log[0].headers["authorization"] == "Bearer secret-token-123"
    assert fake.requests[0].headers["Authorization"] == "Bearer secret-token-123"
    assert st["token_present"] is True
    assert "secret-token-123" not in json.dumps(st)


async def test_stall_triggers_reconnect():
    async def script(ws, idx, received):
        await core_open(ws, received)
        await ws.send(completion({"LapCount": {"CurrentLap": idx}}))
        await ws.wait_closed()  # then silence

    sink = Sink()
    async with FakeServer(script) as fake:
        src = make_source(sink, fake, [], stall_timeout=0.2, keepalive_interval=10)
        errors: list = []
        src.on_status_change(lambda: errors.append(src.status()["last_error"]))
        task = asyncio.create_task(src.run())
        await wait_until(lambda: sink.resets >= 2)
        st = src.status()
        await src.stop()
        await task
    assert any("stalled" in (e or "") for e in errors)
    assert st["last_error"] is None  # cleared by the successful reconnect
    assert st["reconnects"] >= 1


async def test_sink_errors_do_not_kill_the_loop():
    class BadSink(Sink):
        def apply_message(self, msg):
            super().apply_message(msg)
            raise RuntimeError("boom")

    async def script(ws, idx, received):
        await core_open(ws, received)
        await ws.send(completion({"SessionInfo": {}}))
        await ws.send(feed("LapCount", {"CurrentLap": 1}, "t"))
        await ws.wait_closed()

    sink = BadSink()
    async with FakeServer(script) as fake:
        src = make_source(sink, fake, [])
        task = asyncio.create_task(src.run())
        await wait_until(lambda: len(sink.msgs) >= 2)
        assert src.status()["reconnects"] == 0
        await src.stop()
        await task


async def test_stop_is_prompt_while_connected():
    async def script(ws, idx, received):
        await core_open(ws, received)
        await ws.send(completion({"SessionInfo": {}}))
        await ws.wait_closed()

    sink = Sink()
    async with FakeServer(script) as fake:
        src = make_source(sink, fake, [], stall_timeout=30)
        task = asyncio.create_task(src.run())
        await wait_until(lambda: src.status()["state"] == "connected")
        loop = asyncio.get_running_loop()
        t0 = loop.time()
        await src.stop()
        await asyncio.wait_for(task, 1)
        assert loop.time() - t0 < 1.0


async def test_stop_before_run_starts_is_honoured():
    src = LiveSource(Sink(), base_url="http://127.0.0.1:9", token=None,
                     http_transport=negotiate_transport([], status=500), **FAST)
    task = asyncio.create_task(src.run())
    await src.stop()  # run() has not executed yet
    await asyncio.wait_for(task, 1)
    assert src.status()["state"] == "idle" and src.status()["reconnects"] == 0


async def test_status_listener_errors_do_not_drop_the_connection():
    async def script(ws, idx, received):
        await core_open(ws, received)
        await ws.send(completion({"SessionInfo": {}}))
        await ws.send(feed("LapCount", {"CurrentLap": 1}, "t"))
        await ws.wait_closed()

    sink = Sink()
    async with FakeServer(script) as fake:
        src = make_source(sink, fake, [])
        src.on_status_change(lambda: 1 / 0)
        task = asyncio.create_task(src.run())
        await wait_until(lambda: len(sink.msgs) >= 2)
        assert src.status()["reconnects"] == 0 and len(fake.requests) == 1
        await src.stop()
        await task


def test_transport_selection(monkeypatch):
    monkeypatch.setenv("F1_TRANSPORT", "legacy")
    monkeypatch.delenv("F1TV_TOKEN", raising=False)
    assert LiveSource(Sink()).transport == "legacy"
    assert LiveSource(Sink(), transport="core").transport == "core"
    assert LiveSource(Sink()).status()["token_present"] is False
    with pytest.raises(ValueError):
        LiveSource(Sink(), transport="carrier-pigeon")


def test_signalr_parsers():
    evs = signalr.parse_core_frame("{}" + RS + '{"type":6}' + RS + "oops" + RS
                                   + '{"type":7,"error":"bye"}' + RS
                                   + '{"type":3,"invocationId":"1","error":"nope"}' + RS)
    assert [e.kind for e in evs] == ["handshake", "ping", "bad", "close", "error"]
    assert evs[3].error == "bye"
    evs = signalr.parse_legacy_frame('{"R":{"A":1},"I":"1","M":[{"H":"Streaming","M":"feed","A":["X",{},"ts"]},5]}')
    assert [e.kind for e in evs] == ["snapshot", "feed", "bad"]
    assert evs[0].data == {"A": 1} and evs[1].topic == "X" and evs[1].ts == "ts"
    assert [e.kind for e in signalr.parse_legacy_frame("{}")] == ["ping"]
    assert [e.kind for e in signalr.parse_legacy_frame('{"I":"1","E":"Hub error"}')] == ["error"]
    assert signalr.parse_legacy_frame("[[")[0].kind == "bad"
    assert signalr.core_connect_url("https://livetiming.formula1.com", "a+b") == \
        "wss://livetiming.formula1.com/signalrcore?id=a%2Bb"
