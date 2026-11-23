"""Decoding of compressed live timing topics.

Topics whose name ends in ``.z`` (``CarData.z``, ``Position.z``) carry a
base64 string holding raw-deflate (no zlib header, ``wbits=-15``) JSON.
"""

from __future__ import annotations

import base64
import binascii
import json
import zlib
from typing import Any


class DecodeError(ValueError):
    """Raised when a compressed payload cannot be decoded."""


def is_compressed_topic(topic: str) -> bool:
    return topic.endswith(".z")


def plain_topic(topic: str) -> str:
    """``CarData.z`` -> ``CarData``; other names are returned unchanged."""
    return topic[:-2] if topic.endswith(".z") else topic


def decode_z(payload: str | bytes) -> Any:
    """Decode a base64 + raw-deflate payload into a Python object."""
    try:
        if isinstance(payload, str):
            payload = payload.encode("ascii", errors="strict")
        raw = base64.b64decode(payload, validate=False)
        text = zlib.decompress(raw, wbits=-15)
        return json.loads(text)
    except (binascii.Error, zlib.error, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise DecodeError(f"cannot decode compressed payload: {exc}") from exc


def encode_z(obj: Any) -> str:
    """Inverse of :func:`decode_z`; used by the demo generator and tests."""
    raw = json.dumps(obj, separators=(",", ":")).encode()
    co = zlib.compressobj(level=9, wbits=-15)
    return base64.b64encode(co.compress(raw) + co.flush()).decode("ascii")


def decode_topic(topic: str, data: Any) -> tuple[str, Any]:
    """Return ``(plain_topic, decoded_data)`` for any topic.

    Non-compressed topics pass through. Compressed topics whose payload is
    already a dict (e.g. produced by a converter) also pass through.
    """
    if is_compressed_topic(topic):
        if isinstance(data, (str, bytes)):
            return plain_topic(topic), decode_z(data)
        return plain_topic(topic), data
    return topic, data
