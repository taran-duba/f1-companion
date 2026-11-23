"""F1 TV token saved from the dashboard.

The token lives in a local file (mode 0600) next to the recordings and is copied
into ``F1TV_TOKEN`` so the live source picks it up without a restart. It is never
returned by the API: clients only learn whether one is set and where it came from.
An ``F1TV_TOKEN`` already in the environment at startup wins until the user saves
one from the dashboard, and comes back if that one is cleared.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
CREDENTIALS_PATH = Path(os.environ.get("F1_CREDENTIALS_FILE", ROOT / "data" / "credentials.json"))
ENV_NAME = "F1TV_TOKEN"
MIN_LEN, MAX_LEN = 20, 8192

_env_token = os.environ.get(ENV_NAME) or None
_source: str | None = "environment" if _env_token else None


def normalise(raw: str) -> str:
    """Trim whitespace and a pasted ``Bearer `` prefix; reject anything that isn't one token."""
    token = (raw or "").strip().strip("\"'")
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token or any(c.isspace() for c in token):
        raise ValueError("Paste the token on its own: it should be one long string with no spaces.")
    if len(token) < MIN_LEN:
        raise ValueError("That looks too short to be an F1 TV token.")
    if len(token) > MAX_LEN:
        raise ValueError("That is too long to be an F1 TV token.")
    return token


def source() -> str | None:
    """``"dashboard"``, ``"environment"`` or ``None``."""
    return _source if os.environ.get(ENV_NAME) else None


def load() -> None:
    """At startup: use the saved token unless the environment already provides one."""
    global _source
    if _env_token:
        return
    try:
        data = json.loads(CREDENTIALS_PATH.read_text())
        token = normalise(str(data.get("token", "")))
    except FileNotFoundError:
        return
    except (OSError, ValueError, AttributeError):
        log.warning("ignoring unreadable credentials file %s", CREDENTIALS_PATH)
        return
    os.environ[ENV_NAME] = token
    _source = "dashboard"


def save(raw: str) -> None:
    global _source
    token = normalise(raw)
    CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CREDENTIALS_PATH.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        json.dump({"token": token}, fh)
    os.replace(tmp, CREDENTIALS_PATH)
    os.environ[ENV_NAME] = token
    _source = "dashboard"


def clear() -> None:
    global _source
    try:
        CREDENTIALS_PATH.unlink()
    except FileNotFoundError:
        pass
    if _env_token:
        os.environ[ENV_NAME] = _env_token
        _source = "environment"
    else:
        os.environ.pop(ENV_NAME, None)
        _source = None
