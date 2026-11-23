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
