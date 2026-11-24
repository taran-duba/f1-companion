"""Team radio: path validation, local clips next to a replay, upstream fetch."""

from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from f1live import radio
from f1live.manager import DEMO_PATH
from f1live.messages import Message
from f1live.server import create_app
from f1live.state import StateStore

SESSION = {"Path": "2024/2024-03-02_Bahrain_Grand_Prix/2024-03-02_Race/"}
CLIP = "TeamRadio/MAXVER01_1_20240302_154517.mp3"


@pytest.mark.parametrize("path", [
    "", "TeamRadio/../credentials.json", "TeamRadio/../../etc/passwd.mp3", "/etc/passwd.mp3",
    "TeamRadio/a/b.mp3", "https://evil.example/TeamRadio/x.mp3", "TeamRadio/x.exe", "TeamRadio/x.mp3.txt",
    "teamradio/x.mp3", "TeamRadio/..mp3", "TeamRadio/x%2F..mp3",
])
def test_rejects_invalid_paths(path):
    with pytest.raises(radio.RadioError) as exc:
        radio.parse_path(path)
    assert exc.value.status == 400


def test_content_types():
    assert radio.parse_path("TeamRadio/A_1.mp3") == ("A_1.mp3", "audio/mpeg")
    assert radio.parse_path("TeamRadio/A_1.m4a") == ("A_1.m4a", "audio/mp4")
    assert radio.parse_path("TeamRadio/A_1.wav") == ("A_1.wav", "audio/wav")


def _transport(calls: list, status: int = 200, body: bytes = b"ID3audio"):
    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        return httpx.Response(status, content=body)
    return httpx.MockTransport(handler)


async def test_local_clip_next_to_recording(tmp_path):
    (tmp_path / "radio").mkdir()
    (tmp_path / "radio" / "ABC_1.m4a").write_bytes(b"m4a-bytes")
    src = SimpleNamespace(path=str(tmp_path / "race.jsonl.gz"))
    calls: list = []
    f = radio.RadioFetcher(transport=_transport(calls))
    assert await f.get("TeamRadio/ABC_1.m4a", src, SESSION) == (b"m4a-bytes", "audio/mp4")
    assert calls == []


async def test_upstream_fetch_sends_token_and_caches(monkeypatch):
    monkeypatch.setenv("F1TV_TOKEN", "tok-123")
    calls: list = []
    f = radio.RadioFetcher(transport=_transport(calls))
    for _ in range(2):
        assert await f.get(CLIP, SimpleNamespace(path=None), SESSION) == (b"ID3audio", "audio/mpeg")
    assert len(calls) == 1
    assert str(calls[0].url) == radio.STATIC_BASE + SESSION["Path"] + CLIP
    assert calls[0].headers["Authorization"] == "Bearer tok-123"


async def test_cache_is_bounded(monkeypatch):
    monkeypatch.delenv("F1TV_TOKEN", raising=False)
    calls: list = []
    f = radio.RadioFetcher(transport=_transport(calls), cache_size=2)
    for n in (1, 2, 3, 1):
        await f.get(f"TeamRadio/X_{n}.mp3", None, SESSION)
    assert len(calls) == 4 and "Authorization" not in calls[0].headers
    assert len(f._cache) == 2


@pytest.mark.parametrize("session", [None, {}, {"Path": "../../x/"}, {"Path": "https://evil.example/"}])
async def test_missing_or_bad_session_path_is_404(session):
    calls: list = []
    f = radio.RadioFetcher(transport=_transport(calls))
    with pytest.raises(radio.RadioError) as exc:
        await f.get(CLIP, None, session)
    assert exc.value.status == 404 and calls == []


async def test_upstream_failure_is_404():
    f = radio.RadioFetcher(transport=_transport([], status=403))
    with pytest.raises(radio.RadioError) as exc:
        await f.get(CLIP, None, SESSION)
    assert exc.value.status == 404 and "403" in exc.value.detail

    def boom(req):
        raise httpx.ConnectTimeout("timed out")
    f = radio.RadioFetcher(transport=httpx.MockTransport(boom))
    with pytest.raises(radio.RadioError) as exc:
        await f.get(CLIP, None, SESSION)
    assert exc.value.status == 404


def test_team_radio_reaches_public_state():
    store = StateStore()
    store.apply_message(Message(t=0, topic="TeamRadio", data={"Captures": []}, snapshot=True))
    store.apply_message(Message(t=1, topic="TeamRadio", data={"Captures": {"0": {"Path": CLIP, "RacingNumber": "1"}}}))
    assert store.snapshot()["TeamRadio"] == {"Captures": [{"Path": CLIP, "RacingNumber": "1"}]}
    assert store.drain_delta()["TeamRadio"] == {"Captures": {"0": {"Path": CLIP, "RacingNumber": "1"}}}


@pytest.mark.skipif(not DEMO_PATH.is_file(), reason="demo fixture missing")
def test_endpoint_serves_demo_clips():
    with TestClient(create_app(initial_source="demo")) as c:
        calls: list = []
        c.app.state.radio.transport = _transport(calls, status=404)
        r = c.get("/api/radio", params={"path": "TeamRadio/ARA_1.m4a"})
        assert r.status_code == 200 and r.headers["content-type"] == "audio/mp4"
        assert r.content == (DEMO_PATH.parent / "radio" / "ARA_1.m4a").read_bytes()
        assert c.get("/api/radio", params={"path": "TeamRadio/../demo_race.jsonl.gz"}).status_code == 400
        assert c.get("/api/radio", params={"path": "TeamRadio/ZZZ_9.exe"}).status_code == 400
        assert c.get("/api/radio").status_code == 400
        # Not on disk: falls back to F1's static server (stubbed to 404 here).
        r = c.get("/api/radio", params={"path": "TeamRadio/ZZZ_9.m4a"})
        assert r.status_code == 404 and "not available" in r.json()["detail"]
        assert len(calls) == 1
