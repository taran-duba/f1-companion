"""End to end: real uvicorn server on the demo fixture, read over HTTP/SSE."""

import asyncio
import json
import socket

import httpx
import pytest
import uvicorn

from f1live.manager import DEMO_PATH
from f1live.server import create_app

pytestmark = pytest.mark.skipif(not DEMO_PATH.is_file(), reason="demo fixture missing")


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


async def _events(client: httpx.AsyncClient, n: int, timeout: float = 15.0) -> list[tuple[str, dict]]:
    """Read the first ``n`` SSE events from a fresh connection."""
    out: list[tuple[str, dict]] = []
    event = None

    async def read() -> None:
        nonlocal event
        async with client.stream("GET", "/api/stream") as resp:
            assert resp.headers["content-type"].startswith("text/event-stream")
            async for line in resp.aiter_lines():
                if line.startswith("event: "):
                    event = line[7:]
                elif line.startswith("data: ") and event:
                    out.append((event, json.loads(line[6:])))
                    if len(out) >= n:
                        return

    await asyncio.wait_for(read(), timeout)
    return out


@pytest.fixture
async def server():
    port = _free_port()
    config = uvicorn.Config(create_app("demo"), host="127.0.0.1", port=port, log_level="warning")
    srv = uvicorn.Server(config)
    task = asyncio.create_task(srv.serve())
    async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", timeout=10) as client:
        for _ in range(100):
            try:
                if (await client.get("/api/health")).status_code == 200:
                    break
            except httpx.TransportError:
                await asyncio.sleep(0.05)
        yield client
    srv.should_exit = True
    await asyncio.wait_for(task, 10)


async def test_stream_starts_with_snapshot_then_patches(server):
    await server.post("/api/replay", json={"action": "speed", "value": 30})
    events = await _events(server, 6)
    kinds = [k for k, _ in events]
    # Status and snapshot come first on every connection; patches follow.
    assert kinds[0] == "status"
    assert kinds[1] == "snapshot"
    assert "patch" in kinds[2:]
    state = events[1][1]["state"]
    assert len(state["DriverList"]) == 20
    assert "CarData.z" not in state and "Position.z" not in state


async def test_seek_then_reconnect_gets_mid_race_snapshot(server):
    r = await server.post("/api/replay", json={"action": "seek", "value": 2400})
    assert r.status_code == 200 and r.json()["source"]["position"] == pytest.approx(2400, abs=2)
    await server.post("/api/replay", json={"action": "pause"})
    events = await _events(server, 2)
    snap = events[1][1]["state"]
    assert snap["LapCount"]["CurrentLap"] > 20
    laps = snap["Derived"]["LapHistory"]
    assert laps and max(len(v) for v in laps.values()) > 20
    assert snap["Derived"]["TrackMap"]["closed"] is True
    assert snap["Feed"]["telemetry"] is True
    # REST views agree with the stream.
    num = next(iter(snap["DriverList"]))
    tel = (await server.get(f"/api/telemetry/{num}", params={"window": 30})).json()
    assert len(tel["speed"]) > 10


async def test_bad_requests_are_rejected_cleanly(server):
    assert (await server.post("/api/replay", json={"action": "explode"})).status_code == 422
    assert (await server.post("/api/replay", json={"action": "speed", "value": 0})).status_code == 400
    assert (await server.post("/api/source", json={"kind": "replay", "file": "../../etc/passwd"})).status_code == 400
    assert (await server.get("/api/telemetry/abc")).status_code == 400
