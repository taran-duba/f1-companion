"""Saving and clearing the F1 TV token from the dashboard."""

import pytest
from fastapi.testclient import TestClient

from f1live import credentials
from f1live.server import create_app

TOKEN = "eyJhbGciOiJSUzI1NiJ9.payload.signature-0123456789"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(credentials, "CREDENTIALS_PATH", tmp_path / "credentials.json")
    monkeypatch.setattr(credentials, "_env_token", None)
    monkeypatch.setattr(credentials, "_source", None)
    monkeypatch.delenv("F1TV_TOKEN", raising=False)
    with TestClient(create_app(initial_source="none")) as c:
        yield c


def test_save_and_clear_round_trip(client):
    assert client.get("/api/status").json()["token_present"] is False
    r = client.post("/api/credentials", json={"token": f"Bearer {TOKEN}\n"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_present"] is True and body["token_source"] == "dashboard"
    assert TOKEN not in r.text
    assert credentials.CREDENTIALS_PATH.stat().st_mode & 0o777 == 0o600

    r = client.delete("/api/credentials")
    assert r.json()["token_present"] is False and r.json()["token_source"] is None
    assert not credentials.CREDENTIALS_PATH.exists()


@pytest.mark.parametrize("bad", ["", "short", "two words that are long enough to pass length"])
def test_rejects_malformed_tokens(client, bad):
    r = client.post("/api/credentials", json={"token": bad})
    assert r.status_code == 400
    assert client.get("/api/status").json()["token_present"] is False


def test_environment_token_returns_after_clear(client, monkeypatch):
    monkeypatch.setattr(credentials, "_env_token", "env-token-0123456789-abcdef")
    client.post("/api/credentials", json={"token": TOKEN})
    body = client.delete("/api/credentials").json()
    assert body["token_present"] is True and body["token_source"] == "environment"


# --- sign in with email and password ---------------------------------------------------------

import httpx  # noqa: E402

from f1live import f1auth  # noqa: E402

PASSWORD = "hunter2-correct-horse"


def _stub(monkeypatch, handler):
    real = f1auth.login

    async def login(email, password):
        return await real(email, password, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(f1auth, "login", login)


def test_login_saves_only_the_token(client, monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"], seen["json"], seen["url"] = request.headers, request.read(), str(request.url)
        return httpx.Response(200, json={"data": {"subscriptionToken": TOKEN}})

    _stub(monkeypatch, handler)
    r = client.post("/api/credentials/login", json={"email": " me@example.com ", "password": PASSWORD})
    assert r.status_code == 200
    assert r.json()["token_present"] is True and r.json()["token_source"] == "dashboard"
    assert TOKEN not in r.text and PASSWORD not in r.text
    assert seen["url"] == f1auth.AUTH_URL
    assert seen["headers"]["apikey"] == f1auth.API_KEY and "Mozilla" in seen["headers"]["user-agent"]
    assert b'"Login":"me@example.com"' in seen["json"].replace(b" ", b"")
    saved = credentials.CREDENTIALS_PATH.read_text()
    assert TOKEN in saved and PASSWORD not in saved


@pytest.mark.parametrize(
    ("status", "expect"),
    [(401, 401), (403, 401), (429, 429), (500, 502)],
)
def test_login_failures_are_clear_and_save_nothing(client, monkeypatch, status, expect):
    _stub(monkeypatch, lambda request: httpx.Response(status, json={"detail": PASSWORD}))
    r = client.post("/api/credentials/login", json={"email": "me@example.com", "password": PASSWORD})
    assert r.status_code == expect
    assert PASSWORD not in r.text
    assert client.get("/api/status").json()["token_present"] is False


def test_login_without_a_token_in_the_reply(client, monkeypatch):
    _stub(monkeypatch, lambda request: httpx.Response(200, json={"data": {}}))
    r = client.post("/api/credentials/login", json={"email": "me@example.com", "password": PASSWORD})
    assert r.status_code == 502
    assert client.get("/api/status").json()["token_present"] is False


def test_login_network_error(client, monkeypatch):
    def boom(request):
        raise httpx.ConnectError("down")

    _stub(monkeypatch, boom)
    r = client.post("/api/credentials/login", json={"email": "me@example.com", "password": PASSWORD})
    assert r.status_code == 502 and "reach" in r.json()["detail"]
