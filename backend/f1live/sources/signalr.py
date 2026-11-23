"""SignalR protocol framing for the F1 live timing feed.

Two transports are supported:

``core``  (default) ASP.NET Core SignalR, JSON hub protocol.
          ``POST /signalrcore/negotiate?negotiateVersion=1`` then
          ``wss://.../signalrcore?id=<token>``. Messages are JSON objects
          terminated by ``\\x1e``; several may share one websocket frame.

``legacy`` ASP.NET SignalR 1.5 ("classic"). ``GET /signalr/negotiate`` then
          ``wss://.../signalr/connect?...``. One JSON object per frame.

This module is pure parsing/URL building (no I/O) so it can be unit tested
without a network. Parsers never raise on bad input: they return
:class:`Event` objects, using ``kind="bad"`` for anything malformed.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit

log = logging.getLogger(__name__)

RS = "\x1e"  # SignalR Core record separator
HUB = "Streaming"
LEGACY_CONNECTION_DATA = json.dumps([{"name": HUB}], separators=(",", ":"))
LEGACY_CLIENT_PROTOCOL = "1.5"
SUBSCRIBE_ID = "1"

TRANSPORTS = ("core", "legacy")


@dataclass(slots=True)
class Event:
    """A parsed protocol event.

    kind:
      ``snapshot``  data = dict topic -> payload (Subscribe result)
      ``feed``      topic, data, ts
      ``ping``      keepalive (core type 6, legacy ``{}``)
      ``handshake`` core handshake response (``error`` set on failure)
      ``close``     server close (core type 7); ``error`` may be set
      ``error``     invocation/hub error reported by the server
      ``other``     valid but irrelevant message (e.g. legacy init frame)
      ``bad``       malformed; ``error`` describes why
    """

    kind: str
    topic: str = ""
    data: Any = None
    ts: str = ""
    error: str | None = None
    raw: Any = field(default=None, repr=False)


# ---------------------------------------------------------------- URLs

def _ws_base(base_url: str) -> tuple[str, str, str]:
    parts = urlsplit(base_url)
    scheme = {"https": "wss", "http": "ws", "wss": "wss", "ws": "ws"}.get(parts.scheme, "wss")
    return scheme, parts.netloc, parts.path.rstrip("/")


def http_base(base_url: str) -> str:
    parts = urlsplit(base_url)
    scheme = {"wss": "https", "ws": "http"}.get(parts.scheme, parts.scheme or "https")
    return urlunsplit((scheme, parts.netloc, parts.path.rstrip("/"), "", ""))


def core_negotiate_url(base_url: str) -> str:
    return f"{http_base(base_url)}/signalrcore/negotiate?negotiateVersion=1"


def core_connect_url(base_url: str, connection_token: str) -> str:
    scheme, netloc, path = _ws_base(base_url)
    return f"{scheme}://{netloc}{path}/signalrcore?id={quote(connection_token, safe='')}"


def legacy_negotiate_url(base_url: str) -> str:
    return (f"{http_base(base_url)}/signalr/negotiate?connectionData={quote(LEGACY_CONNECTION_DATA, safe='')}"
            f"&clientProtocol={LEGACY_CLIENT_PROTOCOL}")


def legacy_connect_url(base_url: str, connection_token: str) -> str:
    scheme, netloc, path = _ws_base(base_url)
    return (f"{scheme}://{netloc}{path}/signalr/connect?clientProtocol={LEGACY_CLIENT_PROTOCOL}"
            f"&transport=webSockets&connectionToken={quote(connection_token, safe='')}"
            f"&connectionData={quote(LEGACY_CONNECTION_DATA, safe='')}")


# ---------------------------------------------------------- outgoing

def core_handshake() -> str:
    return json.dumps({"protocol": "json", "version": 1}, separators=(",", ":")) + RS


def core_subscribe(topics: list[str], invocation_id: str = SUBSCRIBE_ID) -> str:
    msg = {"type": 1, "target": "Subscribe", "arguments": [list(topics)], "invocationId": invocation_id}
    return json.dumps(msg, separators=(",", ":")) + RS


def core_ping() -> str:
    return '{"type":6}' + RS


def legacy_subscribe(topics: list[str], invocation_id: int = 1) -> str:
    return json.dumps({"H": HUB, "M": "Subscribe", "A": [list(topics)], "I": invocation_id},
                      separators=(",", ":"))


def frame_text(frame: str | bytes) -> str:
    if isinstance(frame, (bytes, bytearray, memoryview)):
        return bytes(frame).decode("utf-8", errors="replace")
    return frame


def _short(text: str, n: int = 120) -> str:
    return text if len(text) <= n else text[:n] + "..."


# ------------------------------------------------------------ core in

def _feed_event(args: Any, raw: Any) -> Event:
    if not isinstance(args, list) or len(args) < 2 or not isinstance(args[0], str) or not args[0]:
        return Event("bad", error=f"feed with bad arguments: {_short(repr(args))}", raw=raw)
    ts = args[2] if len(args) > 2 and isinstance(args[2], str) else ""
    return Event("feed", topic=args[0], data=args[1], ts=ts, raw=raw)


def parse_core_message(obj: Any, subscribe_id: str = SUBSCRIBE_ID) -> Event:
    if not isinstance(obj, dict):
        return Event("bad", error="message is not a JSON object", raw=obj)
    mtype = obj.get("type")
    if mtype is None:
        # Handshake response: "{}" or {"error": "..."}
        return Event("handshake", error=obj.get("error"), raw=obj)
    if mtype == 1:
        target = obj.get("target")
        if isinstance(target, str) and target.lower() == "feed":
            return _feed_event(obj.get("arguments"), obj)
        return Event("other", raw=obj)
    if mtype == 3:
        if str(obj.get("invocationId")) != subscribe_id:
            return Event("other", raw=obj)
        if obj.get("error"):
            return Event("error", error=str(obj["error"]), raw=obj)
        result = obj.get("result")
        if not isinstance(result, dict):
            return Event("bad", error="subscribe completion without a dict result", raw=obj)
        return Event("snapshot", data=result, raw=obj)
    if mtype == 6:
        return Event("ping", raw=obj)
    if mtype == 7:
        return Event("close", error=obj.get("error"), raw=obj)
    return Event("other", raw=obj)


def parse_core_frame(frame: str | bytes, subscribe_id: str = SUBSCRIBE_ID) -> list[Event]:
    """Split a websocket frame on ``\\x1e`` and parse each JSON message."""
    out: list[Event] = []
    for part in frame_text(frame).split(RS):
        if not part.strip():
            continue
        try:
            obj = json.loads(part)
        except (ValueError, RecursionError) as exc:  # RecursionError: absurdly nested JSON
            out.append(Event("bad", error=f"invalid JSON ({type(exc).__name__}): {_short(part)}"))
            continue
        out.append(parse_core_message(obj, subscribe_id))
    return out


# ---------------------------------------------------------- legacy in

def parse_legacy_frame(frame: str | bytes, subscribe_id: str = SUBSCRIBE_ID) -> list[Event]:
    """Parse one classic SignalR frame into zero or more events."""
    text = frame_text(frame).strip()
    if not text:
        return [Event("ping")]
    try:
        obj = json.loads(text)
    except (ValueError, RecursionError) as exc:  # RecursionError: absurdly nested JSON
        return [Event("bad", error=f"invalid JSON ({type(exc).__name__}): {_short(text)}")]
    if not isinstance(obj, dict):
        return [Event("bad", error="frame is not a JSON object", raw=obj)]
    if not obj:
        return [Event("ping", raw=obj)]
    out: list[Event] = []
    if "I" in obj and str(obj.get("I")) == subscribe_id:
        if obj.get("E"):
            out.append(Event("error", error=str(obj["E"]), raw=obj))
        elif isinstance(obj.get("R"), dict):
            out.append(Event("snapshot", data=obj["R"], raw=obj))
        else:
            out.append(Event("bad", error="subscribe response without a dict R", raw=obj))
    msgs = obj.get("M")
    if msgs is not None:
        if not isinstance(msgs, list):
            out.append(Event("bad", error="M is not a list", raw=obj))
        else:
            for m in msgs:
                if not isinstance(m, dict):
                    out.append(Event("bad", error="M entry is not an object", raw=m))
                    continue
                method = m.get("M")
                if isinstance(method, str) and method.lower() == "feed":
                    out.append(_feed_event(m.get("A"), m))
                else:
                    out.append(Event("other", raw=m))
    if not out:
        out.append(Event("other", raw=obj))  # init frame {"C":..,"S":1}, group tokens, etc.
    return out
