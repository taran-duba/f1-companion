"""Load settings from a ``.env`` file in the repo root.

Real environment variables always win, so ``F1_SOURCE=live python -m f1live serve`` still
overrides the file. Only plain ``KEY=value`` lines are understood (optional ``export``,
single or double quotes, ``#`` comments); that is all ``.env.example`` uses.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


def parse(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, sep, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        values[key] = value
    return values


def load(path: Path = ENV_PATH) -> list[str]:
    """Set variables from ``path`` that aren't already in the environment; return their names."""
    try:
        values = parse(path.read_text())
    except FileNotFoundError:
        return []
    except (OSError, UnicodeDecodeError):
        log.warning("could not read %s", path)
        return []
    applied = []
    for key, value in values.items():
        if value and key not in os.environ:
            os.environ[key] = value
            applied.append(key)
    return applied
