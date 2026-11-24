"""Live F1 timing source over SignalR (Core or legacy transport).

Every successful (re)connection starts from a fresh Subscribe snapshot:
``sink.reset()`` is called, each snapshot topic is applied with
``snapshot=True``, then feed updates follow. Payloads are passed through
raw (``.z`` topics stay base64 strings; the store decodes them).

Environment:
  ``F1_TRANSPORT``  ``core`` (default) or ``legacy``
  ``F1TV_TOKEN``    optional F1 TV subscription token, sent as
                    ``Authorization: Bearer`` on negotiate and connect.

Manual probe (one short connection, prints what the endpoint serves)::

    python -m f1live.sources.live --probe [--transport legacy] [--seconds 10]
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from typing import Any, Callable

import httpx
from websockets.asyncio.client import connect as ws_connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

from ..messages import Message, utc_iso
from . import signalr
from .base import MessageSink, Source

log = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://livetiming.formula1.com"
DEFAULT_TOPICS: tuple[str, ...] = (
    "Heartbeat", "CarData.z", "Position.z", "ExtrapolatedClock", "TimingStats", "TimingAppData",
    "WeatherData", "TrackStatus", "DriverList", "RaceControlMessages", "SessionInfo", "SessionData",
    "LapCount", "TimingData", "SessionStatus", "TeamRadio",
)
TELEMETRY_TOPICS = ("CarData.z", "Position.z")
# Applied first so consumers (and the recorder's file name) see them early.
_SNAPSHOT_FIRST = ("SessionInfo", "DriverList")
LEGACY_UA = "BestHTTP"
WS_MAX_SIZE = 64 * 1024 * 1024

RecorderCallback = Callable[[Message], Any]
_ENV = object()


class LiveError(Exception):
    """A connection attempt failed; the message is shown in status."""


class AuthError(LiveError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


class StallError(LiveError):
    pass


def describe_http_error(status: int, where: str, token_present: bool) -> LiveError:
    if status in (401, 403):
        label = "401 Unauthorized" if status == 401 else "403 Forbidden"
        if token_present:
            why = "the F1TV_TOKEN was rejected (expired or invalid?)"
        else:
            why = "live timing requires an F1 TV token for this endpoint (set F1TV_TOKEN)"
        return AuthError(status, f"{label}: {why} [{where}]")
    return LiveError(f"HTTP {status} from {where}")


def describe_exception(exc: BaseException) -> str:
    if isinstance(exc, LiveError):
        return str(exc)
    if isinstance(exc, ConnectionClosed):
        rc = exc.rcvd
        if rc is None:
            return "connection lost (no close frame)"
        return f"connection closed by server (code {rc.code}{', ' + rc.reason if rc.reason else ''})"
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return "timed out connecting"
    if isinstance(exc, httpx.HTTPError):
        return f"negotiate failed: {type(exc).__name__}: {exc}"
    if isinstance(exc, OSError):
        return f"network error: {exc}"
    return f"{type(exc).__name__}: {exc}"


class LiveSource(Source):
    kind = "live"

    def __init__(
        self,
        sink: MessageSink,
        *,
        transport: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        topics: list[str] | tuple[str, ...] | None = None,
        token: Any = _ENV,
        recorder: RecorderCallback | None = None,
        http_transport: httpx.AsyncBaseTransport | None = None,
        backoff_initial: float = 1.0,
        backoff_max: float = 60.0,
        auth_backoff_min: float = 15.0,
        stable_after: float = 60.0,
        stall_timeout: float = 30.0,
        connect_timeout: float = 15.0,
        keepalive_interval: float = 15.0,
        ws_proxy: Any = True,
    ) -> None:
        super().__init__(sink)
        transport = (transport or os.environ.get("F1_TRANSPORT") or "core").strip().lower()
        if transport not in signalr.TRANSPORTS:
            raise ValueError(f"unknown transport {transport!r}; expected one of {signalr.TRANSPORTS}")
        self.transport = transport
        self.base_url = base_url.rstrip("/")
        self.topics = list(topics) if topics else list(DEFAULT_TOPICS)
        if token is _ENV:
            token = os.environ.get("F1TV_TOKEN") or None
        self._token: str | None = token.strip() if isinstance(token, str) and token.strip() else None
        self._recorder = recorder
        self._http_transport = http_transport
        self.backoff_initial = backoff_initial
        self.backoff_max = backoff_max
        self.auth_backoff_min = auth_backoff_min
        self.stable_after = stable_after
        self.stall_timeout = stall_timeout
        self.connect_timeout = connect_timeout
        self.keepalive_interval = keepalive_interval
        self.ws_proxy = ws_proxy

        self._state = "idle"
        self._t0 = time.monotonic()
        self._stop_evt = asyncio.Event()  # not loop-bound until awaited (3.10+)
        self._done_evt: asyncio.Event | None = None
        self._attempt_task: asyncio.Task | None = None
        self._attempts = 0
        self.reconnects = 0
        self.messages = 0
        self.bad_frames = 0
        self._connected_since: str | None = None
        self._connected_mono: float | None = None
        self._last_message_at: str | None = None
        self._last_error: str | None = None
        self._missing: list[str] = []
        self._telemetry = False
        self._retry_at: float | None = None

    # ------------------------------------------------------------ public

    @property
    def token_present(self) -> bool:
        return self._token is not None

    def set_recorder(self, recorder: RecorderCallback | None) -> None:
        self._recorder = recorder

    def status(self) -> dict[str, Any]:
        retry_in = None
        if self._retry_at is not None:
            retry_in = round(max(0.0, self._retry_at - time.monotonic()), 1)
        return {
            "kind": self.kind,
            "state": self._state,
            "transport": self.transport,
            "url": self.base_url,
            "token_present": self.token_present,
            "connected_since": self._connected_since,
            "last_message_at": self._last_message_at,
            "messages": self.messages,
            "reconnects": self.reconnects,
            "missing_topics": list(self._missing),
            "telemetry_available": self._telemetry,
            "last_error": self._last_error,
            "retry_in": retry_in,
            "bad_frames": self.bad_frames,
        }

    async def run(self) -> None:
        if self._done_evt is not None and not self._done_evt.is_set():
            raise RuntimeError("LiveSource.run() is already running")
        if self._stop_evt.is_set():  # stop() was called before run() got going
            self._set_state("idle")
            return
        self._done_evt = asyncio.Event()
        self._t0 = time.monotonic()
        backoff = self.backoff_initial
        try:
            while not self._stop_evt.is_set():
                if self._attempts == 0:
                    self._set_state("connecting")
                elif self._state != "error":
                    self._set_state("reconnecting")
                self._attempts += 1
                self._attempt_task = asyncio.create_task(self._connect_once())
                err: BaseException | None = None
                try:
                    await self._attempt_task
                except asyncio.CancelledError:
                    if self._stop_evt.is_set():
                        break
                    raise
                except Exception as exc:  # noqa: BLE001 - never crash the loop
                    err = exc
                finally:
                    self._attempt_task = None
                    stable = (self._connected_mono is not None
                              and time.monotonic() - self._connected_mono >= self.stable_after)
                    self._connected_since = None
                    self._connected_mono = None
                if self._stop_evt.is_set():
                    break
                if stable:
                    backoff = self.backoff_initial
                if err is None:
                    err = LiveError("connection ended")
                self._last_error = describe_exception(err)
                if isinstance(err, AuthError):
                    delay = min(self.backoff_max, max(backoff, self.auth_backoff_min))
                    log.warning("live: %s; retrying in %.0fs", self._last_error, delay)
                    self._set_state("error")
                else:
                    delay = backoff
                    log.warning("live: %s; reconnecting in %.1fs", self._last_error, delay)
                    self._set_state("reconnecting")
                backoff = min(self.backoff_max, max(backoff, delay) * 2)
                delay *= random.uniform(0.8, 1.2)
                self.reconnects += 1
                await self._sleep(delay)
        finally:
            self._retry_at = None
            self._state = "idle"
            self._done_evt.set()
            self._status_changed()

    async def stop(self) -> None:
        """Stop for good (a stopped source cannot be restarted; make a new one)."""
        self._stop_evt.set()
        if self._done_evt is None or self._done_evt.is_set():
            self._set_state("idle")
            return
        task = self._attempt_task
        if task is not None and not task.done():
            task.cancel()
        try:
            await asyncio.wait_for(self._done_evt.wait(), 5.0)
        except (TimeoutError, asyncio.TimeoutError):
            log.warning("live: run() did not stop within 5s")

    # ----------------------------------------------------------- helpers

    def _status_changed(self) -> None:
        try:
            super()._status_changed()
        except Exception:  # noqa: BLE001 - a listener bug must not drop the connection
            log.exception("live: status listener failed")

    def _set_state(self, state: str) -> None:
        if state != self._state:
            self._state = state
            self._status_changed()

    def _now_t(self) -> float:
        return time.monotonic() - self._t0

    async def _sleep(self, delay: float) -> None:
        self._retry_at = time.monotonic() + delay
        try:
            await asyncio.wait_for(self._stop_evt.wait(), delay)
        except (TimeoutError, asyncio.TimeoutError):
            pass
        finally:
            self._retry_at = None

    def _auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"} if self._token else {}

    def _emit(self, msg: Message) -> None:
        self.messages += 1
        self._last_message_at = utc_iso()
        try:
            self.sink.apply_message(msg)
        except Exception:  # noqa: BLE001 - a store bug must not kill the feed
            log.exception("live: sink failed on %s", msg.topic)
        if self._recorder is not None:
            try:
                self._recorder(msg)
            except Exception:  # noqa: BLE001
                log.exception("live: recorder failed on %s", msg.topic)

    # --------------------------------------------------------- negotiate

    async def _negotiate(self) -> tuple[str, dict[str, str]]:
        """Return (websocket URL, extra websocket headers)."""
        async with httpx.AsyncClient(transport=self._http_transport, timeout=self.connect_timeout,
                                     follow_redirects=True) as client:
            if self.transport == "core":
                url = signalr.core_negotiate_url(self.base_url)
                resp = await client.post(url, headers=self._auth_headers())
            else:
                url = signalr.legacy_negotiate_url(self.base_url)
                headers = {"User-Agent": LEGACY_UA, "Accept-Encoding": "gzip,identity", **self._auth_headers()}
                resp = await client.get(url, headers=headers)
            # Load-balancer stickiness (e.g. AWSALB/AWSALBCORS): the websocket
            # must reach the node that issued the connection token.
            cookies = [f"{c.name}={c.value}" for c in client.cookies.jar if c.value is not None]
        if resp.status_code >= 400:
            raise describe_http_error(resp.status_code, "negotiate", self.token_present)
        try:
            data = resp.json()
        except ValueError as exc:
            raise LiveError(f"negotiate returned invalid JSON: {exc}") from exc
        if not isinstance(data, dict):
            raise LiveError("negotiate returned a non-object")
        ws_headers = self._auth_headers()
        if cookies:
            ws_headers["Cookie"] = "; ".join(cookies)
        if self.transport == "core":
            token = data.get("connectionToken") or data.get("connectionId")
            if not token:
                if data.get("error"):
                    raise LiveError(f"negotiate error: {data['error']}")
                if data.get("url"):
                    raise LiveError(f"negotiate redirected to {data['url']} (not supported)")
                raise LiveError("negotiate response has no connectionToken")
            return signalr.core_connect_url(self.base_url, str(token)), ws_headers
        token = data.get("ConnectionToken")
        if not token:
            raise LiveError("negotiate response has no ConnectionToken")
        ws_headers["Accept-Encoding"] = "gzip,identity"
        return signalr.legacy_connect_url(self.base_url, str(token)), ws_headers

    # ----------------------------------------------------------- connect

    async def _connect_once(self) -> None:
        url, headers = await self._negotiate()
        ua = LEGACY_UA if self.transport == "legacy" else "f1live/1.0"
        try:
            ws = await ws_connect(url, additional_headers=headers, user_agent_header=ua,
                                  open_timeout=self.connect_timeout, max_size=WS_MAX_SIZE,
                                  proxy=self.ws_proxy)
        except InvalidStatus as exc:
            raise describe_http_error(exc.response.status_code, "websocket connect",
                                      self.token_present) from exc
        keepalive: asyncio.Task | None = None
        try:
            if self.transport == "core":
                await ws.send(signalr.core_handshake())
                keepalive = asyncio.create_task(self._keepalive(ws))
                parse = signalr.parse_core_frame
            else:
                await ws.send(signalr.legacy_subscribe(self.topics))
                parse = signalr.parse_legacy_frame
            await self._read_loop(ws, parse)
        finally:
            if keepalive is not None:
                keepalive.cancel()
            try:
                await asyncio.wait_for(ws.close(), 2.0)
            except BaseException:  # noqa: BLE001 - best effort on the way out
                pass

    async def _keepalive(self, ws: Any) -> None:
        try:
            while True:
                await asyncio.sleep(self.keepalive_interval)
                await ws.send(signalr.core_ping())
        except (asyncio.CancelledError, ConnectionClosed):
            pass
        except Exception:  # noqa: BLE001
            log.debug("live: keepalive send failed", exc_info=True)

    async def _read_loop(self, ws: Any, parse: Callable[[Any], list[signalr.Event]]) -> None:
        have_snapshot = False
        handshake_done = self.transport != "core"
        pending: list[signalr.Event] = []
        deadline = time.monotonic() + self.stall_timeout
        while True:
            try:
                frame = await asyncio.wait_for(ws.recv(), self.stall_timeout)
            except (TimeoutError, asyncio.TimeoutError):
                raise StallError(f"no data for {self.stall_timeout:.0f}s (stalled); reconnecting") from None
            for ev in parse(frame):
                kind = ev.kind
                if kind == "bad":
                    self.bad_frames += 1
                    log.warning("live: skipping malformed message: %s", ev.error)
                elif kind == "feed":
                    if have_snapshot:
                        self._handle_feed(ev)
                    elif len(pending) < 10000:
                        pending.append(ev)
                elif kind == "snapshot":
                    self._apply_snapshot(ev.data)
                    have_snapshot = True
                    for p in pending:
                        self._handle_feed(p)
                    pending.clear()
                elif kind == "handshake":
                    if handshake_done:
                        self.bad_frames += 1
                        log.warning("live: skipping unexpected message without a type")
                        continue
                    if ev.error:
                        raise LiveError(f"handshake rejected: {ev.error}")
                    handshake_done = True
                    await ws.send(signalr.core_subscribe(self.topics))
                elif kind == "error":
                    raise LiveError(f"subscribe failed: {ev.error}")
                elif kind == "close":
                    raise LiveError(f"server closed the hub connection{': ' + str(ev.error) if ev.error else ''}")
            if not have_snapshot and time.monotonic() > deadline:
                raise StallError(f"no subscribe response within {self.stall_timeout:.0f}s")

    def _apply_snapshot(self, result: dict[str, Any]) -> None:
        try:
            self.sink.reset()
        except Exception:  # noqa: BLE001
            log.exception("live: sink.reset() failed")
        t, ts = self._now_t(), utc_iso()
        order = [tp for tp in _SNAPSHOT_FIRST if tp in result]
        order += [tp for tp in self.topics if tp in result and tp not in order]
        order += [tp for tp in result if tp not in order]
        present = set()
        for topic in order:
            data = result[topic]
            if data is None or not isinstance(topic, str):
                continue
            present.add(topic)
            self._emit(Message(t=t, topic=topic, data=data, ts=ts, snapshot=True))
        self._missing = [tp for tp in self.topics if tp not in present]
        self._telemetry = all(tp in present for tp in TELEMETRY_TOPICS)
        self._connected_since = utc_iso()
        self._connected_mono = time.monotonic()
        self._last_error = None
        if self._missing:
            log.info("live: snapshot missing topics: %s", ", ".join(self._missing))
        self._state = "connected"
        self._status_changed()

    def _handle_feed(self, ev: signalr.Event) -> None:
        self._emit(Message(t=self._now_t(), topic=ev.topic, data=ev.data, ts=ev.ts or utc_iso()))
        if ev.topic in self._missing:
            self._missing.remove(ev.topic)
            if not self._telemetry and not any(tp in self._missing for tp in TELEMETRY_TOPICS):
                self._telemetry = True
            self._status_changed()


if __name__ == "__main__":  # python -m f1live.sources.live --probe
    from .live_probe import main

    raise SystemExit(main())
